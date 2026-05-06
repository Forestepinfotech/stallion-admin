import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.resolve(projectRoot, ".env") });

const PRODUCTION_BASE_URL =
  process.env.PRODUCTION_API_BASE_URL || "https://api.stallionauto.com";
const LOCAL_BASE_URL =
  process.env.LOCAL_API_BASE_URL || "http://localhost:3002";

const isServerEnv = process.env.IS_SERVER?.trim().toLowerCase();
const useServerBaseUrl = isServerEnv !== "false";
const apiBaseUrl = (
  useServerBaseUrl ? PRODUCTION_BASE_URL : LOCAL_BASE_URL
).replace(/\/+$/, "");
const docsBaseUrl = `${apiBaseUrl}/docs`;
const outputPath = path.resolve("tools/.cache/openapi.merged.json");

const sources = [
  { name: "auth", url: `${docsBaseUrl}/auth/swagger-ui-init.js`, required: true },
  { name: "admin", url: `${docsBaseUrl}/admin/swagger-ui-init.js`, required: true },
  { name: "customer", url: `${docsBaseUrl}/customer/swagger-ui-init.js`, required: false },
];

function createEmptySpec() {
  return {
    openapi: "3.0.0",
    info: {
      title: "stallio-auto-parts merged API",
      version: "1.0",
    },
    servers: [{ url: apiBaseUrl }],
    tags: [],
    paths: {},
    components: {},
  };
}

function mergeComponents(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = { ...(target[key] || {}), ...value };
      continue;
    }

    target[key] = value;
  }
}

async function fetchSpec(source) {
  let response;

  try {
    response = await fetch(source.url);
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.cause instanceof Error
          ? `${error.message}: ${error.cause.message}`
          : error.message
        : String(error);
    throw new Error(`${source.name} docs request to ${source.url} failed: ${reason}`);
  }

  if (!response.ok) {
    throw new Error(
      `${source.name} docs request to ${source.url} failed with ${response.status}`,
    );
  }

  const payload = await response.text();
  const json = extractSwaggerDoc(payload, source);
  const pathCount = Object.keys(json.paths || {}).length;

  if (source.required && pathCount === 0) {
    throw new Error(
      `${source.name} docs at ${source.url} returned 0 paths. Fix the backend Swagger group before regenerating frontend APIs.`,
    );
  }

  return { ...json, _pathCount: pathCount };
}

function extractSwaggerDoc(payload, source) {
  const marker = '"swaggerDoc":';
  const start = payload.indexOf(marker);

  if (start === -1) {
    throw new Error(
      `${source.name} docs at ${source.url} did not contain a swaggerDoc payload.`,
    );
  }

  const objectStart = payload.indexOf("{", start + marker.length);
  if (objectStart === -1) {
    throw new Error(
      `${source.name} docs at ${source.url} did not contain a valid swaggerDoc object.`,
    );
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = objectStart; index < payload.length; index += 1) {
    const char = payload[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const jsonText = payload.slice(objectStart, index + 1);
        try {
          return JSON.parse(jsonText);
        } catch (error) {
          const reason =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `${source.name} docs at ${source.url} contained an invalid swaggerDoc JSON payload: ${reason}`,
          );
        }
      }
    }
  }

  throw new Error(
    `${source.name} docs at ${source.url} ended before the swaggerDoc object was closed.`,
  );
}

async function main() {
  const merged = createEmptySpec();
  const summaries = [];

  for (const source of sources) {
    const spec = await fetchSpec(source);
    summaries.push(`${source.name}: ${spec._pathCount} paths`);

    merged.paths = { ...merged.paths, ...(spec.paths || {}) };
    merged.tags = [...merged.tags, ...(spec.tags || []).filter(Boolean)];
    mergeComponents(merged.components, spec.components);
  }

  merged.tags = Array.from(
    new Map(
      (merged.tags || []).map((tag) => [tag?.name ?? JSON.stringify(tag), tag]),
    ).values(),
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  console.info(`Merged OpenAPI written to ${outputPath}`);
  console.info(summaries.join(" | "));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
