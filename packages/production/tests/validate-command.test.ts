import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type CommandFixture, VALID_PLAN, createCommandFixture } from './command-fixture';

let fixture: CommandFixture | null = null;
afterEach(async () => fixture?.cleanup());

describe('run validate', () => {
  it('does not mutate the agent plan and binds immutable green snapshots', async () => {
    fixture = await createCommandFixture();
    await fixture.service.init({ requestPath: fixture.requestPath, out: fixture.runRoot });
    const before = await readFile(fixture.planPath, 'utf8');
    const result = await fixture.service.validate({
      runRoot: fixture.runRoot,
      planPath: fixture.planPath,
    });
    const status = await fixture.service.status({ runRoot: fixture.runRoot });

    expect(result).toMatchObject({
      exitCode: 0,
      envelope: {
        outcome: 'succeeded',
        run: { stage: 'validated' },
        data: { report: { ok: true } },
      },
    });
    expect(await readFile(fixture.planPath, 'utf8')).toBe(before);
    expect(result.envelope.artifacts.map((artifact) => artifact.kind)).toEqual([
      'plan_snapshot',
      'validation_report',
    ]);
    expect((status.envelope.data as { artifacts: unknown[] }).artifacts).toHaveLength(3);
    expect(fixture.network.request).not.toHaveBeenCalled();
  });

  it('returns needs_repair with exit 0 for a structurally valid but unknown capability', async () => {
    fixture = await createCommandFixture();
    await fixture.service.init({ requestPath: fixture.requestPath, out: fixture.runRoot });
    const red = structuredClone(VALID_PLAN);
    red.sections[0]!.scenes[0]!.component = 'invented';
    await writeFile(fixture.planPath, JSON.stringify(red));
    const result = await fixture.service.validate({
      runRoot: fixture.runRoot,
      planPath: fixture.planPath,
    });

    expect(result.exitCode).toBe(0);
    expect(result.envelope.outcome).toBe('needs_repair');
    expect(result.envelope.run?.stage).toBe('initialized');
    expect(result.envelope.artifacts).toHaveLength(1);
  });

  it('reuses immutable outputs on an exact repeat while appending a receipt', async () => {
    fixture = await createCommandFixture();
    await fixture.service.init({ requestPath: fixture.requestPath, out: fixture.runRoot });
    const first = await fixture.service.validate({
      runRoot: fixture.runRoot,
      planPath: fixture.planPath,
    });
    const second = await fixture.service.validate({
      runRoot: fixture.runRoot,
      planPath: fixture.planPath,
    });

    expect(second.envelope.artifacts).toEqual(first.envelope.artifacts);
    const status = await fixture.service.status({ runRoot: fixture.runRoot });
    expect(status.envelope.run?.stage).toBe('validated');
  });

  it('stales Preflight and returns to validated when the plan changes', async () => {
    fixture = await createCommandFixture();
    await fixture.service.init({ requestPath: fixture.requestPath, out: fixture.runRoot });
    await fixture.service.validate({ runRoot: fixture.runRoot, planPath: fixture.planPath });
    await fixture.service.preflight({ runRoot: fixture.runRoot });
    const changed = structuredClone(VALID_PLAN);
    changed.sections[0]!.scenes[0]!.props.headline = 'A changed visual headline';
    await writeFile(fixture.planPath, JSON.stringify(changed));

    const result = await fixture.service.validate({
      runRoot: fixture.runRoot,
      planPath: fixture.planPath,
    });
    const status = await fixture.service.status({ runRoot: fixture.runRoot });

    expect(result.envelope.run?.stage).toBe('validated');
    expect((status.envelope.data as { staleStages: string[] }).staleStages).toContain(
      'preflighted',
    );
  });

  /**
   * The fact the proof harness reads plans through the binding rather than from a name in the
   * work root: what a Run binds is the plan it was handed, and a reader that goes through the
   * descriptor sees the same plan an agent submitted.
   *
   * The two are deliberately **not** compared as bytes. The snapshot is written in canonical
   * form — keys sorted, whitespace fixed — so a handed file and its snapshot differ in bytes
   * whenever the agent's own formatting differs, and they do here. The claim that matters is
   * that they parse to the same plan, because every reader of either one parses it first.
   */
  it('binds a snapshot that parses equal to the plan it was handed', async () => {
    fixture = await createCommandFixture();
    await fixture.service.init({ requestPath: fixture.requestPath, out: fixture.runRoot });
    await fixture.service.validate({ runRoot: fixture.runRoot, planPath: fixture.planPath });

    const checkpoint = JSON.parse(await readFile(join(fixture.runRoot, 'run.json'), 'utf8')) as {
      bindings: { plan?: { snapshot: { path: string } } };
    };
    const snapshotPath = checkpoint.bindings.plan?.snapshot.path;
    expect(snapshotPath).toBeDefined();
    const snapshot = await readFile(resolve(fixture.runRoot, snapshotPath!), 'utf8');
    const handed = await readFile(fixture.planPath, 'utf8');

    expect(JSON.parse(snapshot)).toEqual(JSON.parse(handed));
    expect(snapshot).not.toBe(handed);
  });
});
