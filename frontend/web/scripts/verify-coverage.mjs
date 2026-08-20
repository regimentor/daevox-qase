import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import coverageLibrary from 'istanbul-lib-coverage';

const { createCoverageMap } = coverageLibrary;

const root = process.cwd();
const coverageRoot = resolve(root, 'coverage');
const files = [];
const unitDirectory = resolve(coverageRoot, 'unit');
for (const name of await readdir(unitDirectory)) {
  if (name.endsWith('.json')) files.push(resolve(unitDirectory, name));
}
const storybookDirectory = resolve(coverageRoot, 'storybook');
for (const name of await readdir(storybookDirectory)) {
  if (name.endsWith('.json')) files.push(resolve(storybookDirectory, name));
}
const e2eDirectory = resolve(coverageRoot, 'e2e');
for (const name of await readdir(e2eDirectory)) {
  if (name.endsWith('.json')) files.push(resolve(e2eDirectory, name));
}

const map = createCoverageMap({});
for (const file of files) {
  map.merge(JSON.parse(await readFile(file, 'utf8')));
}
const summary = map.getCoverageSummary().toJSON();
await writeFile(
  resolve(coverageRoot, 'coverage-summary.json'),
  `${JSON.stringify({ total: summary }, null, 2)}\n`,
);

const metrics = ['statements', 'branches', 'functions', 'lines'];
for (const metric of metrics) {
  const value = summary[metric].pct;
  console.log(`${metric.padEnd(10)} ${value}%`);
  if (value < 80) process.exitCode = 1;
}
if (process.exitCode) throw new Error('Совокупный frontend coverage ниже 80%');
