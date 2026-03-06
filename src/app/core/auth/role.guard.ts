import { inject } from '@angular/core';
import { CanMatchFn, Route, Router, UrlSegment } from '@angular/router';
import { Role } from '../types/role.type';
import { AuthService } from './auth.servies';

export const roleGuard: CanMatchFn = (
  route: Route,
  _segments: UrlSegment[],
) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const allowed = (route.data?.['roles'] as Role[] | undefined) ?? [];
  const role = auth.role;

  if (!role) return router.parseUrl('/login');
  if (allowed.length === 0 || allowed.includes(role)) return true;

  // logged in but wrong role -> send to their role home
  return router.parseUrl(`/${role}`);
};
