/**
 * Runtime integration for `quote`, at the public render boundary.
 *
 * Two different questions, deliberately kept apart, on the `image-context.test.ts` pattern.
 * The first test states the plan's effect as a *relation* between hashes, so it keeps
 * meaning something on a machine whose font rendering differs. The second is the key-frame
 * baseline: literal hashes, accepted after visual review, and the suite that is expected to
 * fail when the design changes on purpose.
 *
 * Why two frames rather than one. `editorialStatic` has no camera, so once every entrance
 * has settled the driven example is the canonical one *pixel for pixel* — both were
 * measured at frame 120 and hashed identically. A key frame taken there would be a baseline
 * that cannot tell whether `revealQuote` reaches the frame at all. Frame 60 is inside the
 * hold, before `b2.start`, and is the only place the verb is visible.
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Everything has landed and settled here; all four examples run 180 frames. */
const SETTLED_FRAME = 120;
/** Inside the driven example's hold. `b2.start` is the reveal, and it has not arrived yet. */
const HOLD_FRAME = 60;

let bundleDirectory = '';
let serveUrl = '';
let browser: HeadlessBrowser | undefined;

beforeAll(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), 'vox-quote-'));
  serveUrl = await bundle({
    entryPoint: fileURLToPath(new URL('../../src/remotion-entry.ts', import.meta.url)),
    outDir: bundleDirectory,
  });
  browser = await openBrowser('chrome', { logLevel: 'error' });
}, 180_000);

afterAll(async () => {
  if (browser) await browser.close({ silent: true });
  if (bundleDirectory) await rm(bundleDirectory, { recursive: true, force: true });
});

const renderHash = async (exampleId: string, frame: number): Promise<string> => {
  const inputProps = {
    capabilityId: 'quote',
    exampleId,
    layout: null,
    motionProfile: null,
  };
  const composition = await selectComposition({
    serveUrl,
    id: `quote--${exampleId}`,
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
  return createHash('md5').update(rendered.buffer).digest('hex');
};

describe('QuoteScene runtime', () => {
  /**
   * The verb, stated as a relation. The driven example differs from the canonical one in
   * its events and in nothing else — same props, same layout, same `editorialStatic` — so
   * these two comparisons isolate `revealQuote` completely.
   *
   * Both directions matter. Equal inside the hold would mean the events never reached the
   * frame. Unequal after it would mean the plan left something permanently behind, and a
   * held quote is supposed to arrive at the same frame it would have had anyway.
   */
  it('holds the quote back and then lands on the undriven frame', async () => {
    const [heldDriven, heldCanonical, settledDriven, settledCanonical] = await Promise.all([
      renderHash('example-quote-driven', HOLD_FRAME),
      renderHash('example-quote-canonical', HOLD_FRAME),
      renderHash('example-quote-driven', SETTLED_FRAME),
      renderHash('example-quote-canonical', SETTLED_FRAME),
    ]);

    expect(heldDriven).not.toBe(heldCanonical);
    expect(settledDriven).toBe(settledCanonical);
  });

  it('keeps the accepted key frames stable', async () => {
    const [canonical, longCopy, empty, held] = await Promise.all([
      renderHash('example-quote-canonical', SETTLED_FRAME),
      renderHash('example-quote-long', SETTLED_FRAME),
      renderHash('example-quote-empty', SETTLED_FRAME),
      renderHash('example-quote-driven', HOLD_FRAME),
    ]);

    expect({ canonical, longCopy, empty, held }).toEqual({
      // Accepted 2026-08-16, the first key frames for this capability. Reviewed on stills at
      // the frames named above, on `editorial-paper`:
      //
      //   canonical — eyebrow in accent, the mark one step over the quote, the quote on two
      //     lines at the top of the ladder, and the signature reading as one block: name in
      //     ink over role in inkMuted, one gap apart and on one entrance.
      //   longCopy  — the same frame with the ladder dropped a step. Six lines, the column
      //     holding all of them, nothing near the quiet border.
      //   empty     — the rule and QUOTE PENDING, and nothing else, because this example
      //     carries an empty eyebrow too. Degraded typographically, never to black.
      //   held      — the eyebrow alone on the frame. This is the picture `revealQuote`
      //     exists to produce, and the whole reason the baseline is taken at 60.
      canonical: '0b2cdfd88e7642305a25b2dea06f8c90',
      longCopy: '361ab7a81a167f917217624ae8e5914b',
      empty: '14718ef860858efdd00f7c40e3b0b82c',
      held: '80d7ae0e6e6dffbb3dfc17f8faa8a45e',
    });
  });
});
