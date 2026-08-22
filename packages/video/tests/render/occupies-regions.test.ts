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
 * `control--stat-ceiling`, `control--bar-chart-ceiling`, `control--line-chart-ceiling`).
 * The published examples never go there, and must not — see
 * `runtime/SceneControl.tsx`.
 *
 * **Why all six profiles and these frames.** Entrances here are a clipped vertical rise,
 * so they cannot widen the ink — but they move it, and `cinematic`'s pan and `pushIn`'s
 * scale move it further. Frames 1 and 20 catch the entrances still moving; 60 is settled;
 * the last frame is each camera at its extreme.
 *
 * **Why these four.** `image_context` declares `['full']` and is not swept only because no
 * ceiling control exists for it. That used to read "there is no slot to check", and it is no
 * longer true: a `['full']` declaration is falsifiable now — the branch below holds one to
 * drawing into *every* slot — so sweeping it is available work rather than a question with
 * no answer.
 * `bar_chart` was excluded for a worse reason. It declared `['bottom', 'left']`, which
 * freed `cornerTR`, and this header used to say the question was not this suite's to
 * answer — *"that declaration predates any measurement and measuring it is its own work."*
 * The work came due on 2026-08-21, when a render put a narrator in that corner and the
 * tallest bar's value label was drawn under it with its ascenders cut. It is swept now, and
 * it frees nothing. `line_chart` enters the sweep with its first registration: its conservative
 * `['full']` declaration is measured rather than accepted as a default.
 *
 * **What actually keeps the corners clear.** Measured worst-case over all six profiles at
 * frames 1/20/60/last, at the schema ceiling, default theme. The numerical rows predate
 * `line_chart`; its full-frame claim is held by the same per-slot pixel assertion below:
 *
 * ```
 *                ink max x   ink y band     ink in the corner rows   the real margin
 * quote          70.7%       23.5%..76.7%   stops at x = 65.5%       4.5 pts horizontal
 * stat_counter   81.8%       32.0%..68.3%   none at all              1.7 pts vertical
 * bar_chart      94.9%        8.9%..90.9%   reaches x = 94.9%        none, in any direction
 * ```
 *
 * The third row is not a near miss. `bar_chart` draws from 8.9% to 90.9% of the height and
 * out to 94.9% of the width, *including in the corner rows*, so every corner is occupied and
 * no narrower declaration than `['full']` was ever available to it. The value label that
 * exposed this was the first leak found, not the only one there — the header spans the full
 * box width and the plot spans it underneath.
 *
 * **Only `standard` is swept.** The other two layouts arrange the same ink differently, and
 * once the declaration frees nothing there is no corner left for them to overclaim. A
 * capability that ever narrows this declaration would have to sweep all three.
 *
 * The three tabulated capabilities put ink *past* x = 70%, so horizontal reach is not what
 * frees a corner and
 * `columnRatio`/`SceneTitle`'s 86% cap are not the fragile numbers. `quote` and
 * `stat_counter` are clear for different reasons, and each margin is thin in a different
 * direction:
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
  { capabilityId: 'quote', controlId: 'quote-ceiling', frees: ['cornerTR', 'cornerBR'] },
  { capabilityId: 'stat_counter', controlId: 'stat-ceiling', frees: ['cornerTR', 'cornerBR'] },
  /**
   * Frees nothing, and that is the measurement rather than a shrug. See the third `it` in
   * the first block: this capability's ink reaches the one corner its old declaration gave
   * away, under every profile, so no narrower set is available to it.
   */
  { capabilityId: 'bar_chart', controlId: 'bar-chart-ceiling', frees: [] },
  { capabilityId: 'line_chart', controlId: 'line-chart-ceiling', frees: [] },
] as const satisfies readonly { capabilityId: string; controlId: string; frees: Slot[] }[];

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
   * The declaration, pinned — each capability against the set its own sweep bought it.
   *
   * For `quote` and `stat_counter` that is exactly the two right-hand corners: this is the
   * half that fails if either widens back to `['full']`, and `left` alone would also free
   * `right`, where the ink genuinely goes. For `bar_chart` and `line_chart` it is nothing
   * at all, and the pixels hold each claim independently — see the branch further down.
   */
  it.each(SWEPT.map((one) => [one.capabilityId, one.frees] as const))(
    '%s frees exactly what it was measured to free',
    (capabilityId, frees) => {
      const { meta } = requireCapability(capabilityId);
      expect(freeSlotsOf(meta.occupiesRegions)).toEqual(frees);
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

        /**
         * The two halves of the same question, and which one a capability gets depends on
         * whether its declaration frees anything.
         *
         * A capability that frees slots must keep them clear. A capability that frees none
         * must earn that by drawing into every slot there is — otherwise `frees: []` is
         * unfalsifiable, because anyone narrowing the declaration would edit the expected
         * set in the same commit and the suite would agree with them. Asking the pixels
         * instead is what would have caught `bar_chart`'s `['bottom', 'left']`: it freed
         * `cornerTR`, and a narrator was placed there before a render showed the tallest
         * bar's value label cut by its shape.
         *
         * `hashRegions` refuses an empty region list on purpose — hashing nothing would pass
         * without looking — which is why this is a branch rather than a guard that quietly
         * emits nothing.
         */
        if (free.length > 0) {
          it('draws nothing into the slots the declaration frees', () => {
            const expected = hashRegions(control, free);

            for (const [index, bitmap] of stills.entries()) {
              expect({ frame: frames[index], region: hashRegions(bitmap, free) }).toEqual({
                frame: frames[index],
                region: expected,
              });
            }
          });
        } else {
          it('draws into every slot, so no declaration may free one', () => {
            const settled = stills[frames.length - 1] as Bitmap;
            const clear = ALL_SLOTS.filter(
              (slot) =>
                hashRegions(settled, [regionOf(slot)]) === hashRegions(control, [regionOf(slot)]),
            );

            expect(clear).toEqual([]);
          });
        }

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
