/**
 * Runtime integration for `stat_counter`, at the public render boundary.
 *
 * Two different questions, deliberately kept apart, on the `quote.test.ts` pattern. The
 * first test states the plan's effect as a *relation* between hashes, so it keeps meaning
 * something on a machine whose font rendering differs. The second is the key-frame
 * baseline: literal hashes, accepted after visual review, and the suite that is expected
 * to fail when the design changes on purpose.
 *
 * Why two frames rather than one. `editorialStatic` has no camera, so once every entrance
 * has settled the driven example is the canonical one *pixel for pixel* — both run 150
 * frames and were measured at frame 120. A key frame taken there would be a baseline that
 * cannot tell whether `revealStat` reaches the frame at all. Frame 60 is inside the hold,
 * before `b2.start`, and is the only place the verb is visible.
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
import { compositionIdFor, controlIdFor } from '../../src/runtime/compositionIds';

/** Everything has landed and settled here; all four examples run 150 frames. */
const SETTLED_FRAME = 120;
/** Inside the driven example's hold. `b2.start` is the reveal, and it has not arrived yet. */
const HOLD_FRAME = 60;

let bundleDirectory = '';
let serveUrl = '';
let browser: HeadlessBrowser | undefined;

beforeAll(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), 'vox-stat-counter-'));
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

const renderStillHash = async (
  compositionId: string,
  inputProps: Record<string, unknown>,
  frame: number,
): Promise<string> => {
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
  return createHash('md5').update(rendered.buffer).digest('hex');
};

const renderHash = (exampleId: string, frame: number): Promise<string> =>
  renderStillHash(
    compositionIdFor('stat_counter', exampleId),
    { capabilityId: 'stat_counter', exampleId, layout: null, motionProfile: null },
    frame,
  );

const renderControlHash = (controlId: string, frame: number): Promise<string> =>
  renderStillHash(controlIdFor(controlId), { controlId }, frame);

describe('StatCounterScene runtime', () => {
  /**
   * The verb, stated as a relation. The driven example differs from the canonical one in
   * its events and in nothing else — same props, same layout, same `editorialStatic` — so
   * these two comparisons isolate `revealStat` completely.
   *
   * Both directions matter. Equal inside the hold would mean the events never reached the
   * frame. Unequal after it would mean the plan left something permanently behind, and a
   * held stat is supposed to arrive at the same frame it would have had anyway.
   */
  it('holds the stat back and then lands on the undriven frame', async () => {
    const [heldDriven, heldCanonical, settledDriven, settledCanonical] = await Promise.all([
      renderHash('example-stat-driven', HOLD_FRAME),
      renderHash('example-stat-canonical', HOLD_FRAME),
      renderHash('example-stat-driven', SETTLED_FRAME),
      renderHash('example-stat-canonical', SETTLED_FRAME),
    ]);

    expect(heldDriven).not.toBe(heldCanonical);
    expect(settledDriven).toBe(settledCanonical);
  });

  /**
   * The pending state is not a reveal, stated as a relation against the undriven example.
   *
   * With `label === ''` there is nothing behind the gate at all — the value block is
   * skipped either way — so `revealStat` must make no difference to any frame. Both run
   * 150 frames on `editorialStatic`, which has no camera, so they are pixel-identical if
   * and only if the empty state stands from frame 0.
   *
   * Equality is what makes this a guard rather than a second baseline: the control has no
   * accepted key frame of its own, and wants none. It is the same picture as
   * `example-stat-empty`, whose hash is accepted below, so a literal here would be a
   * second baseline for one frame and would have to be re-accepted twice.
   *
   * `control--stat-empty-driven` rather than a fifth example: see `runtime/SceneControl.tsx`.
   */
  it('never gates the pending state behind the reveal', async () => {
    const [drivenEmpty, undrivenEmpty] = await Promise.all([
      renderControlHash('stat-empty-driven', HOLD_FRAME),
      renderHash('example-stat-empty', HOLD_FRAME),
    ]);

    expect(drivenEmpty).toBe(undrivenEmpty);
  });

  it('keeps the accepted key frames stable', async () => {
    const [canonical, negative, empty, held] = await Promise.all([
      renderHash('example-stat-canonical', SETTLED_FRAME),
      renderHash('example-stat-negative', SETTLED_FRAME),
      renderHash('example-stat-empty', SETTLED_FRAME),
      renderHash('example-stat-driven', HOLD_FRAME),
    ]);

    expect({ canonical, negative, empty, held }).toEqual({
      // Accepted 2026-08-16, the first key frames for this capability. Reviewed on stills at
      // the frames named above, on `editorial-paper`:
      //
      //   canonical — the label in ink, the value at the top display step in accent with
      //     the unit a step down beside it, and the sublabel muted beneath, one entrance
      //     staggering label → value → sublabel.
      //   negative  — the same frame with a signed value in the negative colour.
      //   empty     — the rule and STAT PENDING, and nothing else, because this example
      //     carries an empty label too. Degraded typographically, never to black.
      //   held      — the label alone on the frame. This is the picture `revealStat`
      //     exists to produce, and the whole reason the baseline is taken at 60.
      canonical: '3a65c4d8bde17829083ced127e506a53',
      negative: '03182c02f34b51fd8ac8233bdf3c6c80',
      empty: 'b261d2fd9800a0b05510bdff425528f7',
      held: '71e96ee4c0f6560bd2e932481b6eee0f',
    });
  });
});
