const { defineConfig } = require('orval');
require('dotenv').config();

if (!process.env.OPENAPI_SCHEMA_URL) {
  throw new Error('OPENAPI_SCHEMA_URL is required in .env for orval');
}

/**
 * Orval configuration for generating Angular HttpClient SDK
 * from the NestJS OpenAPI schema exposed at http://localhost:3002/docs-json
 */
module.exports = defineConfig({
  backend: {
    input: process.env.OPENAPI_SCHEMA_URL,
    output: {
      target: 'src/app/core/api/generated/index.ts',
      schemas: 'src/app/core/api/generated/schemas',
      client: 'angular',
      mode: 'tags-split',
      prettier: true,
      clean: true,
      override: {
        useUnionTypes: true,
        angular: {
          provideHttpClient: false,
        },
      },
    },
  },
});
