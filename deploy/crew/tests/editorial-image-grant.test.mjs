// Run in a disposable Production container without real secrets or persistent volumes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { canonicalJson } from '/app/packages/production/src/canonical-json.ts';

const input = {
  runId: '11111111-1111-4111-8111-111111111111',
  request: {
    protocolVersion: 1,
    requirementId: 'req_12345678',
    identityKey: 'test-illustration',
    prompt: 'An illustration for a test.',
    aspectRatio: '16:9',
    outputMimeType: 'image/png',
    seed: 7,
    requestSha256: 'a'.repeat(64),
  },
};
const run = () =>
  spawnSync(
    '/app/packages/production/node_modules/.bin/tsx',
    [
      '/app/deploy/crew/editorial-preview/sign-image-grant.mjs',
      '/tmp/request.json',
      '/tmp/grant.json',
    ],
    { encoding: 'utf8', env: { ...process.env, VOX_GRANT_KEY: 'synthetic-test-key' } },
  );
await writeFile('/tmp/request.json', JSON.stringify(input));
assert.equal(run().status, 0);
const first = JSON.parse(await readFile('/tmp/grant.json', 'utf8'));
const { grant: signature, ...unsigned } = first;
assert.equal(
  signature,
  createHmac('sha256', 'synthetic-test-key').update(canonicalJson(unsigned)).digest('hex'),
);
const repeated = run();
assert.equal(repeated.status, 0);
assert.ok(!repeated.stdout.includes(signature));
assert.deepEqual(JSON.parse(await readFile('/tmp/grant.json', 'utf8')), first);
await writeFile(
  '/tmp/request.json',
  JSON.stringify({ ...input, runId: '22222222-2222-4222-8222-222222222222' }),
);
assert.notEqual(run().status, 0);
for (const digit of ['b', 'c', 'd', 'e']) {
  input.request.requestSha256 = digit.repeat(64);
  await writeFile('/tmp/request.json', JSON.stringify(input));
  assert.equal(run().status, 0);
}
input.request.requestSha256 = 'f'.repeat(64);
await writeFile('/tmp/request.json', JSON.stringify(input));
assert.notEqual(run().status, 0);
console.info('passed: signature, stable reuse, cross-Run refusal, five grants, sixth refusal');
