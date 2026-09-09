// Execute with tsx in a disposable Production image, without the production volume or secrets.
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
const request = '/tmp/test-image-request.json';
const output = '/tmp/test-image-grant.json';
const run = () =>
  spawnSync(
    '/app/packages/production/node_modules/.bin/tsx',
    ['/app/deploy/crew/milestone-2/sign-image-grant.mjs', request, output],
    { encoding: 'utf8', env: { ...process.env, VOX_GRANT_KEY: 'synthetic-test-key' } },
  );
await writeFile(request, JSON.stringify(input));
const first = run();
assert.equal(first.status, 0, first.stderr);
assert.ok(!first.stdout.includes('synthetic-test-key'));
const grant = JSON.parse(await readFile(output, 'utf8'));
const { grant: signature, ...unsigned } = grant;
assert.equal(
  signature,
  createHmac('sha256', 'synthetic-test-key').update(canonicalJson(unsigned)).digest('hex'),
);
assert.ok(!first.stdout.includes(signature));
assert.equal(run().status, 0);
assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), grant);
await writeFile(
  request,
  JSON.stringify({ ...input, runId: '22222222-2222-4222-8222-222222222222' }),
);
assert.notEqual(run().status, 0);
assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), grant);
console.info(
  'passed: exact-request signature, idempotent grant, second-request refusal, secret-free output',
);
