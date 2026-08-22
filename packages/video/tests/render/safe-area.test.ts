/**
 * ADR-0003's unpaid consequence: *"a declared composition is trusted, and nothing yet
 * checks that it renders"*.
 *
 * `supportedCompositions` is the lever a capability pulls to keep a persistent element
 * alive over it once the element contends — the quieter lever is an honest
 * `occupiesRegions`, which keeps a clear element out of contention entirely, and
 * `occupies-regions.test.ts` guards that claim. This suite guards the composition one:
 * the compiler takes an entry here as proof that a layout exists for that half of the
 * frame, and nothing verified it. A capability could declare `left`, get squeezed into
 * 960px with a layout drawn for 1920, and spill across the corner the element was
 * standing in — silently, legally, and only visible to whoever happened to watch that
 * section.
 *
 * So this suite is generated from the declarations themselves: every capability × every
 * composition it claims × the two camera profiles that bound the risk. Adding a
 * composition to a `meta.ts` adds cases here, which is the habit the gap is paid off by.
 *
 * Two questions are asked of every render, and both are asked against a **control** — a
 * frame of `Backdrop` with nothing standing on it:
 *
 * - outside the reserved rectangle the frame equals the control, because that region is
 *   backdrop and a scene that reaches it has left its rectangle
 * - along the inner border of that rectangle it equals the control too — a scene that
 *   reaches its own edge is being cropped by it, whether or not it drew anything illegal
 * - inside it, it differs from the control, which is what stops the first two passing
 *   because the probe read the wrong rectangle, or an empty one
 *
 * A scene that brings its own ground is measured against itself instead, on both counts.
 * `SceneCapability.paintsOwnGround` carries why; `quietBorderReading` in `png.ts` carries which
 * reading that selects, for this suite and for the content-stress one together.
 *
 * **The control is what makes these absolute, and that is the point.** The suite used to
 * ask the same three things as a relation between two examples of the same capability, on
 * the grounds that backdrop does not know what the scene says. True, but blind to anything
 * a capability draws identically every time: the `Visual context` eyebrow is byte-identical
 * in every `image_context` render, so if the layout pushed *it* over the edge, both frames
 * matched and the assertion passed. Fixed chrome was invisible to a relation between a
 * capability's own renders. Against the backdrop it is not.
 *
 * Measuring against a control also means one render is checkable on its own, so the suite
 * no longer pairs examples up and asks *every* example in the catalog instead of the first
 * two. What it still does not ask is whether content the schema accepts but no example
 * carries would fit — see `docs/adr/0003-slot-conflict-resolution.md`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { type Rect, slotRect } from '../../src/core/slots';
import type { SafeArea, Slot } from '../../src/core/types';
import { HEIGHT, WIDTH, defaultTheme } from '../../src/design/theme';
import { BACKDROP_CONTROL_ID } from '../../src/runtime/BackdropControl';
import { compositionIdFor } from '../../src/runtime/compositionIds';
import { registry } from '../../src/scenes/registry';
import { renderHarness } from './harness';
import {
  type Bitmap,
  type Region,
  bandsInside,
  bandsOutside,
  decodePng,
  hashRegions,
  liveFrameReading,
  pixelAt,
  quietBorderReading,
  regionOfInsets,
} from './png';

/**
 * How close to its own edge a scene may put ink before the frame reads as clipped.
 *
 * Not a design margin — scenes choose their own, and `image_context` deliberately chooses
 * a tighter one than `grid.margin`. It is the width at which *any* margin has effectively
 * been spent: 16px is one step of the space scale, and text that ends there has either
 * been cropped or is about to be.
 */
const EDGE_QUIET_PX = 16;

/**
 * Two profiles, whatever the example declares, because the two questions have different
 * worst cases and one profile cannot be worst for both.
 *
 * **`cinematic`, for containment.** Crossing a boundary needs *translation*: a half-frame
 * composition's boundary is the centre line, and a scale about the centre leaves it exactly
 * where it is. `cinematic`'s panDrift translates further than any other profile.
 *
 * **`pushIn`, for the quiet border.** Being cropped by your own edge needs *inset*:
 * `SlotFrame` inflates its padding by the worst-case camera transform, and the camera then
 * scales that padding back down, so the tightest output frame belongs to the largest
 * allowance. `pushIn` is 0.12 against `cinematic`'s 0.08 — 115px per side against ~82px —
 * and after the scale the padding box lands about 14px inside the reserved rectangle where
 * `cinematic` leaves about 49px. **The shipped slice's own closing scene uses `pushIn`**,
 * and until this list had two entries the suite had never rendered it.
 *
 * Both questions are asked under both, since a case that is merely not-worst is cheap.
 * What is *not* here is the rest of the matrix: `editorialStatic` and `impact` have no
 * camera at all, and `drift` and `energetic` are strictly inside these two on both axes.
 *
 * Fixing the profile per case is also what stops a case's renders differing in camera as
 * well as in content.
 */
const PROFILES = ['cinematic', 'pushIn'] as const;

/**
 * Two frames, because neither camera is at its extreme for the whole shot and they do not
 * agree on when. A quarter in, the entrances have landed and the pan is still left of
 * centre; at the last frame the pan is at its rightmost and the push-in at its tightest.
 */
const framesFor = (duration: number): number[] => [Math.round(duration * 0.25), duration - 1];

const isPartial = (rect: Rect): boolean =>
  rect.top > 0 || rect.right > 0 || rect.bottom > 0 || rect.left > 0;

const insideOf = (rect: Rect): Region => regionOfInsets(rect, WIDTH, HEIGHT);

type Case = {
  label: string;
  capabilityId: string;
  composition: Slot;
  profile: (typeof PROFILES)[number];
  safeArea: SafeArea;
  /** Every example the capability publishes, each checked against the control on its own. */
  examples: string[];
  frames: number[];
  /** See `SceneCapability.paintsOwnGround`, and the quiet-border assertion below. */
  paintsOwnGround: boolean;
};

/**
 * Every capability × every composition it claims × both profiles.
 *
 * `full` is in the list now. It was filtered out while containment was the only question,
 * and correctly: a composition that reserves the whole canvas has no outside for a scene to
 * spill into, so there was nothing to ask. The quiet border does have something to ask of
 * it — a scene can run its copy off the canvas edge from `full` exactly as it did from
 * `right` — and it was the one composition never asked. The containment assertion states
 * the emptiness rather than skipping the case.
 */
const cases: Case[] = registry.flatMap((capability) =>
  capability.meta.supportedCompositions.flatMap((composition) =>
    PROFILES.map((profile) => ({
      label: `${capability.meta.id} composed into ${composition} under ${profile}`,
      capabilityId: capability.meta.id,
      composition,
      profile,
      safeArea: slotRect(composition),
      examples: capability.examples.map((example) => example.id),
      frames: framesFor(capability.meta.recommendedDurationFrames),
      paintsOwnGround: capability.paintsOwnGround === true,
    })),
  ),
);

const harness = renderHarness();

/** Rendered once: the backdrop does not move, and every case measures against this frame. */
let control: Bitmap;

const renderStillAt = async (
  compositionId: string,
  inputProps: Record<string, unknown>,
  frame: number,
): Promise<Bitmap> => decodePng(await harness.still(compositionId, inputProps, frame));

const renderExample = (
  capabilityId: string,
  exampleId: string,
  profile: (typeof PROFILES)[number],
  safeArea: SafeArea,
  frame: number,
): Promise<Bitmap> =>
  renderStillAt(
    compositionIdFor(capabilityId, exampleId),
    { capabilityId, exampleId, layout: null, motionProfile: profile, safeArea },
    frame,
  );

beforeAll(async () => {
  control = await renderStillAt(BACKDROP_CONTROL_ID, {}, 0);
}, 180_000);

describe('a declared composition renders into the rectangle it declared', () => {
  it('has a case for every composition in the catalog', () => {
    // The suite is generated, so an empty or half-built case list would report as a pass.
    expect(cases.map((one) => one.label)).toEqual([
      'bar_chart composed into full under cinematic',
      'bar_chart composed into full under pushIn',
      'bar_chart composed into left under cinematic',
      'bar_chart composed into left under pushIn',
      'bar_chart composed into right under cinematic',
      'bar_chart composed into right under pushIn',
      'image_context composed into full under cinematic',
      'image_context composed into full under pushIn',
      'image_context composed into left under cinematic',
      'image_context composed into left under pushIn',
      'image_context composed into right under cinematic',
      'image_context composed into right under pushIn',
      'line_chart composed into full under cinematic',
      'line_chart composed into full under pushIn',
      'quote composed into full under cinematic',
      'quote composed into full under pushIn',
      'quote composed into left under cinematic',
      'quote composed into left under pushIn',
      'quote composed into right under cinematic',
      'quote composed into right under pushIn',
      'stat_counter composed into full under cinematic',
      'stat_counter composed into full under pushIn',
      'stat_counter composed into left under cinematic',
      'stat_counter composed into left under pushIn',
      'stat_counter composed into right under cinematic',
      'stat_counter composed into right under pushIn',
      'typographic_statement composed into full under cinematic',
      'typographic_statement composed into full under pushIn',
    ]);
    for (const one of cases) expect(one.examples.length).toBeGreaterThan(1);
  });

  /**
   * The control, checked against something it did not compute: the canvas size the design
   * system declares, and the backdrop token at a corner the radial lift does not reach.
   * Every assertion below is a comparison against this frame, so a control that was the
   * wrong size, or blank, or decoded with a mis-strided row, would make them meaningless.
   */
  it('renders a control that is the canvas the design system says it is', () => {
    expect([control.width, control.height]).toEqual([WIDTH, HEIGHT]);
    // The default, not a named theme: `BackdropControl` mounts `ThemeProvider` with no
    // theme, so the control is whatever the system currently ships. Pinning it to
    // `editorialCold` made this assertion pass for the wrong reason the moment the default
    // moved to paper — it would have been testing a palette nothing renders in.
    expect(pixelAt(control, 4, HEIGHT - 5)).toBe(defaultTheme.color.bg.toLowerCase());
  });

  describe.each(cases.map((one) => [one.label, one] as const))('%s', (_label, testCase) => {
    /** `[frame][example]`, in the order of `testCase.frames` and `testCase.examples`. */
    let frames: Bitmap[][] = [];

    beforeAll(async () => {
      frames = await Promise.all(
        testCase.frames.map((frame) =>
          Promise.all(
            testCase.examples.map((exampleId) =>
              renderExample(
                testCase.capabilityId,
                exampleId,
                testCase.profile,
                testCase.safeArea,
                frame,
              ),
            ),
          ),
        ),
      );
    }, 180_000);

    /** Every rendered pair of `[frame, example]`, flattened with its labels attached. */
    const eachRender = function* (): Generator<[number, string, Bitmap]> {
      for (const [row, frame] of testCase.frames.entries()) {
        for (const [column, exampleId] of testCase.examples.entries()) {
          yield [frame, exampleId, frames[row]?.[column] as Bitmap];
        }
      }
    };

    it('draws nothing into the region the composition reserves', () => {
      const inside = insideOf(testCase.safeArea);
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

      for (const [frame, exampleId, bitmap] of eachRender()) {
        expect({ frame, exampleId, region: hashRegions(bitmap, outside) }).toEqual({
          frame,
          exampleId,
          region: expected,
        });
      }
    });

    /**
     * The half containment cannot see.
     *
     * A scene that runs its copy off the *canvas* edge draws nothing illegal: from `full`
     * there is no region outside the reserved rectangle at all, and from `right` there is
     * none to the right of it, so the frame is clipped by the canvas and every containment
     * hash still matches. That is how a caption lost its last word in
     * `section--vertical-slice` while this suite stayed green.
     *
     * Same comparison, read one rectangle in: the band just inside the reserved rectangle
     * must still be ground, because a scene with ink there has spent its margin and is
     * being cropped by its own edge. Which reading of "still ground" applies is
     * `quietBorderReading`'s, and `basis` says which one it took.
     */
    it('leaves a quiet border inside that rectangle, so nothing is cropped by it', () => {
      const border = bandsInside(insideOf(testCase.safeArea), EDGE_QUIET_PX);
      const { paintsOwnGround } = testCase;

      for (const [frame, exampleId, bitmap] of eachRender()) {
        const { expected, actual, basis } = quietBorderReading(bitmap, border, {
          control,
          paintsOwnGround,
        });
        expect({ frame, exampleId, basis, border: actual }).toEqual({
          frame,
          exampleId,
          basis,
          border: expected,
        });
      }
    });

    /**
     * What stops the two above passing because the probe read an empty rectangle.
     *
     * Against the control it is "this frame is not the backdrop". That sentence is free for
     * a scene that painted the rectangle a different colour before drawing anything, so for
     * one that declares `paintsOwnGround` the question is asked the same way its border was:
     * the reserved region must hold **more than one colour**, which a bare ground does not.
     */
    it('draws the scene inside it, so the comparisons above are over a live frame', () => {
      const inside = [insideOf(testCase.safeArea)];

      for (const [frame, exampleId, bitmap] of eachRender()) {
        const { drew, basis } = liveFrameReading(bitmap, inside, {
          control,
          paintsOwnGround: testCase.paintsOwnGround,
        });
        expect({ frame, exampleId, basis, drew }).toEqual({ frame, exampleId, basis, drew: true });
      }
    });
  });
});
