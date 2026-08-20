import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['backend/api/test/**/*.e2e-spec.ts'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
