import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import path from 'node:path';
import { sourceCoveragePlugin } from './coverage-plugin.ts';

export default defineConfig({
  plugins: [process.env.VITE_COVERAGE === 'true' && sourceCoveragePlugin(), reactRouter()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'app'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/graphql': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
  },
});
