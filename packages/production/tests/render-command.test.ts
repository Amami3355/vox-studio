import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compile } from '@vox/video';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RenderAdapter } from '../src/render/remotion';
import { type CommandFixture, createCommandFixture, seedVerifiedTake } from './command-fixture';

const VALID_MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x10, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00,
]);

const fakeRenderer = (): ReturnType<typeof vi.fn<RenderAdapter>> =>
  vi.fn(async () => ({
    bytes: VALID_MP4,
    container: 'mp4' as const,
    videoCodec: 'h264' as const,
    audioCodec: 'aac' as const,
  }));

let fixture: CommandFixture | null = null;
afterEach(async () => fixture?.cleanup());

const prepareRecorded = async (target: CommandFixture): Promise<void> => {
  await target.service.init({ requestPath: target.requestPath, out: target.runRoot });
  await target.service.validate({ runRoot: target.runRoot, planPath: target.planPath });
  await target.service.preflight({ runRoot: target.runRoot });
  await seedVerifiedTake(target);
};

const checkpoint = async (target: CommandFixture) =>
  JSON.parse(await readFile(resolve(target.runRoot, 'run.json'), 'utf8')) as {
    revision: number;
    bindings: {
      compilation: { document: { path: string } } | null;
      render: {
        preview: { path: string; sha256: string };
        assetResolutions: Array<{ status: string; reason: string | null }>;
      } | null;
    };
  };

describe('run render', () => {
  it('observes measured render progress without changing receipts or authorizing completion', async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const active = new Promise<void>((done) => {
      started = done;
    });
    fixture = await createCommandFixture({
      renderer: async ({ onProgress }) => {
        onProgress?.({
          phase: 'render',
          elapsedMs: 1234,
          renderedFrames: 25,
          encodedFrames: 20,
          totalFrames: 50,
        });
        started();
        await gate;
        return { bytes: VALID_MP4, container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' };
      },
    });
    await prepareRecorded(fixture);
    await fixture.service.compile({ runRoot: fixture.runRoot });
    const before = await checkpoint(fixture);
    const render = fixture.service.render({ runRoot: fixture.runRoot });
    await active;
    try {
      const observation = await fixture.service.progress({ runRoot: fixture.runRoot });
      expect(observation.envelope).toMatchObject({
        command: 'run.progress',
        run: null,
        artifacts: [],
        data: { activity: { phase: 'render', renderedFrames: 25, totalFrames: 50 } },
      });
      expect((await checkpoint(fixture)).revision).toBe(before.revision);
    } finally {
      release();
    }
    expect((await render).exitCode).toBe(0);
    expect((await fixture.service.progress({ runRoot: fixture.runRoot })).envelope.data).toEqual({
      activity: null,
    });
  });

  it('requires a fresh compilation and never calls the renderer early', async () => {
    const renderer = fakeRenderer();
    fixture = await createCommandFixture({ renderer });
    await prepareRecorded(fixture);

    const result = await fixture.service.render({ runRoot: fixture.runRoot });

    expect(result).toMatchObject({
      exitCode: 1,
      envelope: { outcome: 'failed', error: { code: 'RENDER_PREREQUISITES_STALE' } },
    });
    expect(renderer).not.toHaveBeenCalled();
  });

  it('renders H.264/AAC MP4 and preserves placeholder state in the binding', async () => {
    const renderer = fakeRenderer();
    fixture = await createCommandFixture({ renderer });
    await prepareRecorded(fixture);
    await fixture.service.compile({ runRoot: fixture.runRoot });

    const result = await fixture.service.render({ runRoot: fixture.runRoot });
    const state = await checkpoint(fixture);
    const preview = await readFile(resolve(fixture.runRoot, state.bindings.render!.preview.path));

    expect(result).toMatchObject({
      exitCode: 0,
      envelope: {
        outcome: 'succeeded',
        run: { stage: 'rendered' },
        data: { preview: { kind: 'preview' } },
      },
    });
    expect(preview).toEqual(VALID_MP4);
    expect(state.bindings.render?.assetResolutions).toEqual([
      expect.objectContaining({ status: 'placeholder' }),
    ]);
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(fixture.network.request).not.toHaveBeenCalled();
  });

  it('reuses exact render inputs while appending another receipt', async () => {
    const renderer = fakeRenderer();
    fixture = await createCommandFixture({ renderer });
    await prepareRecorded(fixture);
    await fixture.service.compile({ runRoot: fixture.runRoot });
    const first = await fixture.service.render({ runRoot: fixture.runRoot });
    const beforeRepeat = await checkpoint(fixture);

    const second = await fixture.service.render({ runRoot: fixture.runRoot });
    const afterRepeat = await checkpoint(fixture);

    expect(second.envelope.artifacts).toEqual(first.envelope.artifacts);
    expect(afterRepeat.revision).toBe(beforeRepeat.revision + 1);
    expect(renderer).toHaveBeenCalledTimes(1);
  });

  it('keeps failed assets distinct and renders their non-resource fallback', async () => {
    const renderer = fakeRenderer();
    fixture = await createCommandFixture({
      renderer,
      compiler: (input) => {
        const result = compile(input);
        if (!result.ok) return result;
        const document = structuredClone(result.document);
        document.sections[0]!.scenes[0]!.assets = {
          assetRequirement: {
            status: 'failed',
            uri: 'asset://placeholder/image',
            requirementId: 'missing-station',
            reason: 'The local asset failed verification.',
          },
        };
        return { ...result, document };
      },
    });
    await prepareRecorded(fixture);
    await fixture.service.compile({ runRoot: fixture.runRoot });

    const result = await fixture.service.render({ runRoot: fixture.runRoot });
    const state = await checkpoint(fixture);

    expect(result.envelope.outcome).toBe('succeeded');
    expect(state.bindings.render?.assetResolutions).toEqual([
      expect.objectContaining({
        status: 'failed',
        reason: 'The local asset failed verification.',
      }),
    ]);
  });

  it('returns needs_repair for a ready asset the service cannot read', async () => {
    const renderer = fakeRenderer();
    fixture = await createCommandFixture({
      renderer,
      compiler: (input) => {
        const result = compile(input);
        if (!result.ok) return result;
        const document = structuredClone(result.document);
        document.sections[0]!.scenes[0]!.assets = {
          assetRequirement: {
            status: 'ready',
            uri: 'file:///C:/definitely-missing/vox-production-asset.png',
          },
        };
        return { ...result, document };
      },
    });
    await prepareRecorded(fixture);
    await fixture.service.compile({ runRoot: fixture.runRoot });

    const result = await fixture.service.render({ runRoot: fixture.runRoot });

    expect(result).toMatchObject({
      exitCode: 0,
      envelope: { outcome: 'needs_repair', error: { code: 'ASSET_NOT_SERVICE_READABLE' } },
    });
    expect(renderer).not.toHaveBeenCalled();
  });

  it('rejects invalid media without publishing a render binding', async () => {
    const renderer = vi.fn(async () => ({
      bytes: Buffer.from('not-an-mp4'),
      container: 'mp4' as const,
      videoCodec: 'h264' as const,
      audioCodec: 'aac' as const,
    }));
    fixture = await createCommandFixture({ renderer });
    await prepareRecorded(fixture);
    await fixture.service.compile({ runRoot: fixture.runRoot });

    const result = await fixture.service.render({ runRoot: fixture.runRoot });
    const state = await checkpoint(fixture);

    expect(result).toMatchObject({
      exitCode: 1,
      envelope: { outcome: 'failed', error: { code: 'COMMAND_FAILED' } },
    });
    expect(state.bindings.render).toBeNull();
  });

  it('detects a changed Compiled document before the renderer is invoked', async () => {
    const renderer = fakeRenderer();
    fixture = await createCommandFixture({ renderer });
    await prepareRecorded(fixture);
    await fixture.service.compile({ runRoot: fixture.runRoot });
    const state = await checkpoint(fixture);
    await writeFile(
      resolve(fixture.runRoot, state.bindings.compilation!.document.path),
      '{"tampered":true}',
    );

    const result = await fixture.service.render({ runRoot: fixture.runRoot });

    expect(result).toMatchObject({
      exitCode: 0,
      envelope: { outcome: 'needs_repair', error: { code: 'RUN_ARTIFACT_CHANGED' } },
    });
    expect(renderer).not.toHaveBeenCalled();
  });
});
