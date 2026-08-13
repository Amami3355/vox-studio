import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { CompiledDocument } from '@vox/video';

export type RenderRequest = {
  document: CompiledDocument;
  audio: Uint8Array;
};

export type RenderedPreview = {
  bytes: Uint8Array;
  container: 'mp4';
  videoCodec: 'h264';
  audioCodec: 'aac';
};

export type RenderAdapter = (request: RenderRequest) => Promise<RenderedPreview>;

export const createRemotionRenderAdapter =
  ({
    entryPoint,
    temporaryRoot = tmpdir(),
  }: {
    entryPoint: string;
    temporaryRoot?: string;
  }): RenderAdapter =>
  async ({ document, audio }) => {
    const work = await mkdtemp(join(temporaryRoot, 'vox-render-'));
    try {
      const publicDir = join(work, 'public');
      await mkdir(publicDir);
      await writeFile(join(publicDir, 'voiceover.mp3'), audio);
      const serveUrl = await bundle({
        entryPoint,
        outDir: join(work, 'bundle'),
        publicDir,
        symlinkPublicDir: false,
      });
      const inputProps = {
        document: { ...document, audio: { ...document.audio, voiceover: 'voiceover.mp3' } },
      };
      const composition = await selectComposition({
        serveUrl,
        id: 'compiled-document',
        inputProps,
      });
      const output = join(work, 'preview.mp4');
      await renderMedia({
        serveUrl,
        composition,
        inputProps,
        codec: 'h264',
        audioCodec: 'aac',
        outputLocation: output,
        logLevel: 'error',
      });
      return {
        bytes: await readFile(output),
        container: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
      };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  };

export const assertMp4 = (preview: RenderedPreview): void => {
  if (
    preview.container !== 'mp4' ||
    preview.videoCodec !== 'h264' ||
    preview.audioCodec !== 'aac' ||
    preview.bytes.byteLength < 12 ||
    Buffer.from(preview.bytes).subarray(4, 8).toString('ascii') !== 'ftyp'
  ) {
    throw new Error('RENDER_OUTPUT_INVALID');
  }
};
