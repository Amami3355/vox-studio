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
import { beforeAll, describe, expect, it } from 'vitest';
import { BACKDROP_CONTROL_ID } from '../../src/runtime/BackdropControl';
import { compositionIdFor, controlIdFor } from '../../src/runtime/compositionIds';
import { hashStill, renderHarness } from './harness';
import { type Bitmap, type Region, decodePng, hashRegions } from './png';

/** Everything has landed and settled here; all four examples run 150 frames. */
const SETTLED_FRAME = 120;
/** Inside the driven example's hold. `b2.start` is the reveal, and it has not arrived yet. */
const HOLD_FRAME = 60;

const harness = renderHarness();

/** The ground with nothing on it, so a row can be told from an empty one. */
let backdrop: Bitmap;

beforeAll(async () => {
  backdrop = decodePng(await harness.still(BACKDROP_CONTROL_ID, {}, 0));
}, 180_000);

const exampleProps = (exampleId: string): Record<string, unknown> => ({
  capabilityId: 'stat_counter',
  exampleId,
  layout: null,
  motionProfile: null,
});

const renderHash = async (exampleId: string, frame: number): Promise<string> =>
  hashStill(
    await harness.still(
      compositionIdFor('stat_counter', exampleId),
      exampleProps(exampleId),
      frame,
    ),
  );

const renderControlHash = async (controlId: string, frame: number): Promise<string> =>
  hashStill(await harness.still(controlIdFor(controlId), { controlId }, frame));

const renderBitmap = async (exampleId: string, frame: number): Promise<Bitmap> =>
  decodePng(
    await harness.still(
      compositionIdFor('stat_counter', exampleId),
      exampleProps(exampleId),
      frame,
    ),
  );

/**
 * The full-width band between the first and last rows carrying anything the backdrop does
 * not — the ink's vertical extent, found rather than hard-coded.
 *
 * Measured against the backdrop control instead of against the other frame, for the reason
 * `runtime/BackdropControl.tsx` gives: a relation between two renders of the same scene
 * cannot see anything both of them draw identically, which is exactly the label this is
 * trying to locate. `editorialStatic` sets `camera: none`, so the backdrop under the scene
 * is the control frame pixel for pixel.
 */
const inkBand = (frame: Bitmap, backdrop: Bitmap): Region => {
  if (frame.width !== backdrop.width || frame.height !== backdrop.height) {
    throw new Error('The frame and the backdrop control are different sizes.');
  }

  const stride = frame.width * frame.channels;
  const rowIsInk = (y: number): boolean =>
    !frame.pixels
      .subarray(y * stride, (y + 1) * stride)
      .equals(backdrop.pixels.subarray(y * stride, (y + 1) * stride));

  let top = -1;
  let bottom = -1;
  for (let y = 0; y < frame.height; y += 1) {
    if (!rowIsInk(y)) continue;
    if (top === -1) top = y;
    bottom = y;
  }

  if (top === -1) throw new Error('The frame is bare backdrop; there is no ink to measure.');
  return { x: 0, y: top, width: frame.width, height: bottom - top + 1 };
};

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

  /**
   * The column keeps its shape, which spec §8 states and no hash of a whole frame can see.
   *
   * A held frame and a settled frame *must* differ — the first test says so — so the
   * question has to be asked of a region rather than of the picture. The held frame carries
   * the label and nothing else (this is the `held` key frame, accepted on a still), so its
   * ink band **is** the label's band. If the label is still where it was once the number
   * lands, that band is identical in both; if the column grew and pushed it up, it is not.
   *
   * Both frames belong to `example-stat-driven`, so nothing but the reveal differs between
   * them — not the props, not the profile, not the camera, which `editorialStatic` does not
   * have at all.
   */
  it('keeps the label where it was when the stat lands', async () => {
    const [held, settled] = await Promise.all([
      renderBitmap('example-stat-driven', HOLD_FRAME),
      renderBitmap('example-stat-driven', SETTLED_FRAME),
    ]);

    const label = inkBand(held, backdrop);

    expect(hashRegions(settled, [label])).toBe(hashRegions(held, [label]));
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
      //
      // `held` re-accepted 2026-08-17, and it is the only one that moved. The value block is
      // now reserved rather than unmounted, so the label sits where it will still be sitting
      // once the number lands instead of centring on itself and jumping up a beat later. The
      // still is the same label, higher on the frame, with the column it is about to share
      // held open beneath it. The other three are untouched: `canonical` and `negative` were
      // never held back, and `empty` reserves nothing.
      canonical: '3a65c4d8bde17829083ced127e506a53',
      negative: '03182c02f34b51fd8ac8233bdf3c6c80',
      empty: 'b261d2fd9800a0b05510bdff425528f7',
      held: 'f29c135cf138ae19aab600b1b2e2b0c2',
    });
  });
});
