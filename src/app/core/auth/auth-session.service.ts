import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, defer, finalize, map, shareReplay, throwError } from 'rxjs';
import { AuthApiService } from './auth.api.service';
import { AuthState, AuthTokens, LoginPayload, LoginResponse } from './auth.types';
import { TokenStorageService } from './token-storage.service';
import { RuntimeConfigService } from '../config/runtime-config.service';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly storage = inject(TokenStorageService);
  private readonly authApi = inject(AuthApiService);
  private readonly config = inject(RuntimeConfigService);

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

  login(payload: LoginPayload): Observable<LoginResponse> {
    return this.authApi.login(payload).pipe(
      map((res) => {
        const tokens = this.toTokens(res);
        this.updateState({ tokens, user: res.user ?? this.snapshot.user });
        return res;
      }),
    );
  }

  logout(reason?: string): void {
    console.info('AuthSessionService.logout', reason ?? 'user_action');
    this.refreshInFlight$ = undefined;
    this.storage.clear();
    this.stateSubject.next({ user: null, tokens: null });
  }

  refreshTokens(): Observable<AuthTokens> {
    const current = this.snapshot.tokens;
    if (!current?.refreshToken) {
      this.logout('missing_refresh_token');
      return throwError(() => new Error('No refresh token available'));
    }

    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    this.refreshInFlight$ = defer(() =>
      this.authApi.refresh(current.refreshToken).pipe(
        map((res) => {
          const tokens = this.toTokens(res);
          this.updateState({ tokens, user: res.user ?? this.snapshot.user });
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
    if (!exp) return true;
    return Date.now() + bufferMs >= exp;
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

    const buffer = this.config.snapshot.tokenRefreshLeewaySeconds * 1000;

    if (stored.accessTokenExpiresAt && Date.now() >= stored.accessTokenExpiresAt - buffer) {
      this.storage.clear();
      return { user: null, tokens: null };
    }

    return { user: this.extractUser(stored.accessToken), tokens: stored };
  }

  private toTokens(res: LoginResponse): AuthTokens {
    const now = Date.now();
    const accessExp =
      res.accessTokenExpiresAt ??
      (res.accessTokenExpiresIn ? now + res.accessTokenExpiresIn * 1000 : now + 15 * 60 * 1000);
    const refreshExp =
      res.refreshTokenExpiresAt ??
      (res.refreshTokenExpiresIn ? now + res.refreshTokenExpiresIn * 1000 : undefined);

    return {
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      accessTokenExpiresAt: accessExp,
      refreshTokenExpiresAt: refreshExp,
    };
  }

  private extractUser(token: string | undefined | null) {
    if (!token) return null;
    try {
      const [, payload] = token.split('.');
      const decoded = JSON.parse(atob(payload));
      return {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role,
      };
    } catch {
      return null;
    }
  }
}
