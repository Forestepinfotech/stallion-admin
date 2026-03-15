import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { SKIP_AUTH_CONTEXT } from './auth.context';

export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(AuthSessionService);

  if (req.context.get(SKIP_AUTH_CONTEXT)) {
    return next(req);
  }

  const token = session.accessToken;
  if (!token) {
    return next(req);
  }

  if (session.isAccessTokenExpired()) {
    if (!session.hasRefreshToken) {
      return next(req);
    }

    return session.refreshTokens().pipe(
      switchMap((tokens) =>
        next(
          req.clone({
            setHeaders: { Authorization: `Bearer ${tokens.accessToken}` },
          }),
        ),
      ),
      catchError(() => next(req)),
    );
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
