/**
 * Writes src/catalog/catalog.json from the registry.
 *
 * `--check` compares instead of writing and exits non-zero on drift. CI runs that, and
 * it is the only guard against the manifest quietly falling out of step with the code
 * while the agent keeps producing props nobody can explain.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog, serializeCatalog } from '../src/catalog/build';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../src/catalog/catalog.json');

const next = serializeCatalog(buildCatalog());
const check = process.argv.includes('--check');

if (check) {
  let current: string;
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    console.error('catalog.json is missing. Run: pnpm catalog');
    process.exit(1);
  }
  if (current !== next) {
    console.error('catalog.json is out of date with the scene registry. Run: pnpm catalog');
    process.exit(1);
  }
  console.info('catalog.json is up to date.');
} else {
  writeFileSync(target, next, 'utf8');
  const count = buildCatalog().capabilities.length;
  console.info(`Wrote catalog.json — ${count} capability(ies).`);
}
