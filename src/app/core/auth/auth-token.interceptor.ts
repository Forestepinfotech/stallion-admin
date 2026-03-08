import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthSessionService } from './auth-session.service';
import { SKIP_AUTH_CONTEXT } from './auth.context';

export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(AuthSessionService);

  if (req.context.get(SKIP_AUTH_CONTEXT)) {
    return next(req);
  }

  const token = session.accessToken;
  if (!token || session.isAccessTokenExpired()) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
