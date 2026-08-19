/**
 * The other half of ADR-0003's unpaid trust: `occupiesRegions`.
 *
 * The compiler reads the declaration in exactly one place (`compile/persistent.ts`): a
 * persistent element standing in a slot no declared region overlaps is *kept* — rung a,
 * no yield, no warning, the scene plays untouched. Everywhere else in the suite the
 * declaration appeared only as an *input* to compile-time tests. Nothing ever checked
 * that it is true of the pixels, and a capability that overclaims frees a slot with ink
 * in it: the character is kept, legally, on top of the scene's own words.
 *
 * So this suite asks the question the compiler asks — which slots does the declaration
 * free? — and answers it with renders: every free slot's rectangle must equal the
 * `Backdrop` control, at the schema ceiling, under every motion profile, from the first
 * entrance frame to the camera's extreme. The free set is computed with `overlaps` from
 * `core/slots.ts`, the same function the compiler uses, so the test cannot drift from a
 * different reading of the geometry.
 *
 * **Why the ceiling, and why controls.** Ink extent is worst where copy is longest, so
 * the renders carry every string at its schema ceiling (`control--quote-ceiling`,
 * `control--stat-ceiling`). The published examples never go there, and must not — see
 * `runtime/SceneControl.tsx`.
 *
 * **Why all six profiles and these frames.** Entrances here are a clipped vertical rise,
 * so they cannot widen the ink — but they move it, and `cinematic`'s pan and `pushIn`'s
 * scale move it further. Frames 1 and 20 catch the entrances still moving; 60 is settled;
 * the last frame is each camera at its extreme.
 *
 * **Why only two capabilities.** `image_context` declares `['full']`, which frees nothing
 * — there is no slot to check. `bar_chart` declares `['bottom', 'left']`, which frees
 * `cornerTR`, and its header spans the full box width: whether a ceiling title puts ink
 * there is a real question, and it is not this suite's to answer — that declaration
 * predates any measurement and measuring it is its own work.
 *
 * **What actually keeps the corners clear.** Measured worst-case over all six profiles
 * at frames 1/20/60/last, at the schema ceiling, default theme:
 *
 * ```
 *                ink max x   ink y band     ink in the corner rows   the real margin
 * quote          70.7%       23.5%..76.7%   stops at x = 65.5%       4.5 pts horizontal
 * stat_counter   81.8%       32.0%..68.3%   none at all              1.7 pts vertical
 * ```
 *
 * Both capabilities put ink *past* x = 70%, so horizontal reach is not what frees the
 * corners and `columnRatio`/`SceneTitle`'s 86% cap are not the fragile numbers. The two
 * are clear for different reasons, and each margin is thin in a different direction:
 *
 * - `quote` clears them **horizontally, but only in the corner rows**. The elements that
 *   reach above y = 30% or below y = 70% — eyebrow, attribution, role — stop at
 *   x = 65.5%, 4.5 points short of the corner. The ink that does cross x = 70% is the
 *   quote and its mark, at y 48.3%..62.9%: mid-frame, nowhere near a corner.
 * - `stat_counter` clears them **vertically, and only just**. Its value runs to
 *   x = 81.8%, deep inside the corner column, so nothing horizontal protects it. What
 *   does is that the block draws no ink at all outside y 32.0%..68.3% — 2.0 points clear
 *   of the top corner row and **1.7 points** clear of the bottom, about 18px at 1080.
 *   Anything that grows the stack's height or moves its vertical centring spends that.
 *
 * So the numbers to watch are `stat_counter`'s vertical rhythm and `quote`'s corner-row
 * widths. This suite is what catches either one moving.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { overlaps, slotRect } from '../../src/core/slots';
import { ALL_SLOTS, type Slot } from '../../src/core/types';
import { motionProfileIds } from '../../src/design/motion';
import { HEIGHT, WIDTH } from '../../src/design/theme';
import { BACKDROP_CONTROL_ID } from '../../src/runtime/BackdropControl';
import { controlIdFor } from '../../src/runtime/compositionIds';
import { requireCapability } from '../../src/scenes/registry';
import { renderHarness } from './harness';
import { type Bitmap, type Region, decodePng, hashRegions } from './png';

/** The capabilities whose occupation this suite guards, and the control that carries each ceiling. */
const SWEPT = [
  { capabilityId: 'quote', controlId: 'quote-ceiling' },
  { capabilityId: 'stat_counter', controlId: 'stat-ceiling' },
] as const;

/**
 * Entrances still moving (1, 20), settled (60), and the camera at its extreme (last).
 * The same four the measurement sweep ran; the last frame is when `pushIn` is tightest
 * and `cinematic`'s pan is at its rightmost.
 */
const framesFor = (duration: number): number[] => [1, 20, 60, duration - 1];

/** The slots the declaration says this scene never touches — the compiler's rung-a set. */
const freeSlotsOf = (occupies: Slot[]): Slot[] =>
  ALL_SLOTS.filter((slot) => !occupies.some((region) => overlaps(region, slot)));

const regionOf = (slot: Slot): Region => {
  const rect = slotRect(slot);
  return {
    x: Math.round((rect.left / 100) * WIDTH),
    y: Math.round((rect.top / 100) * HEIGHT),
    width: Math.round(((100 - rect.left - rect.right) / 100) * WIDTH),
    height: Math.round(((100 - rect.top - rect.bottom) / 100) * HEIGHT),
  };
};

const harness = renderHarness();

/** The ground with nothing on it; a free slot is one that still equals this frame. */
let control: Bitmap;

const renderStillAt = async (
  compositionId: string,
  inputProps: Record<string, unknown>,
  frame: number,
): Promise<Bitmap> => decodePng(await harness.still(compositionId, inputProps, frame));

beforeAll(async () => {
  control = await renderStillAt(BACKDROP_CONTROL_ID, {}, 0);
}, 180_000);

describe('an occupied region is one the ink actually crosses', () => {
  /**
   * The declaration, pinned. This is the half that fails while either capability still
   * declares `['full']`: the measurement bought exactly the two right-hand corners, and
   * nothing else — `left` alone would also free `right`, where the ink genuinely goes.
   */
  it.each(SWEPT.map((one) => [one.capabilityId] as const))(
    '%s frees exactly the two right-hand corners',
    (capabilityId) => {
      const { meta } = requireCapability(capabilityId);
      expect(freeSlotsOf(meta.occupiesRegions)).toEqual(['cornerTR', 'cornerBR']);
    },
  );

  for (const { capabilityId, controlId } of SWEPT) {
    const { meta } = requireCapability(capabilityId);
    const free = freeSlotsOf(meta.occupiesRegions).map(regionOf);
    const occupied = meta.occupiesRegions.map(regionOf);
    const frames = framesFor(meta.recommendedDurationFrames);

    describe.each(motionProfileIds.map((profile) => [profile] as const))(
      `${capabilityId} under %s`,
      (profile) => {
        /** `[frame]`, in the order of `frames`. */
        let stills: Bitmap[] = [];

        beforeAll(async () => {
          stills = await Promise.all(
            frames.map((frame) =>
              renderStillAt(controlIdFor(controlId), { controlId, motionProfile: profile }, frame),
            ),
          );
        }, 180_000);

        it('draws nothing into the slots the declaration frees', () => {
          const expected = hashRegions(control, free);

          for (const [index, bitmap] of stills.entries()) {
            expect({ frame: frames[index], region: hashRegions(bitmap, free) }).toEqual({
              frame: frames[index],
              region: expected,
            });
          }
        });

        /**
         * The liveness half, asked at the settled frame: the scene did draw inside the
         * regions it declared, so the assertion above is not passing over a blank render.
         */
        it('draws the scene inside the regions it declared', () => {
          const settled = stills[frames.length - 1] as Bitmap;
          expect(hashRegions(settled, occupied)).not.toBe(hashRegions(control, occupied));
        });
      },
    );
  }
});
