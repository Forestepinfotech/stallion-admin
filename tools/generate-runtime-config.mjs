import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import dotenv from "dotenv";

const PRODUCTION_BASE_URL =
  process.env.PRODUCTION_API_BASE_URL || "https://api.stallionauto.com";
const LOCAL_BASE_URL =
  process.env.LOCAL_API_BASE_URL || "http://localhost:3002";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.resolve(projectRoot, ".env");
dotenv.config({ path: envPath });

const isServerEnv = process.env.IS_SERVER?.trim().toLowerCase();
const useServerBaseUrl = isServerEnv !== "false";
const resolvedApiBaseUrl = useServerBaseUrl
  ? PRODUCTION_BASE_URL
  : LOCAL_BASE_URL;
const resolvedAdminGalleryApiBaseUrl =
  process.env.ADMIN_GALLERY_API_BASE_URL || resolvedApiBaseUrl;
const resolvedOpenApiSchemaUrl = `${resolvedApiBaseUrl.replace(/\/+$/, "")}/docs-json`;

const config = {
  apiBaseUrl: resolvedApiBaseUrl,
  adminGalleryApiBaseUrl: resolvedAdminGalleryApiBaseUrl,
  mediaBaseUrl: process.env.MEDIA_BASE_URL || resolvedApiBaseUrl,
  openApiSchemaUrl: resolvedOpenApiSchemaUrl,
  tokenRefreshLeewaySeconds: Number(
    process.env.TOKEN_REFRESH_LEEWAY_SECONDS ?? 20,
  ),
  authIssuer: process.env.AUTH_ISSUER ?? "",
  authAudience: process.env.AUTH_AUDIENCE ?? "",
  authClientId: process.env.AUTH_CLIENT_ID ?? "",
};

const target = path.resolve(projectRoot, "src/assets/runtime-config.json");

fs.mkdirSync(path.dirname(target), { recursive: true });
const nextContents = JSON.stringify(config, null, 2) + "\n";
let prevContents = null;
try {
  prevContents = fs.readFileSync(target, "utf8");
} catch {
  // File doesn't exist yet
}

if (prevContents !== nextContents) {
  fs.writeFileSync(target, nextContents);
  console.log(
    `runtime-config.json written to ${path.relative(projectRoot, target)}`,
  );
} else {
  console.log(
    `runtime-config.json unchanged at ${path.relative(projectRoot, target)}`,
  );
}
