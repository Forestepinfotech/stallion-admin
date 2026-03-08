import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { SKIP_AUTH_CONTEXT, TREAT_AS_REFRESH_CONTEXT } from './auth.context';

export const authRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(AuthSessionService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const shouldSkip =
        req.context.get(SKIP_AUTH_CONTEXT) || req.context.get(TREAT_AS_REFRESH_CONTEXT);

      if (shouldSkip || error.status !== 401) {
        return throwError(() => error);
      }

      return session.refreshTokens().pipe(
        switchMap((tokens) =>
          next(
            req.clone({
              setHeaders: { Authorization: `Bearer ${tokens.accessToken}` },
            }),
          ),
        ),
        catchError((refreshErr) => {
          session.logout('refresh_failed');
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
