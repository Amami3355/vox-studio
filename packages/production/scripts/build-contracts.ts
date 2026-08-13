import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContractProjections } from '../src/contracts/generate';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../../..');
const generatedRoot = resolve(here, '../src/contracts/generated');

const projections = buildContractProjections({
  contextMarkdown: readFileSync(resolve(repositoryRoot, 'CONTEXT.md'), 'utf8'),
  planContract: JSON.parse(
    readFileSync(resolve(repositoryRoot, 'packages/video/src/catalog/plan-contract.json'), 'utf8'),
  ),
  catalog: JSON.parse(
    readFileSync(resolve(repositoryRoot, 'packages/video/src/catalog/catalog.json'), 'utf8'),
  ),
});

const outputs = [
  { name: 'index', value: projections.index },
  ...Object.entries(projections.categories).map(([name, value]) => ({ name, value })),
].map(({ name, value }) => ({
  path: resolve(generatedRoot, `${name}.json`),
  bytes: `${JSON.stringify(value, null, 2)}\n`,
}));

const check = process.argv.includes('--check');
if (!check) mkdirSync(generatedRoot, { recursive: true });
for (const output of outputs) {
  if (check) {
    let current: string;
    try {
      current = readFileSync(output.path, 'utf8');
    } catch {
      console.error(`${output.path} is missing. Run: pnpm --filter @vox/production contracts`);
      process.exit(1);
    }
    if (current !== output.bytes) {
      console.error(`${output.path} is out of date. Run: pnpm --filter @vox/production contracts`);
      process.exit(1);
    }
  } else {
    writeFileSync(output.path, output.bytes, 'utf8');
  }
}

console.info(
  check ? 'Production contract projections are up to date.' : 'Wrote production contracts.',
);
