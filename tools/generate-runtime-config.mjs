import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import dotenv from 'dotenv';

const SERVER_BASE_URL = 'http://178.128.228.186';
const LOCAL_BASE_URL = 'http://localhost:3002';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const envPath = path.resolve(projectRoot, '.env');
dotenv.config({ path: envPath });

const isServerEnv = process.env.IS_SERVER?.trim().toLowerCase();
const useServerBaseUrl = isServerEnv !== 'false';
const resolvedApiBaseUrl = useServerBaseUrl ? SERVER_BASE_URL : LOCAL_BASE_URL;
const resolvedOpenApiSchemaUrl = `${resolvedApiBaseUrl.replace(/\/+$/, '')}/docs-json`;

const config = {
  apiBaseUrl: resolvedApiBaseUrl,
  mediaBaseUrl: process.env.MEDIA_BASE_URL || resolvedApiBaseUrl,
  openApiSchemaUrl: resolvedOpenApiSchemaUrl,
  tokenRefreshLeewaySeconds: Number(process.env.TOKEN_REFRESH_LEEWAY_SECONDS ?? 20),
  authIssuer: process.env.AUTH_ISSUER ?? '',
  authAudience: process.env.AUTH_AUDIENCE ?? '',
  authClientId: process.env.AUTH_CLIENT_ID ?? '',
};

const target = path.resolve(projectRoot, 'src/assets/runtime-config.json');

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(config, null, 2));

console.log(`runtime-config.json written to ${path.relative(projectRoot, target)}`);
