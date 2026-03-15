import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, defer, finalize, map, shareReplay, throwError } from 'rxjs';
import { Store } from '@ngrx/store';
import { AuthActions } from '../state/auth/auth.actions';
import { AuthApiService } from './auth.api.service';
import { AuthState, AuthTokens, LoginPayload, LoginResponse } from './auth.types';
import { TokenStorageService } from './token-storage.service';
import { RuntimeConfigService } from '../config/runtime-config.service';
import { Role } from '../types/role.type';

const ALLOWED_ROLES: Role[] = ['admin', 'manager', 'staff'];

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly storage = inject(TokenStorageService);
  private readonly authApi = inject(AuthApiService);
  private readonly config = inject(RuntimeConfigService);
  private readonly store = inject(Store);

  private readonly stateSubject = new BehaviorSubject<AuthState>(this.restoreState());
  readonly state$ = this.stateSubject.asObservable();
  readonly isAuthenticated$ = this.state$.pipe(map((s) => !!s.tokens));

  private refreshInFlight$?: Observable<AuthTokens>;

  get snapshot(): AuthState {
    return this.stateSubject.value;
  }

  get accessToken(): string | null {
    return this.stateSubject.value.tokens?.accessToken ?? null;
  }

  get hasRefreshToken(): boolean {
    return !!this.stateSubject.value.tokens?.refreshToken;
  }

  login(payload: LoginPayload): Observable<LoginResponse> {
    return this.authApi.login(payload).pipe(
      map((res) => {
        const tokens = this.toTokens(res);
        const role = this.normalizeRole(tokens.role);
        if (!role || !ALLOWED_ROLES.includes(role)) {
          this.logout('role_not_allowed');
          throw new Error('Unauthorized role');
        }
        this.updateState({ tokens: { ...tokens, role }, user: res.user ?? this.extractUser(tokens.accessToken, role) });
        this.store.dispatch(AuthActions.loadProfile());
        return res;
      }),
    );
  }

  logout(reason?: string): void {
    console.info('AuthSessionService.logout', reason ?? 'user_action');
    this.refreshInFlight$ = undefined;
    this.storage.clear();
    this.stateSubject.next({ user: null, tokens: null });
    this.store.dispatch(AuthActions.logout());
  }

  refreshTokens(): Observable<AuthTokens> {
    const current = this.snapshot.tokens;
    if (!current?.refreshToken) {
      this.logout('missing_refresh_token');
      return throwError(() => new Error('No refresh token available'));
    }

    if (this.isRefreshTokenExpired()) {
      this.logout('refresh_token_expired');
      return throwError(() => new Error('Refresh token expired'));
    }

    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    this.refreshInFlight$ = defer(() =>
      this.authApi.refresh(current.refreshToken).pipe(
        map((res) => {
          const tokens = this.toTokens(res);
          const role = this.normalizeRole(tokens.role);
          if (!role || !ALLOWED_ROLES.includes(role)) {
            this.logout('role_not_allowed');
            throw new Error('Unauthorized role');
          }
          this.updateState({ tokens: { ...tokens, role }, user: res.user ?? this.snapshot.user });
          return tokens;
        }),
        finalize(() => (this.refreshInFlight$ = undefined)),
        shareReplay(1),
      ),
    );

    return this.refreshInFlight$;
  }

  isAccessTokenExpired(bufferMs: number = this.config.snapshot.tokenRefreshLeewaySeconds * 1000): boolean {
    const exp = this.snapshot.tokens?.accessTokenExpiresAt;
    // If the backend does not send exp, allow the request and let the server decide.
    if (!exp) return false;
    return Date.now() + bufferMs >= exp;
  }

  isRefreshTokenExpired(): boolean {
    const exp = this.snapshot.tokens?.refreshTokenExpiresAt;
    if (!exp) return false;
    return Date.now() >= exp;
  }

  handleAuthError(error: HttpErrorResponse): Observable<never> {
    if (error.status === 401) {
      this.logout('unauthorized');
    }
    return throwError(() => error);
  }

  private updateState(state: AuthState): void {
    if (state.tokens) {
      this.storage.write(state.tokens);
    } else {
      this.storage.clear();
    }
    this.stateSubject.next(state);
  }

  private restoreState(): AuthState {
    const stored = this.storage.read();
    if (!stored) return { user: null, tokens: null };

    if (stored.refreshTokenExpiresAt && Date.now() >= stored.refreshTokenExpiresAt) {
      this.storage.clear();
      return { user: null, tokens: null };
    }

    const state = { user: this.extractUser(stored.accessToken, stored.role), tokens: stored };
    if (state.tokens) {
      this.store.dispatch(AuthActions.loadProfile());
    }
    return state;
  }

  private toTokens(res: LoginResponse): AuthTokens {
    const now = Date.now();
    const accessExp =
      res.accessTokenExpiresAt ??
      (res.accessTokenExpiresIn
        ? now + res.accessTokenExpiresIn * 1000
        : this.decodeExp(res.accessToken) ?? now + 15 * 60 * 1000);
    const refreshExp =
      res.refreshTokenExpiresAt ??
      (res.refreshTokenExpiresIn ? now + res.refreshTokenExpiresIn * 1000 : undefined);
    const role = this.normalizeRole(res.role) ?? this.extractUser(res.accessToken)?.role;

    return {
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      accessTokenExpiresAt: accessExp,
      refreshTokenExpiresAt: refreshExp,
      role,
    };
  }

  private extractUser(token: string | undefined | null, roleHint?: Role | string | null) {
    if (!token) return null;
    try {
      const [, payload] = token.split('.');
      const decoded = JSON.parse(atob(payload));
      const role = this.normalizeRole(roleHint ?? decoded.role);
      if (role && !ALLOWED_ROLES.includes(role)) return null;
      return {
        id: decoded.sub,
        email: decoded.email,
        role,
      };
    } catch {
      return null;
    }
  }

  private normalizeRole(role?: string | Role | null): Role | undefined {
    if (!role) return undefined;
    const r = role.toString().toLowerCase();
    if (ALLOWED_ROLES.includes(r as Role)) return r as Role;
    return undefined;
  }

  private decodeExp(token: string | undefined | null): number | undefined {
    if (!token) return undefined;
    try {
      const [, payload] = token.split('.');
      const decoded = JSON.parse(atob(payload));
      if (decoded.exp) return decoded.exp * 1000;
    } catch {
      return undefined;
    }
    return undefined;
  }
}
