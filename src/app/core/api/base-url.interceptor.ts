import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { RuntimeConfigService } from '../config/runtime-config.service';

const ABSOLUTE_URL = /^https?:\/\//i;

export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(RuntimeConfigService).snapshot;
  if (ABSOLUTE_URL.test(req.url)) return next(req);
  if (req.url.startsWith('/assets') || req.url.includes('assets/')) return next(req);

  const path = req.url.startsWith('/') ? req.url : `/${req.url}`;

  const useAdminGalleryBase =
    path.startsWith('/gallery') || path.startsWith('/uploads/presign');

  const base = (
    (useAdminGalleryBase ? config.adminGalleryApiBaseUrl : config.apiBaseUrl) || ''
  ).replace(/\/$/, '');
  return next(req.clone({ url: `${base}${path}` }));
};
