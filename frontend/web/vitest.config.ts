import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { sourceCoveragePlugin } from './coverage-plugin.ts';
const directory = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: directory,
  plugins: [process.env.VITE_COVERAGE === 'true' && sourceCoveragePlugin(), react()],
  resolve: { alias: { '@': path.resolve(directory, 'app') } },
  test: {
    name: 'web',
    environment: 'jsdom',
    fileParallelism: process.env.VITE_COVERAGE !== 'true',
    setupFiles: ['./app/shared/test/setup.ts'],
    include: ['app/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'json-summary'],
      reportsDirectory: process.env.COVERAGE_DIR ?? './coverage',
      include: ['app/**/*.{ts,tsx}'],
      exclude: [
        '**/*.stories.*',
        '**/*.test.*',
        'app/shared/api/graphql/generated.ts',
        'app/shared/test/**',
        'app/**/index.ts',
        'app/root.tsx',
        'app/routes.ts',
        '.react-router/**',
      ],
      thresholds:
        process.env.COVERAGE_PART === 'true'
          ? undefined
          : { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
