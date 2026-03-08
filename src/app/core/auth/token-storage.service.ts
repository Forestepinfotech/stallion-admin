import { Injectable } from '@angular/core';
import { AuthTokens } from './auth.types';

interface PersistedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt?: number;
  role?: string;
}

const STORAGE_KEY = 'stallion.auth.tokens.v1';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private storage: Storage | null = this.resolveStorage();

  read(): AuthTokens | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedTokens;
      if (!parsed.accessToken || !parsed.refreshToken) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  write(tokens: AuthTokens): void {
    if (!this.storage) return;
    const payload: PersistedTokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      role: tokens.role,
    };
    this.storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  clear(): void {
    this.storage?.removeItem(STORAGE_KEY);
  }

  private resolveStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.sessionStorage;
    } catch {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    }
  }
}
