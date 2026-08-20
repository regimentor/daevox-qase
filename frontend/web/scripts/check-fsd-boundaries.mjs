import { access, readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('../app/', import.meta.url);
const order = ['shared', 'entities', 'features', 'widgets', 'pages', 'app'];
const violations = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.[jt]sx?$/.test(entry.name)) await inspect(path);
  }
}

async function inspect(path) {
  const source = await readFile(path, 'utf8');
  const detectedOwner = relative(root.pathname, path).split('/')[0];
  // Stories are application-level compositions even when colocated with a slice.
  const owner = path.includes('.stories.')
    ? 'app'
    : order.includes(detectedOwner)
      ? detectedOwner
      : 'app';
  const ownerRank = order.indexOf(owner);
  for (const match of source.matchAll(
    /from\s+['"]@\/(app|pages|widgets|features|entities|shared)\/([^'"]+)['"]/g,
  )) {
    const target = match[1];
    if (order.indexOf(target) > ownerRank)
      violations.push(`${relative(root.pathname, path)} imports higher layer ${target}`);
    if (target === owner && !['app', 'shared'].includes(owner)) {
      const ownerSlice = relative(root.pathname, path).split('/')[1];
      const targetSlice = match[2]?.split('/')[0];
      if (ownerSlice !== targetSlice)
        violations.push(`${relative(root.pathname, path)} imports sibling slice ${targetSlice}`);
    }
    const rest = match[2] ?? '';
    const importTarget = join(root.pathname, target, rest);
    let hasPublicApi = false;
    try {
      await access(join(importTarget, 'index.ts'));
      hasPublicApi = true;
    } catch {
      /* file import or missing public API */
    }
    if (!hasPublicApi && rest.split('/').length > 1)
      violations.push(`${relative(root.pathname, path)} deep-imports ${match[0]}`);
  }
}

await walk(root.pathname);
if (violations.length) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exitCode = 1;
}
