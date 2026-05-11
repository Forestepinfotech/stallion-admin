const { defineConfig } = require('orval');

/**
 * Orval configuration for generating Angular HttpClient SDK
 * from the merged split Swagger docs written by tools/sync-openapi.mjs
 */
module.exports = defineConfig({
  backend: {
    input: 'tools/.cache/openapi.merged.json',
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
