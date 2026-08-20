import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { sourceCoveragePlugin } from './coverage-plugin.ts';
const directory = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  plugins: [
    process.env.VITE_COVERAGE === 'true' && sourceCoveragePlugin(),
    storybookTest({ configDir: path.join(directory, '.storybook') }),
    {
      name: 'storybook-coverage-sink',
      configureServer(server) {
        server.middlewares.use('/__coverage__', (request, response) => {
          if (request.method !== 'POST' || !process.env.INSTRUMENTED_COVERAGE_DIR) {
            response.statusCode = 404;
            response.end();
            return;
          }
          const chunks: Buffer[] = [];
          request.on('data', (chunk: Buffer) => chunks.push(chunk));
          request.on('end', async () => {
            const { mkdir, writeFile } = await import('node:fs/promises');
            const { randomUUID } = await import('node:crypto');
            await mkdir(process.env.INSTRUMENTED_COVERAGE_DIR!, { recursive: true });
            await writeFile(
              path.join(process.env.INSTRUMENTED_COVERAGE_DIR!, `storybook-${randomUUID()}.json`),
              Buffer.concat(chunks),
            );
            response.statusCode = 204;
            response.end();
          });
        });
      },
    },
  ],
  resolve: { alias: { '@': path.resolve(directory, 'app') } },
  test: {
    name: 'storybook',
    setupFiles: ['./.storybook/coverage-setup.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{ browser: 'chromium' }],
    },
    coverage: {
      provider: 'v8',
      reporter: ['json'],
      reportsDirectory: process.env.COVERAGE_DIR ?? './coverage/storybook',
      include: ['app/**/*.{ts,tsx}'],
      exclude: [
        '**/*.stories.*',
        '**/*.test.*',
        'app/shared/api/graphql/generated.ts',
        'app/shared/test/**',
        'app/**/index.ts',
        'app/root.tsx',
        'app/routes.ts',
      ],
    },
  },
});
