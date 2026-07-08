import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    setupFiles: [],
    pool: 'forks',
    env: {
      SMART_ESTATE_DB_PATH: '/tmp/smart-estate-test.db',
    },
  },
});
