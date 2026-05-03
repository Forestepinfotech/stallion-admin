import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { RuntimeConfig } from './runtime-config.model';

const LOCALHOST_NAMES = new Set(['localhost', '127.0.0.1']);

function resolveDefaultApiBaseUrl(): string {
  if (typeof window !== 'undefined' && LOCALHOST_NAMES.has(window.location.hostname)) {
    return 'http://localhost:3002';
  }

  return 'https://stallionautolab.com/apis';
}

function resolveRuntimeConfigUrl(): string {
  if (typeof document !== 'undefined') {
    return new URL('assets/runtime-config.json', document.baseURI).toString();
  }

  return 'assets/runtime-config.json';
}

const DEFAULT_CONFIG: RuntimeConfig = {
  apiBaseUrl: resolveDefaultApiBaseUrl(),
  adminGalleryApiBaseUrl: resolveDefaultApiBaseUrl(),
  mediaBaseUrl: 'https://stallio-public.tor1.digitaloceanspaces.com',
  tokenRefreshLeewaySeconds: 20,
};

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly http = inject(HttpClient);
  private readonly configSubject = new BehaviorSubject<RuntimeConfig>(
    DEFAULT_CONFIG,
  );

  readonly config$ = this.configSubject.asObservable();

  get snapshot(): RuntimeConfig {
    return this.configSubject.value;
  }

  async load(): Promise<void> {
    try {
      const cfg = await firstValueFrom(
        this.http.get<RuntimeConfig>(resolveRuntimeConfigUrl()),
      );
      this.configSubject.next({ ...DEFAULT_CONFIG, ...cfg });
    } catch (error) {
      console.warn('Runtime config load failed, using defaults', error);
    }
  }
}
