import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const output = new URL('../app/shared/api/graphql/generated.ts', import.meta.url);
const before = await readFile(output, 'utf8');
const result = spawnSync('npm', ['run', 'codegen'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status ?? 1);
const after = await readFile(output, 'utf8');
if (before !== after) {
  process.stderr.write('Generated GraphQL module was stale. Commit the regenerated output.\n');
  process.exitCode = 1;
}
