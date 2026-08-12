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
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
   * The four the slice actually carries, named rather than counted.
   *
   * The relocations are the compiler doing its job — the narrator contends with each
   * `image_context` scene in turn and both scenes yield — so `info` is the right severity
   * and the slice is not broken. The day one of them becomes `PERSISTENT_ELEMENT_HIDDEN`
   * at `important`, a character has silently stopped appearing and this test is what says
   * so.
   *
   * **The two hurried scenes arrived with the real voice-over, and they are the finding.**
   * The hand-written timings gave b1 six seconds and b4 six and a half, which is exactly
   * `image_context`'s recommended 180 frames — so the fixture had been quietly handing
   * both scenes the duration the capability asks for. Read aloud, those sentences take
   * 4.64s and 5.12s, and both scenes now play under it. That is §12's whole argument for
   * an imperative real take: invented round-second boundaries flatter the plan, and
   * nothing in the system could see it until something actually spoke the words.
   *
   * Recorded rather than repaired. `quality` means it reads hurried, not broken, and the
   * two available fixes — write longer beats, or lower the recommendation — are editorial
   * judgements this test has no business making on its own.
   */
  it('reports the two relocations and the two hurried scenes, and nothing louder', () => {
    expect(report.warnings.map((warning) => [warning.code, warning.severity])).toEqual([
      ['SCENE_BELOW_RECOMMENDED_DURATION', 'quality'],
      ['SCENE_BELOW_RECOMMENDED_DURATION', 'quality'],
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
   * §12's imperative constraint, as a fact about the document rather than about the audio.
   *
   * The file check is the one that earns its keep. `staticFile` on a name that is not in
   * `public/` does not throw and does not fail a render — it produces a video that plays
   * in silence, and the compiled frames are identical either way, so no still, no hash and
   * no visual gate can see it. This is the only place it can be caught cheaply.
   */
  it('names a voice-over that is actually on disk', () => {
    const voiceover = document.audio.voiceover;
    expect(voiceover).toBeDefined();
    expect(existsSync(join(import.meta.dirname, '..', 'public', voiceover as string))).toBe(true);
  });

  /**
   * The take and the timings are one artifact, checked from the video side.
   *
   * `packages/voice` asserts that the shipped beats are the fold of the alignment it
   * recorded; this asserts the plan compiled from *those* beats rather than from anything
   * else that happens to be lying around. Between them a beats file and an mp3 from two
   * different takes cannot both pass.
   */
  it('compiles the recorded beats, not some other take of the same words', () => {
    expect(document.beats.map((beat) => beat.id)).toEqual(slice.beats.map((beat) => beat.id));
    expect(document.beats.at(-1)?.to).toBe(
      Math.round(((slice.beats.at(-1)?.toMs as number) * document.fps) / 1000),
    );
  });

  /**
   * §12: *"le personnage persistant survit aux changements de scène sans collision ni
   * saut"*. Two states rather than three is the "sans saut" half — the narrator crosses
   * the cut between `chart` and `closing` without the runtime remounting it.
   */
  it('carries the narrator across the scene changes as two placements, not five', () => {
    const states = document.sections[0]?.layoutStates ?? [];
    const startOf = (beatId: string) => document.beats.find((beat) => beat.id === beatId)?.from;

    /**
     * Derived from the beat table rather than written as frame numbers, because the take
     * is a recording and re-recording it moves every boundary. What the assertion is
     * actually about survives that: the narrator's two placements are declared at
     * `b2.start` and `b4.start`, and the second runs to the end of the section — two
     * states rather than five, which is §12's *"sans saut"*. Hardcoded frames would fail
     * on the next recording for a reason that has nothing to do with what is being
     * checked.
     */
    expect(states.map((state) => [state.elementId, state.from, state.to])).toEqual([
      ['narrator', startOf('b2'), startOf('b4')],
      ['narrator', startOf('b4'), document.durationInFrames],
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
