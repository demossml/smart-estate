import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    setupFiles: [],
    env: {
      SMART_ESTATE_DB_PATH: '/tmp/smart-estate-test.duckdb',
    },
  },
});
