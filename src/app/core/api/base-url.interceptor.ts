import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { RuntimeConfigService } from '../config/runtime-config.service';

const ABSOLUTE_URL = /^https?:\/\//i;

export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(RuntimeConfigService).snapshot;
  if (ABSOLUTE_URL.test(req.url)) return next(req);

  const base = (config.apiBaseUrl || '').replace(/\/$/, '');
  const path = req.url.startsWith('/') ? req.url : `/${req.url}`;
  return next(req.clone({ url: `${base}${path}` }));
};
