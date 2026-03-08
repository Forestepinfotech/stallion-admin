import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SKIP_AUTH_CONTEXT, TREAT_AS_REFRESH_CONTEXT } from './auth.context';
import { LoginPayload, LoginResponse, RefreshResponse } from './auth.types';

const LOGIN_PATH = '/auth/login';
const REFRESH_PATH = '/auth/refresh';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);

  login(payload: LoginPayload): Observable<LoginResponse> {
    const context = new HttpContext().set(SKIP_AUTH_CONTEXT, true);
    return this.http.post<LoginResponse>(LOGIN_PATH, payload, { context });
  }

  refresh(refreshToken: string): Observable<RefreshResponse> {
    const context = new HttpContext().set(SKIP_AUTH_CONTEXT, true).set(TREAT_AS_REFRESH_CONTEXT, true);
    return this.http.post<RefreshResponse>(REFRESH_PATH, { refreshToken }, { context });
  }
}
