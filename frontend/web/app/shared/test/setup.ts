import '@testing-library/jest-dom/vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => cleanup());

afterAll(() => {
  const directory = process.env.INSTRUMENTED_COVERAGE_DIR;
  const coverage = Reflect.get(globalThis, '__coverage__');
  if (!directory || !coverage) return;
  mkdirSync(directory, { recursive: true });
  const filename = `unit-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  writeFileSync(resolve(directory, filename), JSON.stringify(coverage));
});
