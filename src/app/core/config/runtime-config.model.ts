export interface RuntimeConfig {
  apiBaseUrl: string;
  tokenRefreshLeewaySeconds: number;
  authIssuer?: string;
  authAudience?: string;
  authClientId?: string;
}
