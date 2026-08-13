import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compile } from '@vox/video';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandFixture, createCommandFixture, seedVerifiedTake } from './command-fixture';

let fixture: CommandFixture | null = null;
afterEach(async () => fixture?.cleanup());

const prepareForCompile = async (target: CommandFixture): Promise<void> => {
  await target.service.init({ requestPath: target.requestPath, out: target.runRoot });
  await target.service.validate({ runRoot: target.runRoot, planPath: target.planPath });
  await target.service.preflight({ runRoot: target.runRoot });
};

const checkpoint = async (target: CommandFixture) =>
  JSON.parse(await readFile(resolve(target.runRoot, 'run.json'), 'utf8')) as {
    revision: number;
    bindings: {
      take: { audio: { path: string } } | null;
      compilation: {
        assetResolutions: Array<{ status: string }>;
        document: { path: string };
        report: { path: string };
      } | null;
    };
  };

describe('run compile', () => {
  it('requires fresh validation, Preflight and a verified Take', async () => {
    fixture = await createCommandFixture();
    await prepareForCompile(fixture);

    const result = await fixture.service.compile({ runRoot: fixture.runRoot });

    expect(result).toMatchObject({
      exitCode: 1,
      envelope: { outcome: 'failed', error: { code: 'COMPILE_PREREQUISITES_STALE' } },
    });
    expect(fixture.network.request).not.toHaveBeenCalled();
  });

  it('reverifies a Take and publishes a green content-addressed compilation with warnings', async () => {
    fixture = await createCommandFixture();
    await prepareForCompile(fixture);
    await seedVerifiedTake(fixture);

    const result = await fixture.service.compile({ runRoot: fixture.runRoot });
    const state = await checkpoint(fixture);

    expect(result.envelope.error).toBeNull();
    expect(result).toMatchObject({
      exitCode: 0,
      envelope: {
        outcome: 'succeeded',
        run: { stage: 'compiled' },
        data: { report: { ok: true, errorCount: 0 } },
      },
    });
    expect(result.envelope.artifacts.map((artifact) => artifact.kind)).toEqual([
      'compiled_document',
      'compile_report',
    ]);
    expect(state.bindings.compilation?.assetResolutions).toEqual([
      expect.objectContaining({ status: 'placeholder' }),
    ]);
    expect(fixture.network.request).not.toHaveBeenCalled();
  });

  it('reuses exact compilation inputs without invoking the compiler twice', async () => {
    const compiler = vi.fn(compile);
    fixture = await createCommandFixture({ compiler });
    await prepareForCompile(fixture);
    await seedVerifiedTake(fixture);

    const first = await fixture.service.compile({ runRoot: fixture.runRoot });
    const beforeRepeat = await checkpoint(fixture);
    const second = await fixture.service.compile({ runRoot: fixture.runRoot });
    const afterRepeat = await checkpoint(fixture);

    expect(second.envelope.artifacts).toEqual(first.envelope.artifacts);
    expect(afterRepeat.revision).toBe(beforeRepeat.revision + 1);
    expect(compiler).toHaveBeenCalledTimes(1);
  });

  it('returns needs_repair without publishing a document when compilation is red', async () => {
    fixture = await createCommandFixture({
      compiler: () => ({
        ok: false,
        document: null,
        report: {
          ok: false,
          errors: [
            {
              code: 'BELOW_MIN_DURATION',
              sceneId: 'station',
              message: 'The verified scene duration is below its hard minimum.',
            },
          ],
          warnings: [],
        },
      }),
    });
    await prepareForCompile(fixture);
    await seedVerifiedTake(fixture);

    const result = await fixture.service.compile({ runRoot: fixture.runRoot });
    const state = await checkpoint(fixture);

    expect(result).toMatchObject({
      exitCode: 0,
      envelope: {
        outcome: 'needs_repair',
        run: { stage: 'recorded' },
        data: { report: { ok: false, errorCount: 1 } },
      },
    });
    expect(result.envelope.artifacts).toEqual([
      expect.objectContaining({ kind: 'compile_report' }),
    ]);
    expect(state.bindings.compilation).toBeNull();
  });

  it('reports changed Take bytes as needs_repair and never recompiles them', async () => {
    const compiler = vi.fn(compile);
    fixture = await createCommandFixture({ compiler });
    await prepareForCompile(fixture);
    await seedVerifiedTake(fixture);
    const state = await checkpoint(fixture);
    await writeFile(resolve(fixture.runRoot, state.bindings.take!.audio.path), 'tampered');

    const result = await fixture.service.compile({ runRoot: fixture.runRoot });

    expect(result).toMatchObject({
      exitCode: 0,
      envelope: { outcome: 'needs_repair', error: { code: 'RUN_ARTIFACT_CHANGED' } },
    });
    expect(compiler).not.toHaveBeenCalled();
    expect(fixture.network.request).not.toHaveBeenCalled();
  });
});
