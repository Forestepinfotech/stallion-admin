import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthSessionService } from './auth-session.service';

export const authGuard: CanMatchFn = () => {
  const session = inject(AuthSessionService);
  const router = inject(Router);

  if (session.snapshot.tokens && !session.isAccessTokenExpired()) {
    return true;
  }

  if (session.snapshot.tokens) {
    return session.refreshTokens().pipe(
      map(() => true),
      catchError(() => of(router.parseUrl('/login'))),
    );
  }

  return router.parseUrl('/login');
};
