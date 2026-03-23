import { Injectable, inject } from '@angular/core';
import { RuntimeConfigService } from '../config/runtime-config.service';

const ABSOLUTE_URL = /^(?:https?:)?\/\//i;
const SPECIAL_URL = /^(?:blob:|data:|assets\/|\/assets\/)/i;

@Injectable({ providedIn: 'root' })
export class MediaUrlService {
  private readonly runtimeConfig = inject(RuntimeConfigService);

  toStoredValue(value: unknown): string {
    return this.extractValue(value);
  }

  resolve(value: unknown): string {
    const source = this.extractValue(value);
    if (!source) {
      return '';
    }

    if (ABSOLUTE_URL.test(source) || SPECIAL_URL.test(source)) {
      return source;
    }

    const baseUrl = (
      this.runtimeConfig.snapshot.mediaBaseUrl ||
      this.runtimeConfig.snapshot.apiBaseUrl ||
      ''
    ).replace(/\/$/, '');
    const path = source.startsWith('/') ? source : `/${source}`;
    return baseUrl ? `${baseUrl}${path}` : path;
  }

  private extractValue(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (!value || typeof value !== 'object') {
      return '';
    }

    const record = value as Record<string, unknown>;
    for (const key of ['endpoint', 'url', 'path', 'src', 'key']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    return '';
  }
}
