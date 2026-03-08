import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { apiBaseUrlInterceptor } from './core/api/base-url.interceptor';
import { authTokenInterceptor } from './core/auth/auth-token.interceptor';
import { authRefreshInterceptor } from './core/auth/auth-refresh.interceptor';
import { rateLimitInterceptor } from './core/api/rate-limit.interceptor';
import { provideRuntimeConfig } from './core/config/runtime-config.provider';
import { authReducer } from './core/state/auth/auth.reducer';
import { AuthEffects } from './core/state/auth/auth.effects';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideStore({ auth: authReducer }),
    provideEffects([AuthEffects]),
    provideStoreDevtools({ maxAge: 25, logOnly: false }),
    ...provideRuntimeConfig(),
    provideHttpClient(
      withInterceptors([
        apiBaseUrlInterceptor,
        authTokenInterceptor,
        authRefreshInterceptor,
        rateLimitInterceptor,
      ]),
    ),
  ],
};
