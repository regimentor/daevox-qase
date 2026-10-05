import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'api',
          environment: 'node',
          include: ['backend/api/test/**/*.spec.ts'],
        },
      },
      'frontend/web/vitest.config.ts',
    ],
  },
});
