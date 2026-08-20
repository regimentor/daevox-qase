import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['backend/api/test/**/*.spec.ts', 'backend/api/test/**/*.e2e-spec.ts'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    sequence: { concurrent: false },
    coverage: {
      provider: 'v8',
      all: true,
      include: ['backend/api/src/**/*.ts'],
      exclude: [
        'backend/api/src/generated/**',
        'backend/api/src/main.ts',
        'backend/api/src/schema/generate-types.ts',
        'backend/api/src/commands/**',
      ],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 90,
        branches: 75,
        functions: 95,
        lines: 90,
      },
    },
  },
});
