// Run only inside trusted Production. The private grant key never leaves its environment.
// Usage: tsx sign-image-grant.mjs request.json output.json
import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { canonicalJson } from '/app/packages/production/src/canonical-json.ts';
import { imageGenerationRequestSchema } from '/app/packages/production/src/contracts/schemas.ts';

const [requestPath, outputPath] = process.argv.slice(2);
if (!requestPath || !outputPath) throw new Error('Supply the exact request and output files.');
const input = JSON.parse(await readFile(requestPath, 'utf8'));
const request = imageGenerationRequestSchema.parse(input.request);
if (!/^[0-9a-f-]{36}$/.test(input.runId)) throw new Error('A public Run UUID is required.');
const key = process.env.VOX_GRANT_KEY;
if (!key) throw new Error('Trusted image-grant signer is unavailable.');
const directory = '/var/lib/vox/operator';
const ledger = `${directory}/milestone-2-image-grant.json`;
await mkdir(directory, { recursive: true, mode: 0o700 });
let grant;
try {
  grant = JSON.parse(await readFile(ledger, 'utf8'));
  if (grant.runId !== input.runId || grant.requestSha256 !== request.requestSha256) {
    throw new Error('The one-image milestone allowance already belongs to another request.');
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const unsigned = { protocolVersion: 1, grantId: randomUUID(), runId: input.runId,
    requestSha256: request.requestSha256, issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() };
  grant = { ...unsigned, grant: createHmac('sha256', key).update(canonicalJson(unsigned)).digest('hex') };
  // Exclusive creation makes a concurrent second allowance fail before anything is exported.
  await writeFile(ledger, `${JSON.stringify(grant)}\n`, { flag: 'wx', mode: 0o600 });
}
await writeFile(outputPath, `${JSON.stringify(grant)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ runId: grant.runId, requestSha256: grant.requestSha256,
  expiresAt: grant.expiresAt, allowance: 'one exact image request' }));
