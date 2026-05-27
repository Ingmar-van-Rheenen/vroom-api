import { defineConfig } from 'vitest/config';

// Lokaal: gebruik een aparte test-database zodat de dev-data nooit wordt gewist.
// CI zet DATABASE_URL expliciet (naar een test-db op de Postgres service-container).
const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://vroom:vroom@localhost:5432/vroom_test';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      APP_URL: 'http://localhost:5500',
      API_URL: 'http://localhost:3001',
      SESSION_COOKIE_SECURE: 'false',
      RESEND_API_KEY: '',
    },
  },
});
