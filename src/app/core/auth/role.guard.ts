import { inject } from '@angular/core';
import { CanMatchFn, Route, Router, UrlSegment } from '@angular/router';
import { Role } from '../types/role.type';
import { AuthSessionService } from './auth-session.service';

export const roleGuard: CanMatchFn = (route: Route, _segments: UrlSegment[]) => {
  const session = inject(AuthSessionService);
  const router = inject(Router);

  const allowed = (route.data?.['roles'] as Role[] | undefined) ?? [];
  const role = session.snapshot.user?.role;

  if (!role) return router.parseUrl('/login');
  if (allowed.length === 0 || allowed.includes(role)) return true;

  return router.parseUrl(`/${role}`);
};
