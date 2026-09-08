// Trusted operator only: this preview has one Run and at most five exact image requests.
import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rmdir, writeFile } from 'node:fs/promises';
import { canonicalJson } from '/app/packages/production/src/canonical-json.ts';
import { imageGenerationRequestSchema } from '/app/packages/production/src/contracts/schemas.ts';

const [requestPath, outputPath] = process.argv.slice(2);
if (!requestPath || !outputPath) throw new Error('Supply exact request and grant output paths.');
const input = JSON.parse(await readFile(requestPath, 'utf8'));
const request = imageGenerationRequestSchema.parse(input.request);
if (!/^[0-9a-f-]{36}$/.test(input.runId)) throw new Error('A public Run UUID is required.');
const key = process.env.VOX_GRANT_KEY;
if (!key) throw new Error('Trusted signer unavailable.');
const directory = '/var/lib/vox/operator/editorial-preview-2026-09-08';
await mkdir(directory, { recursive: true, mode: 0o700 });
// Crash leaves the lock in place for reconciliation; it never resets an allowance.
await mkdir(`${directory}/lock`, { mode: 0o700 });
try {
  const identityPath = `${directory}/run.json`;
  try {
    const identity = JSON.parse(await readFile(identityPath, 'utf8'));
    if (identity.runId !== input.runId)
      throw new Error('Preview allowance belongs to another Run.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(identityPath, JSON.stringify({ runId: input.runId, maxImages: 5 }), {
      flag: 'wx',
      mode: 0o600,
    });
  }
  const path = `${directory}/grant-${request.requestSha256}.json`;
  let grant;
  try {
    grant = JSON.parse(await readFile(path, 'utf8'));
    if (grant.runId !== input.runId || grant.requestSha256 !== request.requestSha256) {
      throw new Error('Stored grant identity mismatch.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const grants = (await readdir(directory)).filter((name) =>
      /^grant-[a-f0-9]{64}\.json$/.test(name),
    );
    if (grants.length >= 5) throw new Error('Five-image preview allowance exhausted.');
    const unsigned = {
      protocolVersion: 1,
      grantId: randomUUID(),
      runId: input.runId,
      requestSha256: request.requestSha256,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    grant = {
      ...unsigned,
      grant: createHmac('sha256', key).update(canonicalJson(unsigned)).digest('hex'),
    };
    await writeFile(path, `${JSON.stringify(grant)}\n`, { flag: 'wx', mode: 0o600 });
  }
  await writeFile(outputPath, `${JSON.stringify(grant)}\n`, { mode: 0o600 });
  console.log(
    JSON.stringify({
      runId: grant.runId,
      requestSha256: grant.requestSha256,
      expiresAt: grant.expiresAt,
      maxImages: 5,
    }),
  );
} finally {
  await rmdir(`${directory}/lock`);
}
