export interface RuntimeConfig {
  apiBaseUrl: string;
  adminGalleryApiBaseUrl?: string;
  mediaBaseUrl?: string;
  tokenRefreshLeewaySeconds: number;
  authIssuer?: string;
  authAudience?: string;
  authClientId?: string;
}
