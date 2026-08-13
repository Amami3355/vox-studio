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
import {
  buildCatalog,
  buildPlanContract,
  serializeCatalog,
  serializePlanContract,
} from '../src/catalog/build';

const here = dirname(fileURLToPath(import.meta.url));
const projections = [
  {
    name: 'catalog.json',
    target: resolve(here, '../src/catalog/catalog.json'),
    next: serializeCatalog(buildCatalog()),
  },
  {
    name: 'plan-contract.json',
    target: resolve(here, '../src/catalog/plan-contract.json'),
    next: serializePlanContract(buildPlanContract()),
  },
] as const;
const check = process.argv.includes('--check');

if (check) {
  for (const projection of projections) {
    let current: string;
    try {
      current = readFileSync(projection.target, 'utf8');
    } catch {
      console.error(`${projection.name} is missing. Run: pnpm catalog`);
      process.exit(1);
    }
    if (current !== projection.next) {
      console.error(`${projection.name} is out of date. Run: pnpm catalog`);
      process.exit(1);
    }
  }
  console.info('Public catalog projections are up to date.');
} else {
  for (const projection of projections) {
    writeFileSync(projection.target, projection.next, 'utf8');
  }
  const count = buildCatalog().capabilities.length;
  console.info(`Wrote catalog.json and plan-contract.json — ${count} capability(ies).`);
}
