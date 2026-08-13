import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordingInputIdentity } from '../src/run-store/identities';
import {
  type CommandFixture,
  VALID_PLAN,
  createCommandFixture,
  recordedResponseFor,
} from './command-fixture';
import { REQUEST } from './run-fixture';

let fixture: CommandFixture | null = null;
afterEach(async () => fixture?.cleanup());

const prepare = async (target: CommandFixture): Promise<void> => {
  await target.service.init({ requestPath: target.requestPath, out: target.runRoot });
  await target.service.validate({ runRoot: target.runRoot, planPath: target.planPath });
  await target.service.preflight({ runRoot: target.runRoot });
};

const writeGrant = async (
  target: CommandFixture,
  overrides: Record<string, unknown> = {},
): Promise<string> => {
  const path = join(target.root, `grant-${String(overrides.grantId ?? 'one')}.json`);
  await writeFile(
    path,
    JSON.stringify({
      protocolVersion: 1,
      grantId: 'grant-one',
      runId: 'run-command-test',
      recordingInputSha256: recordingInputIdentity(VALID_PLAN, REQUEST),
      issuedAt: '2026-08-13T12:00:00.000Z',
      grant: 'authenticated-operator-value',
      ...overrides,
    }),
  );
  return path;
};

describe('replacement authorisation', () => {
  it('pauses after a failed dispatch and performs no second network call without a grant', async () => {
    const synthesizer = vi.fn(async () => {
      throw new Error('provider unavailable');
    });
    fixture = await createCommandFixture({ synthesizer });
    await prepare(fixture);

    const failed = await fixture.service.record({ runRoot: fixture.runRoot });
    const paused = await fixture.service.record({ runRoot: fixture.runRoot });

    expect(failed).toMatchObject({
      exitCode: 1,
      envelope: {
        outcome: 'failed',
        run: { stage: 'preflighted' },
        error: { code: 'SYNTHESIS_PROVIDER_FAILED' },
      },
    });
    expect(paused).toMatchObject({
      exitCode: 0,
      envelope: { outcome: 'paused', run: { stage: 'preflighted' } },
    });
    expect(synthesizer).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed, wrongly scoped and unauthenticated grants before dispatch', async () => {
    const synthesizer = vi
      .fn()
      .mockRejectedValueOnce(new Error('first dispatch failed'))
      .mockResolvedValue(recordedResponseFor(VALID_PLAN));
    const verifier = vi.fn((grant: { grant: string }) => grant.grant === 'trusted');
    fixture = await createCommandFixture({ synthesizer, verifyReplacementGrant: verifier });
    await prepare(fixture);
    await fixture.service.record({ runRoot: fixture.runRoot });

    const malformed = join(fixture.root, 'malformed-grant.json');
    await writeFile(malformed, '{}');
    const wrongScope = await writeGrant(fixture, { grantId: 'wrong-scope', runId: 'another-run' });
    const unauthenticated = await writeGrant(fixture, {
      grantId: 'unauthenticated',
      grant: 'forged',
    });

    expect(
      await fixture.service.record({
        runRoot: fixture.runRoot,
        replacementAuthorisationPath: malformed,
      }),
    ).toMatchObject({ envelope: { error: { code: 'REPLACEMENT_GRANT_INVALID' } } });
    expect(
      await fixture.service.record({
        runRoot: fixture.runRoot,
        replacementAuthorisationPath: wrongScope,
      }),
    ).toMatchObject({ envelope: { error: { code: 'REPLACEMENT_GRANT_SCOPE_MISMATCH' } } });
    expect(
      await fixture.service.record({
        runRoot: fixture.runRoot,
        replacementAuthorisationPath: unauthenticated,
      }),
    ).toMatchObject({
      envelope: { error: { code: 'REPLACEMENT_AUTHORIZATION_INVALID' } },
    });
    expect(synthesizer).toHaveBeenCalledTimes(1);
  });

  it('consumes an authenticated grant once, records a replacement and rejects replay', async () => {
    const synthesizer = vi
      .fn()
      .mockRejectedValueOnce(new Error('first dispatch failed'))
      .mockResolvedValueOnce(recordedResponseFor(VALID_PLAN, Buffer.from('replacement-audio')));
    fixture = await createCommandFixture({
      synthesizer,
      verifyReplacementGrant: (grant) => grant.grant === 'authenticated-operator-value',
    });
    await prepare(fixture);
    await fixture.service.record({ runRoot: fixture.runRoot });
    const grant = await writeGrant(fixture);

    const replacement = await fixture.service.record({
      runRoot: fixture.runRoot,
      replacementAuthorisationPath: grant,
    });
    const replay = await fixture.service.record({
      runRoot: fixture.runRoot,
      replacementAuthorisationPath: grant,
    });

    expect(replacement).toMatchObject({
      exitCode: 0,
      envelope: {
        outcome: 'succeeded',
        data: { disposition: 'replacement_recorded', newTakesUsed: 2 },
      },
    });
    expect(replay).toMatchObject({
      exitCode: 1,
      envelope: { outcome: 'failed', error: { code: 'GRANT_REPLAYED' } },
    });
    expect(synthesizer).toHaveBeenCalledTimes(2);
  });

  it('never lets a valid grant override maxNewTakes', async () => {
    const synthesizer = vi.fn(async () => {
      throw new Error('charged failure');
    });
    fixture = await createCommandFixture({
      synthesizer,
      verifyReplacementGrant: () => true,
    });
    await writeFile(
      fixture.requestPath,
      JSON.stringify({ ...REQUEST, production: { ...REQUEST.production, maxNewTakes: 1 } }),
    );
    await prepare(fixture);
    await fixture.service.record({ runRoot: fixture.runRoot });
    const grant = await writeGrant(fixture);

    const result = await fixture.service.record({
      runRoot: fixture.runRoot,
      replacementAuthorisationPath: grant,
    });

    expect(result).toMatchObject({ exitCode: 0, envelope: { outcome: 'paused' } });
    expect(synthesizer).toHaveBeenCalledTimes(1);
  });
});
