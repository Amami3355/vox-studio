import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageJobSchema } from '../src/contracts/schemas';
import { imageGenerationRequestIdentity, imageJobIdOf } from '../src/run-store/identities';
import { type CommandFixture, createCommandFixture, seedVerifiedTake } from './command-fixture';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const providerRequest = {
  prompt: 'VOX_IMAGE_REQUEST_V1\nSubject: A night bus waiting outside a small railway station',
  aspectRatio: '16:9' as const,
  outputMimeType: 'image/png' as const,
  seed: 7,
};

const request = () => ({
  protocolVersion: 1 as const,
  requirementId: 'req_ccb9f349',
  identityKey: 'req_ccb9f349',
  ...providerRequest,
  requestSha256: imageGenerationRequestIdentity(providerRequest),
});

const grant = (overrides: Record<string, unknown> = {}) => ({
  protocolVersion: 1,
  grantId: 'image-grant-1',
  runId: 'run-command-test',
  requestSha256: request().requestSha256,
  issuedAt: '2026-09-06T11:59:00Z',
  expiresAt: '2026-09-06T12:05:00Z',
  grant: 'signed-test-grant',
  ...overrides,
});

const jobOf = (execution: Awaited<ReturnType<CommandFixture['service']['imageStart']>>) =>
  imageJobSchema.parse((execution.envelope.data as { job?: unknown } | null)?.job);

let fixture: CommandFixture | null = null;
afterEach(async () => fixture?.cleanup());

const compilePlaceholder = async (target: CommandFixture): Promise<void> => {
  await target.service.init({ requestPath: target.requestPath, out: target.runRoot });
  await target.service.validate({ runRoot: target.runRoot, planPath: target.planPath });
  await target.service.preflight({ runRoot: target.runRoot });
  await seedVerifiedTake(target);
  const compiled = await target.service.compile({ runRoot: target.runRoot });
  expect(compiled.envelope.data).toMatchObject({
    report: { warningCount: 2 },
    assetWorklist: [
      {
        requirementId: request().requirementId,
        sectionId: 'northbridge',
        sceneId: 'station',
        field: 'props.assetRequirement',
      },
    ],
  });
};

describe('published generated-image lifecycle', { timeout: 15_000 }, () => {
  it('starts once, exposes an inspectable candidate, accepts its exact digest and recompiles it ready', async () => {
    const generate = vi.fn(async () => ({ bytes: PNG, mediaType: 'image/png' as const }));
    fixture = await createCommandFixture({ imageGenerator: { mode: 'recorded', generate } });
    await compilePlaceholder(fixture);

    const started = await fixture.service.imageStart({
      runRoot: fixture.runRoot,
      request: request(),
    });
    const startedJob = jobOf(started);
    const candidate = startedJob.candidate;
    const repeated = await fixture.service.imageStart({
      runRoot: fixture.runRoot,
      request: request(),
    });

    expect(started.envelope.command).toBe('run.image.start');
    expect(started.envelope.data).toMatchObject({
      disposition: 'created',
      providerMode: 'recorded',
      job: { status: 'candidate', requirementId: request().requirementId },
    });
    expect(started.envelope.artifacts).toEqual([
      expect.objectContaining({ kind: 'generated_image_candidate' }),
    ]);
    expect(repeated.envelope.data).toMatchObject({
      disposition: 'reused',
      job: { id: startedJob.id },
    });
    expect(generate).toHaveBeenCalledTimes(1);

    const wrong = await fixture.service.imageAccept({
      runRoot: fixture.runRoot,
      decision: {
        protocolVersion: 1,
        jobId: startedJob.id,
        candidateSha256: '00'.repeat(32),
      },
    });
    expect(wrong.envelope).toMatchObject({
      outcome: 'failed',
      error: { code: 'IMAGE_DIGEST_MISMATCH' },
    });

    const accepted = await fixture.service.imageAccept({
      runRoot: fixture.runRoot,
      decision: {
        protocolVersion: 1,
        jobId: startedJob.id,
        candidateSha256: candidate?.artifact.sha256,
      },
    });
    expect(accepted.envelope.data).toMatchObject({ job: { status: 'accepted' } });

    const recompiled = await fixture.service.compile({ runRoot: fixture.runRoot });
    expect(recompiled.envelope.data).toMatchObject({ report: { warningCount: 1 } });
    const document = JSON.parse(
      await readFile(
        resolve(fixture.runRoot, recompiled.envelope.artifacts[0]?.path ?? ''),
        'utf8',
      ),
    );
    expect(document.sections[0].scenes[0].assets.assetRequirement).toMatchObject({
      status: 'ready',
      uri: expect.stringMatching(/^data:image\/png;base64,/),
    });
  });

  it('keeps one dispatch observable and resumable while it is still running', async () => {
    let finish: ((value: { bytes: Buffer; mediaType: 'image/png' }) => void) | undefined;
    const generate = vi.fn(
      () =>
        new Promise<{ bytes: Buffer; mediaType: 'image/png' }>((resolveGeneration) => {
          finish = resolveGeneration;
        }),
    );
    fixture = await createCommandFixture({ imageGenerator: { mode: 'recorded', generate } });
    await compilePlaceholder(fixture);

    const pending = fixture.service.imageStart({ runRoot: fixture.runRoot, request: request() });
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const observed = await fixture.service.imageStatus({
      runRoot: fixture.runRoot,
      jobId: imageJobIdOf(request().identityKey, request().requestSha256),
    });
    const resumed = await fixture.service.imageStart({
      runRoot: fixture.runRoot,
      request: request(),
    });

    expect(observed.envelope.data).toMatchObject({ job: { status: 'dispatching' } });
    expect(resumed.envelope.data).toMatchObject({
      disposition: 'reused',
      job: { status: 'dispatching' },
    });
    expect(generate).toHaveBeenCalledTimes(1);
    finish?.({ bytes: PNG, mediaType: 'image/png' });
    await expect(pending).resolves.toMatchObject({
      envelope: { data: { job: { status: 'candidate' } } },
    });
  });

  it('fails closed before a live provider call when no image grant is supplied', async () => {
    const generate = vi.fn(async () => ({ bytes: PNG, mediaType: 'image/png' as const }));
    fixture = await createCommandFixture({ imageGenerator: { mode: 'live', generate } });
    await compilePlaceholder(fixture);

    const result = await fixture.service.imageStart({
      runRoot: fixture.runRoot,
      request: request(),
    });

    expect(result.envelope).toMatchObject({
      outcome: 'paused',
      error: null,
      data: { reason: 'IMAGE_AUTHORIZATION_REQUIRED' },
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', grant({ expiresAt: '2026-09-06T11:59:30Z' }), true],
    ['wrong request', grant({ requestSha256: '11'.repeat(32) }), true],
    ['bad signature', grant(), false],
  ])('refuses a %s live grant before provider dispatch', async (_case, authorization, verifies) => {
    const generate = vi.fn(async () => ({ bytes: PNG, mediaType: 'image/png' as const }));
    fixture = await createCommandFixture({
      imageGenerator: { mode: 'live', generate },
      verifyImageGrant: async () => verifies,
      now: () => new Date('2026-09-06T12:00:00Z'),
    });
    await compilePlaceholder(fixture);

    const result = await fixture.service.imageStart({
      runRoot: fixture.runRoot,
      request: request(),
      authorization,
    });

    expect(result.envelope.outcome).toBe('failed');
    expect(generate).not.toHaveBeenCalled();
  });

  it('consumes a valid live grant in the dispatch receipt before calling the provider', async () => {
    const generate = vi.fn(async () => ({ bytes: PNG, mediaType: 'image/png' as const }));
    fixture = await createCommandFixture({
      imageGenerator: { mode: 'live', generate },
      verifyImageGrant: async () => true,
      now: () => new Date('2026-09-06T12:00:00Z'),
    });
    await compilePlaceholder(fixture);

    const result = await fixture.service.imageStart({
      runRoot: fixture.runRoot,
      request: request(),
      authorization: grant(),
    });
    const checkpoint = JSON.parse(await readFile(resolve(fixture.runRoot, 'run.json'), 'utf8'));

    expect(result.envelope.data).toMatchObject({
      providerMode: 'live',
      job: { status: 'candidate' },
    });
    expect(checkpoint.bindings.images.consumedGrantIds).toEqual(['image-grant-1']);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('observes a job without appending a receipt or changing the checkpoint revision', async () => {
    const generate = vi.fn(async () => ({ bytes: PNG, mediaType: 'image/png' as const }));
    fixture = await createCommandFixture({ imageGenerator: { mode: 'recorded', generate } });
    await compilePlaceholder(fixture);
    const started = await fixture.service.imageStart({
      runRoot: fixture.runRoot,
      request: request(),
    });
    const before = JSON.parse(await readFile(resolve(fixture.runRoot, 'run.json'), 'utf8'));

    await fixture.service.imageStatus({ runRoot: fixture.runRoot, jobId: jobOf(started).id });
    const after = JSON.parse(await readFile(resolve(fixture.runRoot, 'run.json'), 'utf8'));

    expect(after.revision).toBe(before.revision);
    expect(after.headReceiptSha256).toBe(before.headReceiptSha256);
  });
});
