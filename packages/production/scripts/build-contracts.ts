import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { buildContractProjections } from '../src/contracts/generate';
import {
  PRODUCTION_LIMIT_DEFAULTS,
  productionLimitsSchema,
} from '../src/contracts/studio-authorization';

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
const limitsSchema = z.toJSONSchema(productionLimitsSchema);
const pythonLimits = [
  '"""Generated from Production productionLimitsSchema. Run pnpm --filter @vox/production contracts."""',
  'from pydantic import BaseModel, ConfigDict, Field',
  '',
  '',
  'class ProductionLimits(BaseModel):',
  '    model_config = ConfigDict(extra="forbid", strict=True)',
  ...Object.entries(PRODUCTION_LIMIT_DEFAULTS).map(([name, value]) => {
    const property = limitsSchema.properties?.[name];
    if (!property || typeof property !== 'object' || !property.anyOf)
      throw new Error(`Production limit ${name} must support null.`);
    const integer = property.anyOf.find((variant) => variant.type === 'integer');
    if (!integer) throw new Error(`Production limit ${name} must support historical integers.`);
    return `    ${name}: int | None = Field(default=${value === null ? 'None' : value}, ge=${integer.minimum}, le=${integer.maximum})`;
  }),
  '',
].join('\n');
outputs.push({
  path: resolve(repositoryRoot, 'services/agents/src/vox_crew/production_limits.py'),
  bytes: pythonLimits,
});
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
