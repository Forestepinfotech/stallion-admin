import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const envPath = path.resolve(projectRoot, '.env');
dotenv.config({ path: envPath });

const must = (name) => {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
};

const config = {
  apiBaseUrl: must('API_BASE_URL'),
  openApiSchemaUrl: must('OPENAPI_SCHEMA_URL'),
  tokenRefreshLeewaySeconds: Number(process.env.TOKEN_REFRESH_LEEWAY_SECONDS ?? 20),
  authIssuer: process.env.AUTH_ISSUER ?? '',
  authAudience: process.env.AUTH_AUDIENCE ?? '',
  authClientId: process.env.AUTH_CLIENT_ID ?? '',
};

const target = path.resolve(projectRoot, 'src/assets/runtime-config.json');

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(config, null, 2));

console.log(`runtime-config.json written to ${path.relative(projectRoot, target)}`);
