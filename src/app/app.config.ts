import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { apiBaseUrlInterceptor } from './core/api/base-url.interceptor';
import { authTokenInterceptor } from './core/auth/auth-token.interceptor';
import { authRefreshInterceptor } from './core/auth/auth-refresh.interceptor';
import { rateLimitInterceptor } from './core/api/rate-limit.interceptor';
import { provideRuntimeConfig } from './core/config/runtime-config.provider';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
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
