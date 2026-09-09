import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../src/canonical-json';
import { imageJobSchema } from '../src/contracts/schemas';
import {
  PRODUCTION_LIMIT_DEFAULTS,
  type StudioAuthorization,
} from '../src/contracts/studio-authorization';
import { imageGenerationRequestIdentity } from '../src/run-store/identities';
import { RunStore } from '../src/run-store/run-store';
import {
  type CommandFixture,
  VALID_PLAN,
  createCommandFixture,
  recordedResponseFor,
} from './command-fixture';

const key = 'studio-test-signing-key-32-characters';
let fixture: CommandFixture;
afterEach(async () => fixture?.cleanup());

function sign(
  value: Omit<StudioAuthorization, 'signature'> & { signature?: string },
): StudioAuthorization {
  const { signature: _signature, ...unsigned } = value;
  return {
    ...unsigned,
    signature: createHmac('sha256', key).update(canonicalJson(unsigned)).digest('hex'),
  };
}
async function initialize(options: Parameters<typeof createCommandFixture>[0] = {}) {
  fixture = await createCommandFixture({
    studioAuthorizationKey: key,
    synthesizer: vi.fn(async () => recordedResponseFor(VALID_PLAN)),
    ...options,
  });
  expect(
    (await fixture.service.init({ requestPath: fixture.requestPath, out: fixture.runRoot }))
      .exitCode,
  ).toBe(0);
  const checkpoint = JSON.parse(await readFile(join(fixture.runRoot, 'run.json'), 'utf8'));
  return sign({
    schemaVersion: 1,
    decisionId: randomUUID(),
    runId: checkpoint.runId,
    requestSha256: checkpoint.request.requestSha256,
    previousDecisionId: null,
    limits: {
      maxCalls: 80,
      maxSearches: 6,
      maxImages: 12,
      maxTakes: 2,
      maxImageCorrections: 3,
      maxEditorialCorrections: 2,
      maxFilmCorrections: 2,
      maxTechnicalRepairs: 2,
    },
    issuedAt: '2020-01-01T00:00:00Z',
    expiresAt: '2099-01-01T00:00:00Z',
  });
}

describe('Studio user authorization in Production', { timeout: 15_000 }, () => {
  it.each([false, true])(
    'migrates an exhausted image ceiling (unlimited=%s) without forgetting jobs or grants',
    async (unlimited) => {
      const bytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      );
      const generate = vi.fn(async () => ({ bytes, mediaType: 'image/png' as const }));
      const initial = sign({
        ...(await initialize({
          studioImageGrantKey: key,
          imageGenerator: { mode: 'live', generate },
          verifyImageGrant: (grant) => {
            const { grant: signature, ...unsigned } = grant;
            return (
              signature === createHmac('sha256', key).update(canonicalJson(unsigned)).digest('hex')
            );
          },
        })),
        limits: {
          maxCalls: 80,
          maxSearches: 6,
          maxImages: 1,
          maxTakes: 2,
          maxImageCorrections: 3,
          maxEditorialCorrections: 2,
          maxFilmCorrections: 2,
          maxTechnicalRepairs: 2,
        },
      });
      expect(
        (await fixture.service.authorize({ runRoot: fixture.runRoot, authorization: initial }))
          .exitCode,
      ).toBe(0);
      await fixture.service.validate({ runRoot: fixture.runRoot, planPath: fixture.planPath });
      await fixture.service.preflight({ runRoot: fixture.runRoot });
      await fixture.service.record({ runRoot: fixture.runRoot });
      await fixture.service.compile({ runRoot: fixture.runRoot });
      const request = (prompt: string) => {
        const provider = {
          prompt,
          aspectRatio: '16:9' as const,
          outputMimeType: 'image/png' as const,
          seed: 7,
        };
        return {
          protocolVersion: 1,
          requirementId: 'req_ccb9f349',
          identityKey: 'req_ccb9f349',
          ...provider,
          requestSha256: imageGenerationRequestIdentity(provider),
        };
      };
      const first = await fixture.service.imageStart({
        runRoot: fixture.runRoot,
        request: request('First candidate'),
      });
      expect(first.envelope.error).toBeNull();
      const job = imageJobSchema.parse((first.envelope.data as { job: unknown }).job);
      await fixture.service.imageReject({
        runRoot: fixture.runRoot,
        decision: {
          protocolVersion: 1,
          jobId: job.id,
          candidateSha256: job.candidate!.artifact.sha256,
          reason: 'Correct its direction.',
        },
      });
      const secondRequest = request('Corrected candidate');
      expect(
        (await fixture.service.imageStart({ runRoot: fixture.runRoot, request: secondRequest }))
          .envelope.error?.code,
      ).toBe('IMAGE_QUOTA_EXHAUSTED');
      expect(generate).toHaveBeenCalledTimes(1);
      const extension = sign({
        ...initial,
        decisionId: randomUUID(),
        previousDecisionId: initial.decisionId,
        limits: unlimited ? PRODUCTION_LIMIT_DEFAULTS : { ...initial.limits, maxImages: 2 },
        expiresAt: unlimited ? null : initial.expiresAt,
      });
      expect(
        (await fixture.service.authorize({ runRoot: fixture.runRoot, authorization: extension }))
          .exitCode,
      ).toBe(0);
      expect(
        (await fixture.service.imageStart({ runRoot: fixture.runRoot, request: secondRequest }))
          .exitCode,
      ).toBe(0);
      expect(
        (await fixture.service.imageStart({ runRoot: fixture.runRoot, request: secondRequest }))
          .exitCode,
      ).toBe(0);
      expect(generate).toHaveBeenCalledTimes(2);
      const checkpoint = JSON.parse(await readFile(join(fixture.runRoot, 'run.json'), 'utf8'));
      expect(checkpoint.bindings.images.jobs).toHaveLength(2);
      expect(checkpoint.bindings.images.jobs[0].id).toBe(job.id);
      expect(checkpoint.bindings.images.consumedGrantIds).toHaveLength(2);
    },
  );
  it('removes historical recording ceilings without erasing usage or allowing a later finite cap', async () => {
    const initial = await initialize();
    expect(
      (await fixture.service.authorize({ runRoot: fixture.runRoot, authorization: initial }))
        .exitCode,
    ).toBe(0);
    await fixture.service.validate({ runRoot: fixture.runRoot, planPath: fixture.planPath });
    await fixture.service.preflight({ runRoot: fixture.runRoot });
    expect((await fixture.service.record({ runRoot: fixture.runRoot })).exitCode).toBe(0);
    const unlimited = sign({
      ...initial,
      decisionId: randomUUID(),
      previousDecisionId: initial.decisionId,
      limits: PRODUCTION_LIMIT_DEFAULTS,
      expiresAt: null,
    });
    expect(
      (await fixture.service.authorize({ runRoot: fixture.runRoot, authorization: unlimited }))
        .exitCode,
    ).toBe(0);
    const saved = JSON.parse(await readFile(join(fixture.runRoot, 'run.json'), 'utf8'));
    expect(saved.quota.maxNewTakes).toBeNull();
    expect(saved.quota.newTakesUsed).toBe(1);
    expect(
      (await fixture.service.status({ runRoot: fixture.runRoot })).envelope.data,
    ).toMatchObject({ studioAuthorization: unlimited });
    const limited = sign({
      ...unlimited,
      decisionId: randomUUID(),
      previousDecisionId: unlimited.decisionId,
      limits: { ...unlimited.limits, maxCalls: 400 },
    });
    expect(
      (await fixture.service.authorize({ runRoot: fixture.runRoot, authorization: limited }))
        .envelope.error?.code,
    ).toBe('STUDIO_LIMIT_DECREASE');
  });
  it('persists an extension in the same receipt chain and preserves consumed recording quota', async () => {
    const initial = await initialize();
    const authorize = (authorization: StudioAuthorization) =>
      fixture.service.authorize({ runRoot: fixture.runRoot, authorization });
    expect((await authorize(initial)).exitCode).toBe(0);
    const firstBytes = await readFile(join(fixture.runRoot, 'run.json'));
    expect((await authorize(initial)).exitCode).toBe(0);
    expect(await readFile(join(fixture.runRoot, 'run.json'))).toEqual(firstBytes);
    await fixture.service.validate({ runRoot: fixture.runRoot, planPath: fixture.planPath });
    await fixture.service.preflight({ runRoot: fixture.runRoot });
    expect((await fixture.service.record({ runRoot: fixture.runRoot })).exitCode).toBe(0);
    const before = JSON.parse(await readFile(join(fixture.runRoot, 'run.json'), 'utf8'));
    const extension = sign({
      ...initial,
      decisionId: randomUUID(),
      previousDecisionId: initial.decisionId,
      limits: { ...initial.limits, maxImages: 20, maxTakes: 3 },
    });
    expect(await authorize(extension)).toMatchObject({
      exitCode: 0,
      envelope: { outcome: 'succeeded' },
    });
    const after = JSON.parse(await readFile(join(fixture.runRoot, 'run.json'), 'utf8'));
    expect(after.runId).toBe(before.runId);
    expect(after.quota).toEqual({ ...before.quota, maxNewTakes: 3 });
    expect(after.quota.newTakesUsed).toBe(1);
    expect(after.bindings.take).toEqual(before.bindings.take);
    expect(after.bindings.images).toEqual(before.bindings.images);
    expect(after.revision).toBe(before.revision + 1);
    expect(
      (await fixture.service.status({ runRoot: fixture.runRoot })).envelope.data,
    ).toMatchObject({ studioAuthorization: extension });
    const store = new RunStore({
      runRoot: fixture.runRoot,
      ledgerRoot: fixture.ledgerRoot,
      runId: after.runId,
      hmacKey: 'command-test-secret',
      keyId: 'command-test-key',
    });
    expect((await store.inspect()).bindings.studioAuthorization).toEqual(extension);
    expect((await authorize(initial)).envelope.error?.code).toBe('STUDIO_AUTHORIZATION_STALE');
  });

  it('refuses forgery, wrong work, expiry, stale predecessors and decreased totals', async () => {
    const initial = await initialize();
    const authorize = (authorization: StudioAuthorization) =>
      fixture.service.authorize({ runRoot: fixture.runRoot, authorization });
    expect((await authorize({ ...initial, signature: '0'.repeat(64) })).envelope.error?.code).toBe(
      'STUDIO_AUTHORIZATION_INVALID',
    );
    expect((await authorize(sign({ ...initial, runId: 'another-run' }))).envelope.error?.code).toBe(
      'STUDIO_AUTHORIZATION_MISMATCH',
    );
    expect(
      (await authorize(sign({ ...initial, expiresAt: '2021-01-01T00:00:00Z' }))).envelope.error
        ?.code,
    ).toBe('STUDIO_AUTHORIZATION_EXPIRED');
    expect((await authorize(initial)).exitCode).toBe(0);
    const rebound = sign({ ...initial, limits: { ...initial.limits, maxImages: 20 } });
    expect((await authorize(rebound)).envelope.error?.code).toBe('STUDIO_AUTHORIZATION_REBOUND');
    const decreased = sign({
      ...initial,
      decisionId: randomUUID(),
      previousDecisionId: initial.decisionId,
      limits: { ...initial.limits, maxCalls: 40 },
    });
    expect((await authorize(decreased)).envelope.error?.code).toBe('STUDIO_LIMIT_DECREASE');
  });
});
