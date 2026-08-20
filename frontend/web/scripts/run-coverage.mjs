import { access, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'coverage');
await rm(output, { recursive: true, force: true });

const localBrowserLibraries = '/tmp/daevox-playwright-libs/extracted/usr/lib/x86_64-linux-gnu';
let libraryPath = process.env.LD_LIBRARY_PATH;
try {
  await access(localBrowserLibraries);
  libraryPath = libraryPath ? `${localBrowserLibraries}:${libraryPath}` : localBrowserLibraries;
} catch {
  // A normal CI image provides Playwright dependencies system-wide.
}

async function run(command, args, extraEnv = {}) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...(libraryPath ? { LD_LIBRARY_PATH: libraryPath } : {}),
        ...extraEnv,
      },
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${command} завершился с кодом ${code}`)),
    );
  });
}

await run('npx', ['vitest', 'run'], {
  VITE_COVERAGE: 'true',
  INSTRUMENTED_COVERAGE_DIR: resolve(output, 'unit'),
});
await run('npx', ['vitest', 'run', '--config', 'vitest.storybook.config.ts'], {
  VITE_COVERAGE: 'true',
  INSTRUMENTED_COVERAGE_DIR: resolve(output, 'storybook'),
});
await run('npx', ['playwright', 'test'], {
  VITE_COVERAGE: 'true',
  E2E_COVERAGE_DIR: resolve(output, 'e2e'),
});
await run('node', ['scripts/verify-coverage.mjs']);
