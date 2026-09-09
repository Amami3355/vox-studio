import { readFile } from 'node:fs/promises';
import { hashCanonicalJson } from '../../../packages/production/src/canonical-json';
import { productionRequestSchema } from '../../../packages/production/src/contracts/schemas';

const manifest = JSON.parse(await readFile(process.argv[2]!, 'utf8'));
for (const [name, item] of Object.entries(manifest.submissions)) {
  const value = item as { request: unknown; requestSha256: string };
  const request = productionRequestSchema.parse(value.request);
  const actual = hashCanonicalJson('production-request', request);
  if (actual !== value.requestSha256) throw new Error(`Request binding mismatch: ${name}`);
  console.info(JSON.stringify({ name, requestSha256: actual, productionSchemaVerified: true }));
}
