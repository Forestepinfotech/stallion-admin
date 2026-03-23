export interface RuntimeConfig {
  apiBaseUrl: string;
  mediaBaseUrl?: string;
  tokenRefreshLeewaySeconds: number;
  authIssuer?: string;
  authAudience?: string;
  authClientId?: string;
}
