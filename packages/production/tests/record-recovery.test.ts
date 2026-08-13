import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Bytes } from '../src/canonical-json';
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

const replacementGrant = async (target: CommandFixture): Promise<string> => {
  const path = join(target.root, 'recovery-grant.json');
  await writeFile(
    path,
    JSON.stringify({
      protocolVersion: 1,
      grantId: 'recovery-grant',
      runId: 'run-command-test',
      recordingInputSha256: recordingInputIdentity(VALID_PLAN, REQUEST),
      issuedAt: '2026-08-13T12:00:00.000Z',
      grant: 'trusted',
    }),
  );
  return path;
};

describe('record crash recovery', () => {
  it('turns a durable dispatch without a response into uncertainty and never retries it', async () => {
    let crash = true;
    const synthesizer = vi.fn(async () => recordedResponseFor(VALID_PLAN));
    fixture = await createCommandFixture({
      synthesizer,
      verifyReplacementGrant: () => true,
      recordingCrashAt: (point) => {
        if (crash && point === 'after_dispatch') {
          crash = false;
          throw new Error('INJECTED_CRASH:after_dispatch');
        }
      },
    });
    await prepare(fixture);

    const interrupted = await fixture.service.record({ runRoot: fixture.runRoot });
    await writeFile(
      join(fixture.ledgerRoot, `${sha256Bytes('run-command-test')}.lease`),
      JSON.stringify({
        token: 'killed-owner',
        processId: 999_999,
        expiresAt: '2000-01-01T00:00:00.000Z',
      }),
    );
    const paused = await fixture.service.record({ runRoot: fixture.runRoot });
    const grant = await replacementGrant(fixture);
    const replacement = await fixture.service.record({
      runRoot: fixture.runRoot,
      replacementAuthorisationPath: grant,
    });

    expect(interrupted).toMatchObject({
      exitCode: 1,
      envelope: { error: { code: 'COMMAND_FAILED' } },
    });
    expect(paused).toMatchObject({
      exitCode: 0,
      envelope: { outcome: 'paused' },
    });
    expect(replacement.envelope.data).toMatchObject({
      disposition: 'replacement_recorded',
      newTakesUsed: 2,
    });
    expect(synthesizer).toHaveBeenCalledTimes(1);
  });

  it('recovers a complete private response without another provider call', async () => {
    let crash = true;
    const synthesizer = vi.fn(async () => recordedResponseFor(VALID_PLAN));
    fixture = await createCommandFixture({
      synthesizer,
      recordingCrashAt: (point) => {
        if (crash && point === 'after_response_received') {
          crash = false;
          throw new Error('INJECTED_CRASH:after_response_received');
        }
      },
    });
    await prepare(fixture);

    const interrupted = await fixture.service.record({ runRoot: fixture.runRoot });
    const beforeRecovery = await readdir(join(fixture.runRoot, 'artifacts'));
    const recovered = await fixture.service.record({ runRoot: fixture.runRoot });

    expect(interrupted.exitCode).toBe(1);
    expect(beforeRecovery).not.toContain('takes');
    expect(recovered).toMatchObject({
      exitCode: 0,
      envelope: {
        outcome: 'succeeded',
        data: { disposition: 'recorded', newTakesUsed: 1 },
      },
    });
    expect(synthesizer).toHaveBeenCalledTimes(1);
  });
});
