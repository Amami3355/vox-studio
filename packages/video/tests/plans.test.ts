/**
 * The plans the repository ships, checked as data.
 *
 * Two jobs. The first is a guard: these are compiled at module load by whatever registers
 * them, so a plan that stops compiling takes Remotion Studio down on open. That failure
 * should arrive as a red test in a suite that runs in a second.
 *
 * The second is §12. Its success criteria are mostly about how the thing *looks*, and no
 * test can hold those — but three of them are facts about the compiled document, and those
 * are asserted here. The ones that need eyes are named in the ADR and left to eyes.
 */
import { describe, expect, it } from 'vitest';
import { slotRect } from '../src/core/slots';
import { NO_SAFE_AREA } from '../src/core/types';
import { type ShippedPlan, compileShippedPlan, shippedPlans } from '../src/plans';
import { requireCapability } from '../src/scenes/registry';

const sliceOf = (id: string): ShippedPlan => {
  const found = shippedPlans.find((plan) => plan.id === id);
  if (!found) throw new Error(`No shipped plan "${id}".`);
  return found;
};

describe.each(shippedPlans.map((plan) => [plan.id, plan] as const))(
  'shipped plan %s',
  (_id, plan) => {
    it('compiles, with no errors and a document to render', () => {
      expect(() => compileShippedPlan(plan)).not.toThrow();
    });

    /**
     * `ok: true` is not the same as "nothing to say".
     *
     * A plan can compile cleanly and still have been *changed* on the way — a scene
     * yielded into a half, an element relocated or hidden, a plate standing in for a
     * picture. ADR-0003 calls the report a deliverable rather than a log, and a
     * `compileShippedPlan` that returned only the frames threw that deliverable away at
     * the exact point it was produced: whoever opened `section--vertical-slice` learned
     * nothing about what the compiler had done to it.
     */
    it('hands back what compiling had to warn about, not only the frames', () => {
      const { report } = compileShippedPlan(plan);

      expect(report.ok).toBe(true);
      for (const warning of report.warnings) expect(warning.message).not.toHaveLength(0);
    });

    it('spans every beat it defines, so no beat is spoken over nothing', () => {
      const defined = plan.plan.beats.map((beat) => beat.id);
      const covered = plan.plan.sections.flatMap((section) => section.spansBeats);

      expect([...covered].sort()).toEqual([...defined].sort());
    });

    it('carries a timing for every beat, since the compiler cannot invent one', () => {
      expect(plan.beats.map((beat) => beat.id)).toEqual(plan.plan.beats.map((beat) => beat.id));
    });
  },
);

/**
 * §12's own scenario, and the reason it could not be committed before ADR-0003's
 * `supportedCompositions` work: its fourth beat moves the character to `left` over an
 * `image_context` scene. While that capability declared only `full` the compiler had no
 * composition to yield into, and the beat the frozen document specifies would have
 * rendered as a hidden character and a warning.
 */
describe('the vertical slice', () => {
  const slice = sliceOf('vertical-slice');
  const { document, report } = compileShippedPlan(slice);

  /**
   * The two the slice actually carries, named rather than counted.
   *
   * Both are the compiler doing its job — the narrator contends with each `image_context`
   * scene in turn and both scenes yield — so `info` is the right severity and the slice is
   * not broken. It is still something a person watching the section should be told, and it
   * is the only reason this assertion exists: the day one of these becomes
   * `PERSISTENT_ELEMENT_HIDDEN` at `important`, a character has silently stopped appearing
   * and this test is what says so.
   */
  it('reports the two relocations it was compiled with, and nothing louder', () => {
    expect(report.warnings.map((warning) => [warning.code, warning.severity])).toEqual([
      ['SLOT_RELOCATED', 'info'],
      ['SLOT_RELOCATED', 'info'],
    ]);
  });

  it('runs the twenty to thirty seconds §12 asks for', () => {
    const seconds = document.durationInFrames / document.fps;

    expect(seconds).toBeGreaterThanOrEqual(20);
    expect(seconds).toBeLessThanOrEqual(30);
  });

  /**
   * §12: *"le personnage persistant survit aux changements de scène sans collision ni
   * saut"*. Two states rather than three is the "sans saut" half — the narrator crosses
   * the cut between `chart` and `closing` without the runtime remounting it.
   */
  it('carries the narrator across the scene changes as two placements, not five', () => {
    const states = document.sections[0]?.layoutStates ?? [];

    expect(states.map((state) => [state.elementId, state.from, state.to])).toEqual([
      ['narrator', 180, 525],
      ['narrator', 525, 720],
    ]);
  });

  /** …and the "sans collision" half, which is ADR-0003's whole invariant. */
  it('never renders a scene into a rectangle the narrator still occupies', () => {
    const section = document.sections[0];
    if (!section) throw new Error('the slice compiled without a section');

    const overlaps = section.scenes.flatMap((scene) => {
      const yielded = JSON.stringify(scene.safeArea) !== JSON.stringify(NO_SAFE_AREA);
      const occupied = yielded
        ? [scene.safeArea]
        : requireCapability(scene.capabilityId).meta.occupiesRegions.map(slotRect);

      return section.layoutStates
        .filter((state) => state.from < scene.to && state.to > scene.from)
        .filter((state) =>
          occupied.some(
            (region) =>
              Math.max(region.left, state.rect.left) <
                100 - Math.max(region.right, state.rect.right) &&
              Math.max(region.top, state.rect.top) <
                100 - Math.max(region.bottom, state.rect.bottom),
          ),
        )
        .map((state) => `${state.elementId} overlaps "${scene.id}"`);
    });

    expect(overlaps).toEqual([]);
  });

  /**
   * The beat this file exists for. `left` is the slot §12 names, and `right` is the only
   * composition `image_context` declares that clears it — so the closing scene composing
   * into the right half *is* the character surviving.
   */
  it('composes the closing scene around the narrator rather than hiding it', () => {
    const scenes = document.sections[0]?.scenes ?? [];
    const closing = scenes.find((scene) => scene.id === 'closing');

    expect(closing?.safeArea).toEqual({ top: 0, right: 0, bottom: 0, left: 50 });
    expect(document.sections[0]?.layoutStates.at(-1)?.rect).toEqual(slotRect('left'));
  });
});
