const { defineConfig } = require('orval');
require('dotenv').config();

/**
 * Orval configuration for generating Angular HttpClient SDK
 * from the NestJS OpenAPI schema exposed at http://localhost:3002/docs-json
 */
module.exports = defineConfig({
  backend: {
    input: process.env.OPENAPI_SCHEMA_URL || 'http://localhost:3002/docs-json',
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
