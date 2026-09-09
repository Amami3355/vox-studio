import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createElevenLabsAdapter } from '@vox/voice';
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
  it('exposes a durable receipt while synthesis still holds the command lease', async () => {
    let releaseBody = () => {};
    let headersSaved = () => {};
    const bodyGate = new Promise<void>((resolve) => {
      releaseBody = resolve;
    });
    const headersGate = new Promise<void>((resolve) => {
      headersSaved = resolve;
    });
    const recorded = recordedResponseFor(VALID_PLAN);
    const response = Response.json(
      {
        audio_base64: Buffer.from(recorded.audio).toString('base64'),
        alignment: recorded.alignment,
      },
      { headers: { 'character-cost': '3000' } },
    );
    const read = response.json.bind(response);
    vi.spyOn(response, 'json').mockImplementation(async () => {
      headersSaved();
      await bodyGate;
      return read();
    });
    fixture = await createCommandFixture({
      synthesizer: createElevenLabsAdapter({
        apiKey: 'fixture',
        fetchImpl: vi.fn(async () => response),
        now: () => new Date('2026-09-09T12:00:00Z'),
      }),
    });
    await prepare(fixture);
    const recording = fixture.service.record({ runRoot: fixture.runRoot });
    try {
      await headersGate;
      const status = await fixture.service.status({ runRoot: fixture.runRoot });
      expect(status.exitCode).toBe(0);
      expect(status.envelope.data?.recordingConsumption).toEqual([
        expect.objectContaining({
          status: 'dispatching',
          consumption: expect.objectContaining({
            characterCost: 3000,
            estimatedNanoUsd: 300_000_000,
          }),
        }),
      ]);
    } finally {
      releaseBody();
      await recording;
    }
  });

  it.each(['valid', 'invalid-alignment', 'invalid-json', 'http-error'])(
    'retains measured consumption through %s, restart and reuse',
    async (mode) => {
      let crash = mode === 'valid';
      const recorded = recordedResponseFor(VALID_PLAN);
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            mode === 'invalid-json'
              ? '{invalid'
              : JSON.stringify({
                  audio_base64: Buffer.from(recorded.audio).toString('base64'),
                  alignment: mode === 'invalid-alignment' ? {} : recorded.alignment,
                }),
            {
              status: mode === 'http-error' ? 500 : 200,
              headers: { 'character-cost': '3000', 'request-id': 'fixture-request' },
            },
          ),
      );
      fixture = await createCommandFixture({
        synthesizer: createElevenLabsAdapter({
          apiKey: 'test-only',
          fetchImpl,
          now: () => new Date('2026-09-09T12:00:00Z'),
        }),
        recordingCrashAt: (point) => {
          if (crash && point === 'after_response_received') {
            crash = false;
            throw new Error('INJECTED_CRASH');
          }
        },
      });
      await prepare(fixture);
      await fixture.service.record({ runRoot: fixture.runRoot });
      const receipt = {
        provider: 'elevenlabs',
        model: REQUEST.production.voice.modelId,
        characterCost: 3000,
        estimatedNanoUsd: 300_000_000,
        requestId: 'fixture-request',
      };
      const observed = await fixture.service.status({ runRoot: fixture.runRoot });
      expect(observed.envelope.data?.recordingConsumption).toEqual([
        expect.objectContaining({
          status: mode === 'valid' ? 'response_received' : 'failed',
          consumption: expect.objectContaining(receipt),
        }),
      ]);
      const resumed = await fixture.service.record({ runRoot: fixture.runRoot });
      if (mode === 'valid') {
        expect(resumed.envelope.data?.disposition).toBe('recorded');
        const reused = await fixture.service.record({ runRoot: fixture.runRoot });
        expect(reused.envelope.data?.disposition).toBe('reused');
      } else {
        expect(resumed.envelope.outcome).toBe('paused');
      }
      const after = await fixture.service.status({ runRoot: fixture.runRoot });
      expect(after.envelope.data?.recordingConsumption).toEqual([
        expect.objectContaining({ consumption: expect.objectContaining(receipt) }),
      ]);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

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
