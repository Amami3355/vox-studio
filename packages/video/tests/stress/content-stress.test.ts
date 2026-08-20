/**
 * The frames nobody had ever drawn.
 *
 * ADR-0003's amendment of 2026-08-13 ends by saying so plainly: the degradations for
 * oversized content already exist and already work — `titleStep` drops the scale, the
 * `Others` bucket folds a twenty-category ranking, `composedStepCeiling` sets a composed
 * scene quieter — and nothing was missing from the *response* to content at the ceiling.
 * What was missing is that no one had ever rendered it. Every still in this suite is a
 * frame the catalog promises an agent it will accept and which had never been looked at.
 *
 * `safe-area.test.ts` sweeps the same two profiles across the same compositions and asks
 * the same two region questions. The difference is what it renders: the *examples*, which
 * are copy a human wrote to be readable. This renders `tests/stress/cases.ts` — the
 * schema's own ceilings and the floors it leaves reachable by refusing to state a minimum
 * — across every layout as well, since a layout is how the scene arranges itself and a
 * composition is how much frame it gets, and `layouts.ts`'s claim that all three
 * arrangements keep their identity in half a frame is checkable no other way.
 *
 * **Properties, never hashes.** Three curated key frames stay hashed in
 * `render/image-context.test.ts` because three is a number a human will actually look at.
 * A hash baseline over a hundred generated cases would be re-accepted wholesale the first
 * time anyone changed a font, and a baseline that is always bulk-accepted is a ritual
 * wearing a check's clothes.
 *
 * **Two of the four questions are not asked here at all.** Containment and the quiet border
 * are regions of the canvas and are asked below, against the backdrop control. Whether a
 * sentence was clipped, and how many lines of display type it set, are facts about the DOM
 * that no still carries — `runtime/StressControl.tsx` measures them in the browser and ends
 * the render if they fail, so those two arrive here as a render that did not happen. That
 * is the assertion `it('fits the content into the boxes it was given')` reads.
 *
 * **Its own script, `pnpm test:stress`.** `test:render` is the standing discipline that a
 * red pixel test is a real failure, and that discipline depends on people running it; this
 * matrix roughly doubles its cost. Splitting the slow suite off is what this repository
 * already did once, when `test:render` left `test`. Obligatory for any commit touching a
 * schema, a layout or `supportedCompositions` — a change-scoped obligation with
 * `catalog:check` as its precedent, rather than a universal one nobody honours.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Rect } from '../../src/core/slots';
import { HEIGHT, WIDTH, defaultTheme } from '../../src/design/theme';
import { BACKDROP_CONTROL_ID } from '../../src/runtime/BackdropControl';
import { STRESS_CONTROL_ID } from '../../src/runtime/StressControl';
import { renderHarness } from '../render/harness';
import {
  type Bitmap,
  bandsInside,
  bandsOutside,
  decodePng,
  hashRegions,
  pixelAt,
  regionOfInsets,
} from '../render/png';
import { type StressCase, stressCases } from './cases';

/**
 * The same figure `safe-area.test.ts` uses, and the same reasoning: not a design margin but
 * the width at which any margin has effectively been spent. 16px is one step of the space
 * scale, and text that ends there has either been cropped or is about to be.
 */
const EDGE_QUIET_PX = 16;

const isPartial = (rect: Rect): boolean =>
  rect.top > 0 || rect.right > 0 || rect.bottom > 0 || rect.left > 0;

const cases = stressCases();

const harness = renderHarness();

/** Rendered once: the backdrop does not move, and every case measures against this frame. */
let control: Bitmap;

/**
 * A render that happened, or the reason it did not.
 *
 * The probe in `StressControl.tsx` ends the render rather than returning a verdict, because
 * a still of a clipped sentence is a still of a sentence and there is nowhere in the bytes
 * to put the finding. Caught here rather than left to escape from `beforeAll`, so the
 * failure lands on the assertion that is about fit instead of on the suite's plumbing.
 */
type Rendered = { bitmap: Bitmap } | { failure: string };

/**
 * The frames, or a skip.
 *
 * A refused render leaves no still to measure, and the case is already red on `fits the
 * content into the boxes it was given` in the same block. Repeating that one message under
 * three more headings makes a matrix of seventy cases unreadable, and the three region
 * questions genuinely did go unanswered — saying so is more honest than answering them
 * about a frame that does not exist. This is never a silent skip: it happens only where a
 * sibling assertion is failing with the reason.
 */
const bitmapsOf = (renders: Rendered[], skip: () => void): Bitmap[] => {
  if (renders.some((one) => 'failure' in one)) skip();
  return renders.map((one) => {
    if ('failure' in one) throw new Error(one.failure);
    return one.bitmap;
  });
};

/**
 * Every case whose content did not fit, with what the probe found.
 *
 * The per-case assertion below is where a reader looks, but it is not where a reader
 * *reads*: vitest's default reporter prints one error block per distinct stack, and
 * seventy cases asserting on the same line collapse into a single message no matter how
 * many of them are red. The names all appear in the failure list and the detail does not.
 * So the detail is collected here and asserted once at the end, which is the only place the
 * whole picture survives the reporter.
 */
const didNotFit: string[] = [];

const renderCase = async (testCase: StressCase, frame: number): Promise<Rendered> => {
  try {
    return {
      bitmap: decodePng(
        await harness.still(
          STRESS_CONTROL_ID,
          {
            capabilityId: testCase.capabilityId,
            props: testCase.props,
            layout: testCase.layout,
            motionProfile: testCase.profile,
            safeArea: testCase.safeArea,
          },
          frame,
        ),
      ),
    };
  } catch (error) {
    return { failure: error instanceof Error ? error.message : String(error) };
  }
};

beforeAll(async () => {
  control = decodePng(await harness.still(BACKDROP_CONTROL_ID, {}, 0));
}, 180_000);

describe('content the schema accepts renders into the box it was given', () => {
  it('has a case for every arrangement of every capability', () => {
    // The suite is generated, so an empty or half-built case list would report as a pass.
    // `stress-cases.test.ts` checks the shape of the matrix without a browser; this checks
    // that the matrix this run is about to render is not empty.
    expect(cases.length).toBeGreaterThan(0);
    expect(new Set(cases.map((one) => one.capabilityId)).size).toBeGreaterThan(1);
  });

  it('renders a control that is the canvas the design system says it is', () => {
    // Every assertion below compares against this frame, so a control that was the wrong
    // size, or blank, or decoded with a mis-strided row would make them meaningless.
    expect([control.width, control.height]).toEqual([WIDTH, HEIGHT]);
    expect(pixelAt(control, 4, HEIGHT - 5)).toBe(defaultTheme.color.bg.toLowerCase());
  });

  describe.each(cases.map((one) => [one.label, one] as const))('%s', (_label, testCase) => {
    let renders: Rendered[] = [];

    beforeAll(async () => {
      renders = await Promise.all(testCase.frames.map((frame) => renderCase(testCase, frame)));
      for (const one of renders) {
        if ('failure' in one) didNotFit.push(`${testCase.label} — ${one.failure}`);
      }
    }, 180_000);

    /**
     * The two questions no still can answer, arriving as a render that refused to finish.
     *
     * A word wider than its column is cut mid-glyph by the same `overflow: hidden` that
     * makes the entrance read as a rise, and it is cut *inside* the safe area — so the two
     * region assertions below both pass on a frame whose sentence has lost its tail. That
     * is blind-by-construction in the same shape the absolute control was introduced to
     * fix, arriving by a different route.
     */
    it('fits the content into the boxes it was given', () => {
      expect(renders.flatMap((one) => ('failure' in one ? [one.failure] : []))).toEqual([]);
    });

    it('draws nothing into the region the composition reserves', ({ skip }) => {
      const inside = regionOfInsets(testCase.safeArea, WIDTH, HEIGHT);
      const outside = bandsOutside(inside, WIDTH, HEIGHT);

      /**
       * `full` reserves the canvas, so there is no region left to spill into and the
       * question does not arise. Stated rather than skipped, and stated as the *reason* —
       * a partial rectangle whose complement came out empty would be a bug in the probe,
       * and a silently skipped case would report as a pass.
       */
      if (!isPartial(testCase.safeArea)) {
        expect(inside).toEqual({ x: 0, y: 0, width: WIDTH, height: HEIGHT });
        expect(outside).toEqual([]);
        return;
      }

      const expected = hashRegions(control, outside);
      for (const [index, bitmap] of bitmapsOf(renders, skip).entries()) {
        expect({ frame: testCase.frames[index], region: hashRegions(bitmap, outside) }).toEqual({
          frame: testCase.frames[index],
          region: expected,
        });
      }
    });

    /**
     * The half containment cannot see: a scene that runs its copy off the *canvas* edge
     * draws nothing illegal, because from `full` there is no region outside the reserved
     * rectangle at all. Same comparison, read one rectangle in.
     */
    it('leaves a quiet border inside that rectangle, so nothing is cropped by it', ({ skip }) => {
      const border = bandsInside(regionOfInsets(testCase.safeArea, WIDTH, HEIGHT), EDGE_QUIET_PX);
      const expected = hashRegions(control, border);

      for (const [index, bitmap] of bitmapsOf(renders, skip).entries()) {
        expect({ frame: testCase.frames[index], border: hashRegions(bitmap, border) }).toEqual({
          frame: testCase.frames[index],
          border: expected,
        });
      }
    });

    /**
     * Including the floor cases, and especially those.
     *
     * An empty array and an empty string are states the schemas keep reachable on purpose —
     * "no `.min(2)`, so the empty state stays testable" — and every capability answers them
     * with a typographic empty state rather than a blank frame. A floor case that drew
     * nothing at all would pass both region assertions above perfectly.
     */
    it('draws the scene inside it, so the comparisons above are over a live frame', ({ skip }) => {
      const inside = [regionOfInsets(testCase.safeArea, WIDTH, HEIGHT)];
      const expected = hashRegions(control, inside);

      for (const [index, bitmap] of bitmapsOf(renders, skip).entries()) {
        expect({
          frame: testCase.frames[index],
          drew: hashRegions(bitmap, inside) !== expected,
        }).toEqual({ frame: testCase.frames[index], drew: true });
      }
    });
  });

  /**
   * The whole picture, in one place, last.
   *
   * Registered after the generated blocks so it runs after them. It says nothing the
   * per-case assertions did not already say — it is the reporter's collapse of them,
   * undone. A run where every case fits leaves this an empty list, which is also the only
   * assertion in the suite that would notice if the matrix had rendered nothing at all.
   */
  it('leaves no case whose content did not fit', () => {
    expect(didNotFit).toEqual([]);
  });
});
