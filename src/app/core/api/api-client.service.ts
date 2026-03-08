import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import * as Api from './generated';

/**
 * Thin wrapper around the Orval-generated functions so components/services
 * only inject a single dependency.
 */
@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly http = inject(HttpClient);

  /**
   * Execute a generated API function with the shared HttpClient instance.
   *
   * Usage:
   *   this.api.call(Api.AuthControllerLogin, payload)
   */
  call<TArgs extends unknown[], TResult>(
    fn: (http: HttpClient, ...args: TArgs) => TResult,
    ...args: TArgs
  ): TResult {
    return fn(this.http, ...args);
  }

  /** Direct access to generated namespace if you need types. */
  get generated() {
    return Api;
  }
}
