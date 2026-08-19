/**
 * The lifecycle every render suite used to carry a copy of.
 *
 * Rendering one still needs four things to happen first — a temporary directory, a
 * Remotion bundle of the entry, a headless Chrome, and the teardown of all three — and
 * six suites each spelled all four out. The cost was not the duplicated lines so much as
 * the duplicated *interface*: a suite had to learn the whole lifecycle before it could ask
 * its one question, and a fix to any part of it landed in one file out of six. The two
 * copies in `safe-area.test.ts` and `occupies-regions.test.ts` had already drifted into
 * being byte-identical, which is the shape a shared module leaves when it stops too early.
 * `png.ts` is the half that did move; this is the half that did not.
 *
 * What is left at the interface is one call. The bundle, the browser, the directory and
 * the teardown are implementation, and the hooks that drive them are registered by
 * `renderHarness()` itself — a suite declares at module scope that it renders, and never
 * names `beforeAll` for the lifecycle again. Suites keep their own hooks for the frames
 * *they* render, which is the part that differs between them and the part their comments
 * are about.
 *
 * Deliberately one method. A whole-frame digest and a decoded bitmap are both pure
 * functions of the bytes — `hashStill` here, `decodePng` in `png.ts` — so neither needs to
 * be inside the lifecycle, and a suite that wants the backdrop control renders it with the
 * same call as everything else.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import {
  type HeadlessBrowser,
  openBrowser,
  renderStill,
  selectComposition,
} from '@remotion/renderer';
import { afterAll, beforeAll } from 'vitest';

/**
 * Generous for the reason `vitest.render.config.ts` gives for its own: a cold bundle on a
 * cold machine is slow, and a flaky timeout in setup would teach everyone to re-run the
 * one suite that looks at pixels.
 */
const SETUP_TIMEOUT_MS = 180_000;

export type RenderHarness = {
  /**
   * The PNG bytes of one composition at one frame.
   *
   * Bytes rather than a bitmap because three suites only ever hash the frame and would pay
   * to decode 1920×1080 for nothing; `decodePng` is one call away for the three that read
   * pixels.
   */
  still(compositionId: string, inputProps: Record<string, unknown>, frame: number): Promise<Buffer>;
};

/**
 * Call once at module scope. Registers the suite's setup and teardown as a side effect,
 * which is the point: the lifecycle stops being something a suite states.
 */
export const renderHarness = (): RenderHarness => {
  let bundleDirectory = '';
  let serveUrl = '';
  let browser: HeadlessBrowser | undefined;

  beforeAll(async () => {
    bundleDirectory = await mkdtemp(join(tmpdir(), 'vox-render-'));
    serveUrl = await bundle({
      entryPoint: fileURLToPath(new URL('../../src/remotion-entry.ts', import.meta.url)),
      outDir: bundleDirectory,
    });
    browser = await openBrowser('chrome', { logLevel: 'error' });
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    if (browser) await browser.close({ silent: true });
    if (bundleDirectory) await rm(bundleDirectory, { recursive: true, force: true });
  });

  return {
    still: async (compositionId, inputProps, frame) => {
      /**
       * Stated rather than assumed. Remotion treats an absent `puppeteerInstance` as
       * permission to launch its own, so a call that escaped the hooks — at collection
       * time, or after teardown — used to open a second Chrome and quietly succeed. The
       * suite that did it would be slow and correct, and nothing would say why.
       */
      if (!browser || serveUrl === '') {
        throw new Error('Render harness was asked for a still outside its lifecycle.');
      }

      const composition = await selectComposition({
        serveUrl,
        id: compositionId,
        inputProps,
        puppeteerInstance: browser,
        logLevel: 'error',
      });
      const rendered = await renderStill({
        serveUrl,
        composition,
        inputProps,
        puppeteerInstance: browser,
        frame,
        output: null,
        imageFormat: 'png',
        logLevel: 'error',
      });

      if (!rendered.buffer) throw new Error('Remotion returned no still buffer.');
      return rendered.buffer;
    },
  };
};

/**
 * A digest of the whole frame: the "did this change" question, as against `hashRegions`,
 * which asks it of a named rectangle. md5 because this is a comparison between two renders
 * on one machine, not a signature.
 */
export const hashStill = (bytes: Buffer): string => createHash('md5').update(bytes).digest('hex');
