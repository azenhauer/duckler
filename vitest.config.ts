import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: true,
    include: [
      'apps/web/src/**/*.test.{ts,tsx}',
      'apps/extension/**/*.test.ts',
      'functions/**/*.test.js',
      'scripts/**/*.test.ts',
      'packages/shared/src/**/*.test.{ts,tsx}',
    ],
  },
});
