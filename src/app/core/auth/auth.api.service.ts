import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SKIP_AUTH_CONTEXT, TREAT_AS_REFRESH_CONTEXT } from './auth.context';
import { LoginPayload, LoginResponse, RefreshResponse } from './auth.types';
import { AuthService as GeneratedAuthService } from '../api/generated/auth/auth.service';

const LOGIN_PATH = '/auth/login';
const REFRESH_PATH = '/auth/refresh';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly api = inject(GeneratedAuthService);

  login(payload: LoginPayload): Observable<LoginResponse> {
    const context = new HttpContext().set(SKIP_AUTH_CONTEXT, true);
    return this.api.authControllerLogin(payload, { context });
  }

  refresh(refreshToken: string): Observable<RefreshResponse> {
    const context = new HttpContext().set(SKIP_AUTH_CONTEXT, true).set(TREAT_AS_REFRESH_CONTEXT, true);
    return this.api.authControllerRefresh({ refreshToken }, { context });
  }
}
