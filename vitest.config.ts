import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // All files run in parallel; on a busy machine the jsdom App tests can pass 5 s without being wrong.
    testTimeout: 15000,
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: true,
    include: [
      'apps/web/src/**/*.test.{ts,tsx}',
      'apps/extension/**/*.test.ts',
      'functions/**/*.test.js',
      'scripts/**/*.test.ts',
      'packages/shared/src/**/*.test.{ts,tsx}',
      'packages/backend/src/**/*.test.ts',
    ],
  },
});
