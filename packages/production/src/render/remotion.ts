import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { CompiledDocument } from '@vox/video';
import { reportMeasurement } from '../measurement';

export type RenderRequest = {
  document: CompiledDocument;
  audio: Uint8Array;
  onProgress?: (progress: RenderProgress) => void;
};

export type RenderProgress = {
  phase: 'bundle' | 'composition' | 'render' | 'encoding' | 'muxing' | 'saving';
  elapsedMs: number;
  totalFrames?: number;
  renderedFrames?: number;
  encodedFrames?: number;
  concurrency?: number;
};

export type RenderedPreview = {
  bytes: Uint8Array;
  container: 'mp4';
  videoCodec: 'h264';
  audioCodec: 'aac';
  timings?: Record<string, number>;
};

export type RenderAdapter = (request: RenderRequest) => Promise<RenderedPreview>;

/**
 * Refuses the browser download rather than performing it.
 *
 * Remotion calls this hook when it is about to fetch Chrome Headless Shell. Ticket 11 measured
 * that happening on every container start — 92 MB from `remotion.media`, below the denying
 * network adapter where nothing in this system can see it, and fatal once egress is restricted.
 * Pinning `browserExecutable` is the fix; this is the assertion that the fix held. A pinned path
 * that is wrong would otherwise fall back to downloading and the service would appear to work.
 */
const refuseBrowserDownload = (): never => {
  throw new Error(
    'BROWSER_DOWNLOAD_REFUSED: Remotion attempted to download a browser. The image pins one at ' +
      'VOX_BROWSER_EXECUTABLE; a download here means the pinned path is wrong.',
  );
};

export const createRemotionRenderAdapter =
  ({
    entryPoint,
    temporaryRoot = tmpdir(),
    browserExecutable,
    bundlePath,
    concurrency,
  }: {
    entryPoint: string;
    temporaryRoot?: string;
    /**
     * An absolute path to Chrome Headless Shell. When absent — the local Windows service, which
     * resolves its own — Remotion is handed no opinion at all rather than an explicit `undefined`.
     */
    browserExecutable?: string;
    /** An immutable build artifact shipped with the exact renderer source. */
    bundlePath?: string;
    concurrency?: number;
  }): RenderAdapter =>
  async ({ document, audio, onProgress }) => {
    const started = performance.now();
    const timings: Record<string, number> = {};
    const report = (phase: RenderProgress['phase'], extra: Partial<RenderProgress> = {}) =>
      onProgress?.({ phase, elapsedMs: Math.round(performance.now() - started), ...extra });
    // Spread into the call sites so the absent case omits the keys entirely.
    const browser = browserExecutable
      ? { browserExecutable, onBrowserDownload: refuseBrowserDownload }
      : {};
    const work = await mkdtemp(join(temporaryRoot, 'vox-render-'));
    try {
      report('bundle');
      let serveUrl: string;
      if (bundlePath) {
        // Copy the code bundle; per-render audio never enters the shared build artifact.
        serveUrl = join(work, 'bundle');
        await cp(bundlePath, serveUrl, { recursive: true });
        await mkdir(join(serveUrl, 'public'), { recursive: true });
        await writeFile(join(serveUrl, 'public', 'voiceover.mp3'), audio);
      } else {
        const publicDir = join(work, 'public');
        await mkdir(publicDir);
        await writeFile(join(publicDir, 'voiceover.mp3'), audio);
        serveUrl = await bundle({
          entryPoint,
          outDir: join(work, 'bundle'),
          publicDir,
          symlinkPublicDir: false,
        });
      }
      timings.bundleMs = performance.now() - started;
      const inputProps = {
        document: { ...document, audio: { ...document.audio, voiceover: 'voiceover.mp3' } },
      };
      report('composition');
      const composition = await selectComposition({
        serveUrl,
        id: 'compiled-document',
        inputProps,
        ...browser,
      });
      const renderStarted = performance.now();
      timings.compositionMs = renderStarted - started - timings.bundleMs;
      let totalFrames = composition.durationInFrames;
      let resolvedConcurrency: number | undefined;
      const output = join(work, 'preview.mp4');
      await renderMedia({
        serveUrl,
        composition,
        inputProps,
        codec: 'h264',
        audioCodec: 'aac',
        outputLocation: output,
        logLevel: 'error',
        ...(concurrency ? { concurrency } : {}),
        onStart: ({ frameCount, resolvedConcurrency: count }) => {
          totalFrames = frameCount;
          resolvedConcurrency = count;
          report('render', { totalFrames, concurrency: count });
        },
        onProgress: ({
          renderedFrames,
          encodedFrames,
          stitchStage,
          renderedDoneIn,
          encodedDoneIn,
        }) => {
          if (renderedDoneIn !== null) timings.framesMs = renderedDoneIn;
          if (encodedDoneIn !== null) timings.encodingMs = encodedDoneIn;
          report(
            stitchStage === 'muxing'
              ? 'muxing'
              : renderedFrames < totalFrames
                ? 'render'
                : 'encoding',
            { totalFrames, renderedFrames, encodedFrames, concurrency: resolvedConcurrency },
          );
        },
        ...browser,
      });
      timings.renderAndEncodeMs = performance.now() - renderStarted;
      report('saving');
      const bytes = await readFile(output);
      timings.totalMs = performance.now() - started;
      for (const [operation, elapsedMs] of Object.entries(timings))
        reportMeasurement({ operation: `render.${operation}`, elapsedMs });
      return {
        bytes,
        container: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
        timings,
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
