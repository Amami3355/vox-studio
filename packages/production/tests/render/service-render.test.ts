import { execFile } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { VideoPlan } from '@vox/video';
import type { Alignment } from '@vox/voice';
import { afterEach, describe, expect, it } from 'vitest';
import { createRemotionRenderAdapter } from '../../src/render/remotion';
import { type CommandFixture, createCommandFixture, seedVerifiedTake } from '../command-fixture';

const execFileAsync = promisify(execFile);

let fixture: CommandFixture | null = null;
afterEach(async () => fixture?.cleanup());

describe('Production service Remotion boundary', () => {
  it('compiles and renders the recorded vertical slice as H.264/AAC', async () => {
    const plan = JSON.parse(
      await readFile(resolve('packages/video/src/plans/vertical-slice.plan.json'), 'utf8'),
    ) as VideoPlan;
    const audio = await readFile(resolve('packages/video/public/vertical-slice.vo.mp3'));
    const alignment = JSON.parse(
      await readFile(
        resolve('packages/voice/tests/fixtures/vertical-slice.alignment.json'),
        'utf8',
      ),
    ) as Alignment;
    fixture = await createCommandFixture({
      renderer: createRemotionRenderAdapter({
        entryPoint: resolve('packages/video/src/remotion-entry.ts'),
      }),
      rendererVersion: 'remotion-4.0.508',
    });
    await writeFile(fixture.planPath, JSON.stringify(plan));
    await fixture.service.init({ requestPath: fixture.requestPath, out: fixture.runRoot });
    await fixture.service.validate({ runRoot: fixture.runRoot, planPath: fixture.planPath });
    await fixture.service.preflight({ runRoot: fixture.runRoot });
    await seedVerifiedTake(fixture, plan, { audio, alignment });

    const compilation = await fixture.service.compile({ runRoot: fixture.runRoot });
    const rendering = await fixture.service.render({ runRoot: fixture.runRoot });
    const preview = rendering.envelope.artifacts[0];
    expect(compilation.envelope.outcome).toBe('succeeded');
    expect(rendering).toMatchObject({
      exitCode: 0,
      envelope: { outcome: 'succeeded', run: { stage: 'rendered' } },
    });
    expect(preview?.kind).toBe('preview');

    const previewPath = resolve(fixture.runRoot, preview!.path);
    expect((await stat(previewPath)).size).toBeGreaterThan(100_000);
    const probe = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,codec_name',
      '-of',
      'json',
      previewPath,
    ]);
    const metadata = JSON.parse(probe.stdout) as {
      streams: Array<{ codec_type: string; codec_name: string }>;
    };
    expect(metadata.streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ codec_type: 'video', codec_name: 'h264' }),
        expect.objectContaining({ codec_type: 'audio', codec_name: 'aac' }),
      ]),
    );
    expect(fixture.network.request).not.toHaveBeenCalled();
  });
});
