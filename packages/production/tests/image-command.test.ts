import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assetRequirementId } from '@vox/video';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageGenerationGrantSchema, imageJobSchema } from '../src/contracts/schemas';
import { ImageDispatchUncertain, ImageGenerationFailure } from '../src/image/failure';
import { createGoogleImageAdapter } from '../src/image/google';
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
  it.each([false, true])(
    'persists consumption for successful or failed generations and reuses it without dispatch (%s)',
    async (failed) => {
      const consumption = {
        schemaVersion: 1 as const,
        provider: 'google-cloud' as const,
        model: 'gemini-3-pro-image',
        location: 'global',
        tokens: {
          input: 1000,
          cached: 200,
          output: 100,
          imageOutput: 1120,
          reasoning: 50,
          tools: 0,
          total: 2270,
        },
        estimatedNanoUsd: 137840000,
        priceVersion: 'google-image-global-standard-2026-09-09',
      };
      const generate = vi.fn(async () => {
        if (failed) throw new ImageGenerationFailure('NO_IMAGE', consumption);
        return { bytes: PNG, mediaType: 'image/png' as const, consumption };
      });
      fixture = await createCommandFixture({
        imageGenerator: { mode: 'live', generate },
        verifyImageGrant: async () => true,
        now: () => new Date('2026-09-06T12:00:00Z'),
      });
      await compilePlaceholder(fixture);
      const input = { runRoot: fixture.runRoot, request: request(), authorization: grant() };
      const first = jobOf(await fixture.service.imageStart(input));
      expect(first.consumption).toEqual(consumption);
      const reused = jobOf(await fixture.service.imageStart(input));
      expect(reused.consumption).toEqual(consumption);
      expect(reused.status).toBe(failed ? 'failed' : 'candidate');
      expect(generate).toHaveBeenCalledTimes(1);
    },
  );

  it('binds an edit to a rejected candidate in the same Run and refuses an unknown source before dispatch', async () => {
    const generate = vi.fn(async () => ({ bytes: PNG, mediaType: 'image/png' as const }));
    fixture = await createCommandFixture({
      imageGenerator: { mode: 'live', generate },
      verifyImageGrant: async () => true,
      now: () => new Date('2026-09-06T12:00:00Z'),
    });
    await compilePlaceholder(fixture);
    const first = jobOf(
      await fixture.service.imageStart({
        runRoot: fixture.runRoot,
        request: request(),
        authorization: grant(),
      }),
    );
    await fixture.service.imageReject({
      runRoot: fixture.runRoot,
      decision: {
        protocolVersion: 1,
        jobId: first.id,
        candidateSha256: first.candidate!.artifact.sha256,
        reason: 'Correct the diagram geometry.',
      },
    });
    const edit = {
      ...providerRequest,
      prompt: 'Correct the diagram geometry.',
      sourceCandidateSha256: '0'.repeat(64),
    };
    const start = (source: typeof edit) =>
      fixture!.service.imageStart({
        runRoot: fixture!.runRoot,
        request: { ...request(), ...source, requestSha256: imageGenerationRequestIdentity(source) },
        authorization: grant({
          grantId: 'edit-grant',
          requestSha256: imageGenerationRequestIdentity(source),
        }),
      });
    expect((await start(edit)).envelope.outcome).toBe('failed');
    expect(generate).toHaveBeenCalledTimes(1);
    edit.sourceCandidateSha256 = first.candidate!.artifact.sha256;
    expect(jobOf(await start(edit)).status).toBe('candidate');
    expect(generate).toHaveBeenLastCalledWith({ ...edit, sourceImage: PNG });
    expect(jobOf(await start(edit)).status).toBe('candidate');
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it.each(['429', 'uncertain', '400'])(
    'permits only a paced, explicit recovery of a confirmed %s job',
    async (kind) => {
      let clock = new Date('2026-09-06T12:00:00Z');
      let approved = false;
      const authorize = vi.fn(
        async (_request: string, _run: string, sha: string, retryOf?: string) =>
          imageGenerationGrantSchema.parse(
            grant({ requestSha256: sha, grantId: retryOf ? 'retry-grant' : 'original-grant' }),
          ),
      );
      const generate = vi
        .fn()
        .mockRejectedValueOnce(
          kind === 'uncertain'
            ? new ImageDispatchUncertain()
            : new ImageGenerationFailure(
                `Image provider returned HTTP_${kind}; no retry was started.`,
              ),
        )
        .mockResolvedValue({ bytes: PNG, mediaType: 'image/png' });
      fixture = await createCommandFixture({
        imageGenerator: { mode: 'live', generate },
        verifyImageGrant: async () => true,
        now: () => clock,
        autonomousImages: {
          bind: async () => {},
          authorize,
          recoveryPolicy: async (requestSha256, runId) =>
            approved
              ? {
                  schemaVersion: 1,
                  requestSha256,
                  runId,
                  maxImageAttempts: 8,
                  minimumIntervalSeconds: 60,
                  retryHttpStatuses: [429],
                  authorizedAt: '2026-09-06T12:00:00Z',
                  expiresAt: '2026-09-06T12:05:00Z',
                }
              : undefined,
        },
      });
      await compilePlaceholder(fixture);
      const first = jobOf(
        await fixture.service.imageStart({ runRoot: fixture.runRoot, request: request() }),
      );
      const retry = { ...request(), retryOf: first.id };
      // Resume recompiles: a failed resource is no longer a pending placeholder.
      await fixture.service.compile({ runRoot: fixture.runRoot });
      expect(
        (await fixture.service.imageStart({ runRoot: fixture.runRoot, request: retry })).envelope
          .outcome,
      ).toBe('failed');
      approved = true;
      expect(
        jobOf(await fixture.service.imageStart({ runRoot: fixture.runRoot, request: request() }))
          .id,
      ).toBe(first.id);
      if (kind !== '429') {
        clock = new Date('2026-09-06T12:02:00Z');
        expect(
          (await fixture.service.imageStart({ runRoot: fixture.runRoot, request: retry })).envelope
            .outcome,
        ).toBe('failed');
        expect(generate).toHaveBeenCalledTimes(1);
        return;
      }
      const waiting = await fixture.service.imageStart({
        runRoot: fixture.runRoot,
        request: retry,
      });
      expect(waiting.envelope).toMatchObject({
        outcome: 'paused',
        data: { reason: 'IMAGE_RATE_WAIT' },
      });
      expect(generate).toHaveBeenCalledTimes(1);
      expect(authorize).toHaveBeenCalledTimes(1);
      clock = new Date('2026-09-06T12:01:01Z');
      const second = jobOf(
        await fixture.service.imageStart({ runRoot: fixture.runRoot, request: retry }),
      );
      expect(second).toMatchObject({
        status: 'candidate',
        requestSha256: first.requestSha256,
        retryOf: first.id,
      });
      expect(second.id).not.toBe(first.id);
      expect(
        jobOf(await fixture.service.imageStart({ runRoot: fixture.runRoot, request: retry })),
      ).toEqual(second);
      expect(generate).toHaveBeenCalledTimes(2);
      expect(
        jobOf(await fixture.service.imageStatus({ runRoot: fixture.runRoot, jobId: first.id }))
          .status,
      ).toBe('failed');
      const state = JSON.parse(await readFile(resolve(fixture.runRoot, 'run.json'), 'utf8'));
      expect(state.bindings.images.jobs).toHaveLength(2);
      expect(state.bindings.images.consumedGrantIds).toEqual(['original-grant', 'retry-grant']);
      expect(
        (await fixture.service.status({ runRoot: fixture.runRoot })).envelope.data,
      ).toMatchObject({
        imageRecoveryPolicy: {
          maxImageAttempts: 8,
          attemptsUsed: 2,
          nextImageDispatchAt: '2026-09-06T12:02:01.000Z',
        },
      });
      await fixture.service.imageAccept({
        runRoot: fixture.runRoot,
        decision: {
          protocolVersion: 1,
          jobId: second.id,
          candidateSha256: second.candidate!.artifact.sha256,
        },
      });
      await fixture.service.compile({ runRoot: fixture.runRoot });
      const compiledState = JSON.parse(
        await readFile(resolve(fixture.runRoot, 'run.json'), 'utf8'),
      );
      expect(
        compiledState.bindings.compilation.assetResolutions.every(
          (asset: { status: string }) => asset.status === 'ready',
        ),
      ).toBe(true);
    },
  );
  it.each([
    [
      'quota',
      { status: 429, message: 'private provider body and credential' },
      'failed',
      'HTTP_429',
    ],
    [
      'transport',
      new TypeError('fetch failed: private endpoint'),
      'uncertain',
      'TRANSPORT_UNKNOWN',
    ],
    ['no image', null, 'failed', 'NO_IMAGE'],
  ])(
    'persists safe %s diagnostics through the real adapter and reuses the job',
    async (_case, error, status, code) => {
      const generateContent = vi.fn(async () => {
        if (error) throw error;
        return { candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] };
      });
      fixture = await createCommandFixture({
        imageGenerator: createGoogleImageAdapter({
          environment: {},
          keySource: () => 'private-key',
          clientFactory: () => ({ models: { generateContent } }),
        }),
        verifyImageGrant: async () => true,
        now: () => new Date('2026-09-06T12:00:00Z'),
      });
      await compilePlaceholder(fixture);
      const first = jobOf(
        await fixture.service.imageStart({
          runRoot: fixture.runRoot,
          request: request(),
          authorization: grant(),
        }),
      );
      expect(first.status).toBe(status);
      expect(first.failure).toContain(code);
      if (!error) expect(first.failure).toContain('IMAGE_SAFETY');
      expect(first.failure).not.toContain('private');
      const observed = jobOf(
        await fixture.service.imageStatus({ runRoot: fixture.runRoot, jobId: first.id }),
      );
      expect(observed).toEqual(first);
      await fixture.service.imageStart({
        runRoot: fixture.runRoot,
        request: request(),
        authorization: grant(),
      });
      expect(generateContent).toHaveBeenCalledTimes(1);
      const checkpoint = JSON.parse(await readFile(resolve(fixture.runRoot, 'run.json'), 'utf8'));
      expect(checkpoint.bindings.images.consumedGrantIds).toEqual(['image-grant-1']);
    },
  );
  it('withdraws only exact accepted bytes with a reason, preserving spend and invalidating consumers', async () => {
    const generate = vi.fn(async () => ({ bytes: PNG, mediaType: 'image/png' as const }));
    fixture = await createCommandFixture({
      imageGenerator: { mode: 'recorded', generate },
      renderer: async () => ({
        bytes: Buffer.from('0000ftypisom'),
        container: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
      }),
    });
    await compilePlaceholder(fixture);
    const job = jobOf(
      await fixture.service.imageStart({ runRoot: fixture.runRoot, request: request() }),
    );
    const decision = {
      protocolVersion: 1,
      jobId: job.id,
      candidateSha256: job.candidate!.artifact.sha256,
    };
    await fixture.service.imageAccept({ runRoot: fixture.runRoot, decision });
    await fixture.service.compile({ runRoot: fixture.runRoot });
    expect((await fixture.service.render({ runRoot: fixture.runRoot })).envelope.outcome).toBe(
      'succeeded',
    );
    const before = JSON.parse(await readFile(resolve(fixture.runRoot, 'run.json'), 'utf8'));
    expect(
      (
        await fixture.service.imageReject({
          runRoot: fixture.runRoot,
          decision: { protocolVersion: 1, jobId: job.id },
        })
      ).envelope.outcome,
    ).toBe('failed');
    expect(
      (
        await fixture.service.imageReject({
          runRoot: fixture.runRoot,
          decision: { ...decision, candidateSha256: '0'.repeat(64), reason: 'Wrong arrow' },
        })
      ).envelope.outcome,
    ).toBe('failed');
    expect(
      (
        await fixture.service.imageReject({
          runRoot: fixture.runRoot,
          decision: { ...decision, reason: 'Thrust arrow points downward' },
        })
      ).envelope.outcome,
    ).toBe('succeeded');
    const after = JSON.parse(await readFile(resolve(fixture.runRoot, 'run.json'), 'utf8'));
    expect(after.bindings.images.jobs).toHaveLength(1);
    expect(after.bindings.images.jobs[0]?.status).toBe('rejected');
    expect(after.quota).toEqual(before.quota);
    expect(after.bindings.images.consumedGrantIds).toEqual(before.bindings.images.consumedGrantIds);
    expect(after.bindings.compilation?.freshness.state).toBe('stale');
    expect(after.bindings.render?.freshness.state).toBe('stale');
    expect(
      (await fixture.service.compile({ runRoot: fixture.runRoot })).envelope.data,
    ).toMatchObject({
      assetWorklist: [{ requirementId: request().requirementId }],
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it.each([1, 2])(
    'preserves rejected jobs and requires a new exact grant within a %i-job ceiling',
    async (ceiling) => {
      const generate = vi.fn(async () => ({ bytes: PNG, mediaType: 'image/png' as const }));
      fixture = await createCommandFixture({
        imageGenerator: { mode: 'live', generate },
        verifyImageGrant: async () => true,
        now: () => new Date('2026-09-06T12:00:00Z'),
      });
      const productionRequest = JSON.parse(await readFile(fixture.requestPath, 'utf8'));
      productionRequest.brief.maxGeneratedImages = ceiling;
      await writeFile(fixture.requestPath, JSON.stringify(productionRequest));
      await compilePlaceholder(fixture);
      const first = jobOf(
        await fixture.service.imageStart({
          runRoot: fixture.runRoot,
          request: request(),
          authorization: grant(),
        }),
      );
      const rejected = await fixture.service.imageReject({
        runRoot: fixture.runRoot,
        decision: { protocolVersion: 1, jobId: first.id },
      });
      expect(jobOf(rejected).status).toBe('rejected');
      const correction = { ...providerRequest, prompt: `${providerRequest.prompt}\nNo lettering.` };
      const revised = {
        ...request(),
        ...correction,
        requestSha256: imageGenerationRequestIdentity(correction),
      };
      const withoutGrant = await fixture.service.imageStart({
        runRoot: fixture.runRoot,
        request: revised,
      });
      expect(jobOf(withoutGrant).id).toBe(first.id);
      expect(generate).toHaveBeenCalledTimes(1);
      if (ceiling === 2) {
        const invalid = await fixture.service.imageStart({
          runRoot: fixture.runRoot,
          request: revised,
          authorization: grant(),
        });
        expect(invalid.envelope.outcome).toBe('failed');
        expect(generate).toHaveBeenCalledTimes(1);
      }
      const second = await fixture.service.imageStart({
        runRoot: fixture.runRoot,
        request: revised,
        authorization: grant({ grantId: 'image-grant-2', requestSha256: revised.requestSha256 }),
      });
      if (ceiling === 1) {
        expect(second.envelope.error?.code).toBe('IMAGE_QUOTA_EXHAUSTED');
        expect(generate).toHaveBeenCalledTimes(1);
        return;
      }
      const next = jobOf(second);
      expect(next.id).not.toBe(first.id);
      expect(generate).toHaveBeenCalledTimes(2);
      expect(
        jobOf(await fixture.service.imageStatus({ runRoot: fixture.runRoot, jobId: first.id }))
          .status,
      ).toBe('rejected');
      expect(
        jobOf(await fixture.service.imageStart({ runRoot: fixture.runRoot, request: request() }))
          .id,
      ).toBe(next.id);
      await fixture.service.imageAccept({
        runRoot: fixture.runRoot,
        decision: {
          protocolVersion: 1,
          jobId: next.id,
          candidateSha256: next.candidate!.artifact.sha256,
        },
      });
      const compiled = await fixture.service.compile({ runRoot: fixture.runRoot });
      expect(compiled.envelope.outcome).toBe('succeeded');
      expect(generate).toHaveBeenCalledTimes(2);
    },
  );

  it('enforces a zero-image ceiling before a provider call', async () => {
    const generate = vi.fn(async () => ({ bytes: PNG, mediaType: 'image/png' as const }));
    fixture = await createCommandFixture({ imageGenerator: { mode: 'recorded', generate } });
    const productionRequest = JSON.parse(await readFile(fixture.requestPath, 'utf8'));
    productionRequest.brief.maxGeneratedImages = 0;
    await writeFile(fixture.requestPath, JSON.stringify(productionRequest));
    await compilePlaceholder(fixture);
    const result = await fixture.service.imageStart({
      runRoot: fixture.runRoot,
      request: request(),
    });
    expect(result.envelope).toMatchObject({
      outcome: 'failed',
      error: { code: 'IMAGE_QUOTA_EXHAUSTED' },
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('counts failed jobs toward the ceiling while allowing observation and reuse', async () => {
    const generate = vi.fn(async () => {
      throw new Error('Provider failed');
    });
    fixture = await createCommandFixture({ imageGenerator: { mode: 'recorded', generate } });
    const productionRequest = JSON.parse(await readFile(fixture.requestPath, 'utf8'));
    productionRequest.brief.maxGeneratedImages = 1;
    await writeFile(fixture.requestPath, JSON.stringify(productionRequest));
    await compilePlaceholder(fixture);
    const first = await fixture.service.imageStart({
      runRoot: fixture.runRoot,
      request: request(),
    });
    const repeated = await fixture.service.imageStart({
      runRoot: fixture.runRoot,
      request: request(),
    });
    expect(repeated.envelope.data).toMatchObject({ disposition: 'reused' });
    const nextPlan = JSON.parse(await readFile(fixture.planPath, 'utf8'));
    const nextRequirement = nextPlan.sections[0].scenes[0].props.assetRequirement;
    nextRequirement.identityKey = 'another-image';
    await writeFile(fixture.planPath, JSON.stringify(nextPlan));
    await fixture.service.validate({ runRoot: fixture.runRoot, planPath: fixture.planPath });
    await fixture.service.preflight({ runRoot: fixture.runRoot });
    await fixture.service.compile({ runRoot: fixture.runRoot });
    const next = await fixture.service.imageStart({
      runRoot: fixture.runRoot,
      request: {
        ...request(),
        requirementId: assetRequirementId(nextRequirement),
        identityKey: 'another-image',
      },
    });
    expect(next.envelope).toMatchObject({
      outcome: 'failed',
      error: { code: 'IMAGE_QUOTA_EXHAUSTED' },
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(jobOf(first).status).toBe('failed');
  });

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
      uri: `vox-asset:sha256:${candidate?.artifact.sha256}`,
    });
    const stateBytes = await readFile(resolve(fixture.runRoot, 'run.json'), 'utf8');
    expect(stateBytes).not.toContain('data:image/png;base64,');
    const reused = await fixture.service.compile({ runRoot: fixture.runRoot });
    expect(reused.envelope.outcome).toBe('succeeded');
    expect(reused.envelope.artifacts).toEqual(recompiled.envelope.artifacts);
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
