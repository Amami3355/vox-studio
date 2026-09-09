// One operator recovery of the known failed milestone image, after explicit approval.
// Run inside trusted Production. --check is read-only; --execute dispatches once.
// Stage the migrated adapter at /tmp/google-image.ts with its SDK import rooted in /app.
import assert from 'node:assert/strict';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { canonicalJson } from '/app/packages/production/src/canonical-json.ts';
import { imageGenerationRequestSchema } from '/app/packages/production/src/contracts/schemas.ts';
import { imageGenerationRequestIdentity } from '/app/packages/production/src/run-store/identities.ts';
import { RUN_PATHS } from '/app/packages/production/src/run-store/paths.ts';
import { RunStore } from '/app/packages/production/src/run-store/run-store.ts';
import { createGoogleImageAdapter } from '/tmp/google-image.ts';

const mode = process.argv[2];
assert(['--check', '--execute'].includes(mode));
const runId = '28364527-1061-4a27-9010-c317865747c9';
const jobId = 'image-job-49c61acf99fc568a7928';
const requestSha256 = 'cbdee70e12354d3b045942aa873b833d27164778773f5735a3f02cfc6bad47aa';
const model = 'gemini-2.5-flash-image';
const directory = '/var/lib/vox/operator';
const input = JSON.parse(await readFile('/tmp/reviewed-image-request.json', 'utf8'));
const request = imageGenerationRequestSchema.parse(input.request);
assert.equal(input.runId, runId);
assert.equal(request.requestSha256, requestSha256);
const providerRequest = {
  prompt: request.prompt,
  aspectRatio: request.aspectRatio,
  outputMimeType: request.outputMimeType,
  seed: request.seed,
};
assert.equal(imageGenerationRequestIdentity(providerRequest), requestSha256);
const signed = JSON.parse(await readFile(`${directory}/milestone-2-image-grant.json`, 'utf8'));
const { grant, ...unsigned } = signed;
assert.equal(unsigned.runId, runId);
assert.equal(unsigned.requestSha256, requestSha256);
assert(
  timingSafeEqual(
    Buffer.from(grant, 'hex'),
    createHmac('sha256', process.env.VOX_GRANT_KEY).update(canonicalJson(unsigned)).digest(),
  ),
);
const store = new RunStore({
  runRoot: '/var/lib/vox/runs/run-5dbd654e5afb',
  runId,
  ledgerRoot: process.env.VOX_LEDGER_ROOT,
  hmacKey: process.env.VOX_RUN_HMAC_KEY,
  keyId: process.env.VOX_RUN_KEY_ID,
  leaseMs: 300_000,
});
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inspect = (checkpoint) => {
  assert.equal(checkpoint.runId, runId);
  assert.equal(checkpoint.terminal, null);
  assert.equal(checkpoint.bindings.take.takeId, 'bf85b0aa0b04');
  assert(checkpoint.bindings.images.consumedGrantIds.includes(unsigned.grantId));
  assert.equal(checkpoint.bindings.images.jobs.length, 1);
  const job = checkpoint.bindings.images.jobs.find((item) => item.id === jobId);
  assert.equal(job?.status, 'failed');
  assert.equal(job.candidate, null);
  assert.equal(job.requestSha256, requestSha256);
  assert.equal(job.requirementId, request.requirementId);
  assert.equal(job.identityKey, request.identityKey);
  return job;
};
inspect(await store.inspect());
if (mode === '--check') {
  console.info(
    JSON.stringify({
      ready: true,
      runId,
      jobId,
      requestSha256,
      model,
      originalGrantRetained: true,
      maximumRecoveryDispatches: 1,
    }),
  );
} else {
  await store.exclusive(async (session) => {
    let checkpoint = await session.inspect();
    const previousJob = inspect(checkpoint);
    const evidence = {
      runId,
      jobId,
      requestSha256,
      model,
      location: 'global',
      reason: 'Explicit operator recovery after retired Imagen endpoint produced no candidate.',
      previousJob,
      dispatchedAt: new Date().toISOString(),
    };
    // Durable, exclusive marker: a repeated invocation cannot spend again, even after a crash.
    await writeFile(
      `${directory}/milestone-2-image-recovery-dispatch.json`,
      JSON.stringify(evidence),
      { flag: 'wx', mode: 0o600 },
    );
    const replace = (job) => ({
      ...checkpoint.bindings,
      images: {
        ...checkpoint.bindings.images,
        jobs: checkpoint.bindings.images.jobs.map((item) => (item.id === jobId ? job : item)),
      },
    });
    checkpoint = await session.commit({
      expectedRevision: checkpoint.revision,
      command: 'run.image.start',
      outcome: 'succeeded',
      bindings: replace({ ...previousJob, status: 'dispatching', failure: null }),
      data: { operatorRecovery: true, model, requestSha256, previousStatus: 'failed' },
    });
    let generated;
    try {
      generated = await createGoogleImageAdapter({
        model,
        environment: { ...process.env, GOOGLE_CLOUD_LOCATION: 'global' },
      }).generate(providerRequest);
      // Preserve the provider response before publishing so a commit failure never needs regeneration.
      await writeFile(`${directory}/milestone-2-image-recovery-response.png`, generated.bytes, {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      const details = {
        ...evidence,
        outcome: 'uncertain',
        errorName: error?.name,
        httpStatus: typeof error?.status === 'number' ? error.status : null,
      };
      await writeFile(
        `${directory}/milestone-2-image-recovery-outcome.json`,
        JSON.stringify(details),
      );
      await session.commit({
        expectedRevision: checkpoint.revision,
        command: 'run.image.start',
        outcome: 'succeeded',
        bindings: replace({
          ...previousJob,
          status: 'uncertain',
          failure: 'Operator recovery returned no usable response; do not retry.',
        }),
        data: { operatorRecovery: true, model, outcome: 'uncertain' },
      });
      console.info(JSON.stringify(details));
      process.exitCode = 1;
      return;
    }
    const png = Buffer.from(generated.bytes);
    assert(
      png.length >= 24 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    );
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert(width > 0 && height > 0);
    const sha256 = hash(png);
    const result = await session.commit({
      expectedRevision: checkpoint.revision,
      command: 'run.image.start',
      outcome: 'succeeded',
      artifacts: [
        {
          kind: 'generated_image_candidate',
          path: RUN_PATHS.generatedImageCandidate(jobId, sha256),
          bytes: png,
        },
      ],
      bindings: ([artifact]) =>
        replace({
          ...previousJob,
          status: 'candidate',
          failure: null,
          candidate: {
            id: `image-candidate-${sha256.slice(0, 20)}`,
            requirementId: request.requirementId,
            identityKey: request.identityKey,
            promptSha256: hash(request.prompt),
            artifact,
            width,
            height,
          },
        }),
      data: { operatorRecovery: true, model, requestSha256, candidateSha256: sha256 },
    });
    const outcome = {
      ...evidence,
      outcome: 'candidate',
      sha256,
      width,
      height,
      revision: result.revision,
      completedAt: new Date().toISOString(),
    };
    await writeFile(
      `${directory}/milestone-2-image-recovery-outcome.json`,
      JSON.stringify(outcome),
    );
    console.info(JSON.stringify(outcome));
  });
}
