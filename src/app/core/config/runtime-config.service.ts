import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { RuntimeConfig } from './runtime-config.model';

const DEFAULT_CONFIG: RuntimeConfig = {
  apiBaseUrl: 'http://178.128.228.186',
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
        this.http.get<RuntimeConfig>('/assets/runtime-config.json'),
      );
      this.configSubject.next({ ...DEFAULT_CONFIG, ...cfg });
    } catch (error) {
      console.warn('Runtime config load failed, using defaults', error);
    }
  }
}
