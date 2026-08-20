import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

const localBrowserLibraries = '/tmp/daevox-playwright-libs/extracted/usr/lib/x86_64-linux-gnu';
let libraryPath = process.env.LD_LIBRARY_PATH;
try {
  await access(localBrowserLibraries);
  libraryPath = libraryPath ? `${localBrowserLibraries}:${libraryPath}` : localBrowserLibraries;
} catch {
  // Standard CI Playwright images provide browser libraries system-wide.
}

const code = await new Promise((resolve, reject) => {
  const child = spawn('npx', ['playwright', 'test'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(libraryPath ? { LD_LIBRARY_PATH: libraryPath } : {}),
    },
  });
  child.on('error', reject);
  child.on('exit', (exitCode) => resolve(exitCode ?? 1));
});
process.exitCode = code;
