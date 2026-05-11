import { Role } from '../types/role.type';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number; // epoch ms
  refreshTokenExpiresAt?: number; // epoch ms
  role?: Role | string;
}

export interface AuthUser {
  id?: string;
  email?: string;
  role?: Role;
  [key: string]: unknown;
}

export interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
}
