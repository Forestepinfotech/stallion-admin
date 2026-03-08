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

export interface LoginPayload {
  identifier: string;
  password: string;
}

export interface LoginResponse extends AuthTokens {
  user?: AuthUser;
  accessTokenExpiresIn?: number;
  refreshTokenExpiresIn?: number;
  role?: Role | string;
}

export interface RefreshResponse extends AuthTokens {
  accessTokenExpiresIn?: number;
  refreshTokenExpiresIn?: number;
  user?: AuthUser;
  role?: Role | string;
}
