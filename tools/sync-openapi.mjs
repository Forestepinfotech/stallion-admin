import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = (process.env.API_BASE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');
const outputPath = path.resolve('tools/.cache/openapi.merged.json');

const sources = [
  { name: 'auth', url: `${baseUrl}/docs/auth-json`, required: true },
  { name: 'admin', url: `${baseUrl}/docs/admin-json`, required: true },
  { name: 'customer', url: `${baseUrl}/docs/customer-json`, required: false },
];

function createEmptySpec() {
  return {
    openapi: '3.0.0',
    info: {
      title: 'stallio-auto-parts merged API',
      version: '1.0',
    },
    servers: [{ url: baseUrl }],
    tags: [],
    paths: {},
    components: {},
  };
}

function mergeComponents(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = { ...(target[key] || {}), ...value };
      continue;
    }

    target[key] = value;
  }
}

async function fetchSpec(source) {
  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(`${source.name} docs request failed with ${response.status}`);
  }

  const json = await response.json();
  const pathCount = Object.keys(json.paths || {}).length;

  if (source.required && pathCount === 0) {
    throw new Error(
      `${source.name} docs at ${source.url} returned 0 paths. Fix the backend Swagger group before regenerating frontend APIs.`,
    );
  }

  return { ...json, _pathCount: pathCount };
}

async function main() {
  const merged = createEmptySpec();
  const summaries = [];

  for (const source of sources) {
    const spec = await fetchSpec(source);
    summaries.push(`${source.name}: ${spec._pathCount} paths`);

    merged.paths = { ...merged.paths, ...(spec.paths || {}) };
    merged.tags = [...merged.tags, ...((spec.tags || []).filter(Boolean))];
    mergeComponents(merged.components, spec.components);
  }

  merged.tags = Array.from(
    new Map((merged.tags || []).map((tag) => [tag?.name ?? JSON.stringify(tag), tag])).values(),
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

  console.info(`Merged OpenAPI written to ${outputPath}`);
  console.info(summaries.join(' | '));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
