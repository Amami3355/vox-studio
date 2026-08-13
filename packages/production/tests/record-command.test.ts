import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CommandFixture,
  VALID_PLAN,
  createCommandFixture,
  recordedResponseFor,
} from './command-fixture';

let fixture: CommandFixture | null = null;
afterEach(async () => fixture?.cleanup());

const prepare = async (target: CommandFixture): Promise<void> => {
  await target.service.init({ requestPath: target.requestPath, out: target.runRoot });
  await target.service.validate({ runRoot: target.runRoot, planPath: target.planPath });
  await target.service.preflight({ runRoot: target.runRoot });
};

const checkpoint = async (target: CommandFixture) =>
  JSON.parse(await readFile(resolve(target.runRoot, 'run.json'), 'utf8')) as {
    revision: number;
    stage: string;
    quota: { newTakesUsed: number };
    bindings: { take: { beatShapeSha256: string; fold: { path: string } } | null };
  };

describe('run record', () => {
  it('performs one autonomous first dispatch, publishes a verified Take and then reuses it', async () => {
    const synthesizer = vi.fn(async () => recordedResponseFor(VALID_PLAN));
    fixture = await createCommandFixture({
      synthesizer,
      now: () => new Date('2026-08-13T12:00:00.000Z'),
    });
    await prepare(fixture);

    const first = await fixture.service.record({ runRoot: fixture.runRoot });
    const second = await fixture.service.record({ runRoot: fixture.runRoot });

    expect(first).toMatchObject({
      exitCode: 0,
      envelope: {
        outcome: 'succeeded',
        run: { stage: 'recorded' },
        data: { disposition: 'recorded', newTakesUsed: 1, maxNewTakes: 2 },
      },
    });
    expect(first.envelope.artifacts.map((artifact) => artifact.kind)).toEqual([
      'take_manifest',
      'take_audio',
      'take_alignment',
      'timed_beat_fold',
    ]);
    expect(second).toMatchObject({
      exitCode: 0,
      envelope: { data: { disposition: 'reused', newTakesUsed: 1 } },
    });
    expect(synthesizer).toHaveBeenCalledTimes(1);
    expect(fixture.network.request).not.toHaveBeenCalled();
  });

  it('reuses audio without quota after a visual repair and refolds after a Beat-id rename', async () => {
    const synthesizer = vi.fn(async () => recordedResponseFor(VALID_PLAN));
    fixture = await createCommandFixture({ synthesizer });
    await prepare(fixture);
    await fixture.service.record({ runRoot: fixture.runRoot });
    const firstState = await checkpoint(fixture);

    const changed = structuredClone(VALID_PLAN);
    changed.beats[0]!.id = 'renamed';
    changed.sections[0]!.spansBeats = ['renamed'];
    changed.sections[0]!.scenes[0]!.spansBeats = ['renamed'];
    changed.sections[0]!.scenes[0]!.props.headline = 'A repaired visual headline';
    await writeFile(fixture.planPath, JSON.stringify(changed));
    await fixture.service.validate({ runRoot: fixture.runRoot, planPath: fixture.planPath });
    await fixture.service.preflight({ runRoot: fixture.runRoot });

    const reused = await fixture.service.record({ runRoot: fixture.runRoot });
    const nextState = await checkpoint(fixture);

    expect(reused.envelope.data).toMatchObject({ disposition: 'reused', newTakesUsed: 1 });
    expect(nextState.bindings.take?.beatShapeSha256).not.toBe(
      firstState.bindings.take?.beatShapeSha256,
    );
    expect(nextState.bindings.take?.fold.path).not.toBe(firstState.bindings.take?.fold.path);
    expect(synthesizer).toHaveBeenCalledTimes(1);
  });

  it('treats changed text as a distinct autonomous Recording input within budget', async () => {
    let plan = VALID_PLAN;
    const synthesizer = vi.fn(async () =>
      recordedResponseFor(plan, Buffer.from(`audio-${plan.beats[0]!.text}`)),
    );
    fixture = await createCommandFixture({ synthesizer });
    await prepare(fixture);
    await fixture.service.record({ runRoot: fixture.runRoot });

    plan = structuredClone(VALID_PLAN);
    plan.beats[0]!.text = `${plan.beats[0]!.text} Tonight.`;
    await writeFile(fixture.planPath, JSON.stringify(plan));
    await fixture.service.validate({ runRoot: fixture.runRoot, planPath: fixture.planPath });
    await fixture.service.preflight({ runRoot: fixture.runRoot });
    const second = await fixture.service.record({ runRoot: fixture.runRoot });

    expect(second.envelope.data).toMatchObject({ disposition: 'recorded', newTakesUsed: 2 });
    expect(synthesizer).toHaveBeenCalledTimes(2);
  });

  it('serializes simultaneous calls so only one provider dispatch can occur', async () => {
    let release: ((value: ReturnType<typeof recordedResponseFor>) => void) | undefined;
    const synthesizer = vi.fn(
      () =>
        new Promise<ReturnType<typeof recordedResponseFor>>((resolveResponse) => {
          release = resolveResponse;
        }),
    );
    fixture = await createCommandFixture({ synthesizer });
    await prepare(fixture);

    const first = fixture.service.record({ runRoot: fixture.runRoot });
    while (!release) await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
    const second = await fixture.service.record({ runRoot: fixture.runRoot });
    release(recordedResponseFor(VALID_PLAN));
    const completed = await first;

    expect(second).toMatchObject({
      exitCode: 1,
      envelope: { error: { code: 'RUN_BUSY' } },
    });
    expect(completed.envelope.outcome).toBe('succeeded');
    expect(synthesizer).toHaveBeenCalledTimes(1);
  });
});
