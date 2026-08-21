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
import { NO_SAFE_AREA, type TimedEvent } from '../src/core/types';
import { type ShippedPlan, compileShippedPlan, shippedPlans } from '../src/plans';
import { requireCapability } from '../src/scenes/registry';

/**
 * The words an event claims to be pointing at, asked of the capability that defines it.
 *
 * This was a hardcoded `['highlightBar']` at the top of this file, because nothing in the
 * catalog said which of an action's payload fields refer to something spoken. A gate over a
 * list written here is exemplary rather than general: it holds for the one action someone
 * remembered, and the second capability to ship a pointing gesture joins the exclusion by
 * default and silently. The declaration now lives on the action — see `deicticFields` in
 * `core/types.ts` — so this reads the vocabulary instead of restating a slice of it.
 */
const deicticWordsOf = (capabilityId: string, event: TimedEvent): string[] => {
  const fields = requireCapability(capabilityId).actions[event.action]?.deicticFields ?? [];
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  return fields.map((field) => payload[field]).filter((value) => typeof value === 'string');
};

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
   * **The two hurried scenes are gone, and how they went is the record worth keeping.**
   * The hand-written timings gave b1 six seconds and b4 six and a half, which is exactly
   * `image_context`'s recommended 180 frames — so the fixture had been quietly handing both
   * scenes the duration the capability asks for. Read aloud, those same sentences took
   * 4.64s and 5.12s, and both scenes compiled `SCENE_BELOW_RECOMMENDED_DURATION`. That is
   * §12's whole argument for an imperative real take: invented round-second boundaries
   * flatter the plan, and nothing in the system could see it until something spoke the
   * words.
   *
   * The repair was editorial, which is why it waited for a human. b1 and b4 each gained a
   * clause rather than the recommendation being lowered to meet them — the capability's
   * 180 frames is a claim about how long its animation needs to read, and shortening the
   * claim to fit the writing would have made the warning unable to fire again.
   */
  it('reports its two relocations, and nothing louder than information', () => {
    expect(report.warnings.map((warning) => [warning.code, warning.severity])).toEqual([
      ['SLOT_RELOCATED', 'info'],
      ['SLOT_RELOCATED', 'info'],
    ]);
  });

  it('draws every city the plan wrote', () => {
    const chart = document.sections[0]?.scenes.find((scene) => scene.id === 'chart');
    const data = (chart?.props as { data: { label: string }[] }).data;

    expect(data.map((entry) => entry.label)).toEqual([
      'Berlin',
      'Paris',
      'Amsterdam',
      'Dublin',
      'London',
    ]);
  });

  /**
   * The scene still yields into a half — the narrator stands in `cornerBR`, which
   * `bar_chart` occupies — and that is now a yield it can afford. A `horizontal` ranking
   * holds eight rows in a half frame where a column chart holds three, which is the repair
   * `capacityByComposition` exists to make findable.
   */
  it('yields into a half it can afford, rather than avoiding the yield', () => {
    const chart = document.sections[0]?.scenes.find((scene) => scene.id === 'chart');

    expect(chart?.layout).toBe('horizontal');
    expect(chart?.safeArea).toEqual(slotRect('left'));
  });

  /**
   * **The regression for the whole of 2026-08-21, kept after the repair.**
   *
   * The plan above is fixed: its chart is a `horizontal` ranking, which holds eight rows in
   * the half it yields into, so all five cities survive. Asserting only that would delete
   * the evidence — the suite would go green and stay green, and nothing would hold the
   * report to saying anything if the layout ever changed back.
   *
   * So the defect is reproduced from the repaired plan rather than remembered: one word,
   * the layout, put back to what it was. The narrator has not moved — it stands in
   * `cornerBR` in both, which is the point. That morning this compiled with two `info`
   * warnings about where a character stood and rendered a chart titled "Share of income
   * spent on rent" whose tallest bar was `OTHERS 60` — Berlin's 27 % plus Paris's 33 %, a
   * city that does not exist, standing next to London while the narration named London as
   * the extreme. Every assertion below is something the report could not say that morning.
   */
  describe('and the placement that broke it', () => {
    const broken = structuredClone(slice) as ShippedPlan;
    const chart = broken.plan.sections[0]?.scenes.find((scene) => scene.id === 'chart');
    if (chart) chart.layout = 'standard';

    const { report: brokenReport } = compileShippedPlan(broken);
    const codes = brokenReport.warnings.map((warning) => [warning.code, warning.severity]);

    it('still compiles, because none of this blocks a preview', () => {
      expect(brokenReport.ok).toBe(true);
    });

    it('no longer reports both relocations at the same volume', () => {
      expect(codes).toEqual([
        ['SLOT_RELOCATED', 'quality'],
        ['SLOT_RELOCATED', 'info'],
        ['CAPACITY_REDUCED_BY_COMPOSITION', 'quality'],
        ['NARRATION_NAMES_COLLAPSED_VALUE', 'important'],
      ]);
    });

    it('names the values the composition kept and collapsed, and says where they went', () => {
      const capacity = brokenReport.warnings.find(
        (warning) => warning.code === 'CAPACITY_REDUCED_BY_COMPOSITION',
      );

      expect(capacity?.sceneId).toBe('chart');
      expect(capacity?.message).toContain('yields into "left"');
      expect(capacity?.message).toContain('holds 3 of the 8');
      expect(capacity?.message).toContain('"Amsterdam"');
      expect(capacity?.message).toContain('"Dublin"');
      expect(capacity?.message).toContain('"London"');
      expect(capacity?.message).toContain('"Berlin"');
      expect(capacity?.message).toContain('"Paris"');
    });

    /**
     * b3 says *"Berlin sits twenty points lower"* and the annotation reads *"Twenty points
     * above Berlin"*, over a chart Berlin was collapsed out of. Both halves of that
     * contradiction are strings this plan wrote itself, which is what makes it decidable.
     */
    it('notices that the narration still names a value the chart dropped', () => {
      const mention = brokenReport.warnings.find(
        (warning) => warning.code === 'NARRATION_NAMES_COLLAPSED_VALUE',
      );

      expect(mention?.sceneId).toBe('chart');
      expect(mention?.message).toContain('"Berlin"');
      expect(mention?.message).toContain('beat "b3"');
      expect(mention?.message).toContain('events[3].payload.text');
    });

    /**
     * Paris is collapsed too, and no beat and no annotation names it. Silence there is the
     * whole precision budget: a check that fired on every dropped value would fire twice
     * here, and the second warning would carry no defect.
     */
    it('says nothing about a value that was dropped and is not spoken of', () => {
      const mentions = brokenReport.warnings.filter(
        (warning) => warning.code === 'NARRATION_NAMES_COLLAPSED_VALUE',
      );

      expect(mentions).toHaveLength(1);
      expect(mentions[0]?.message).not.toContain('Paris');
    });
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
   * §12's *"les événements tombent sur les mots attendus"*, as an assertion rather than an
   * argument. The last of its success criteria that no test held.
   *
   * The rule: when an event's payload names something the narrator says out loud, the event
   * fires while the narrator is saying it. `highlightBar { label: 'London' }` is a claim
   * about a word, and the bar lighting up 150 frames after that word has passed is the
   * defect — visible to anyone watching, invisible to everything else in this repository.
   *
   * **Independent of the anchor, which is what makes it worth keeping.** The threshold is
   * measured between the event's compiled frame and the onset the *take* recorded for the
   * word in the event's *payload*. Nothing makes those agree: the anchor is authored
   * separately, and `b1.start` with a London payload compiles perfectly. So this stays a
   * real constraint after word anchors exist rather than restating that they resolve.
   *
   * Twelve frames — four hundred milliseconds. Loose enough that a deliberate `+short` lag
   * off a boundary still passes, tight enough that a highlight is unmistakably on its word.
   * The defect it was written against missed by 150.
   *
   * Derived from the take, never hardcoded: re-recording moves every frame in this table,
   * and what is being checked survives that.
   */
  it('fires every event that names a word while that word is being spoken', () => {
    const TOLERANCE_FRAMES = 12;
    const spoken = document.beats.flatMap((beat) => beat.words);

    const late = (document.sections[0]?.scenes ?? []).flatMap((scene) =>
      scene.events.flatMap((event) =>
        deicticWordsOf(scene.capabilityId, event).flatMap((label) => {
          /**
           * Every utterance of the word, not the first. A script may say "London" twice and
           * an event is early or late relative to whichever one it was written for — taking
           * the nearest is what keeps this a test of landing rather than of word choice.
           */
          const utterances = spoken.filter((word) => word.text === label);
          if (utterances.length === 0) return [];

          const at = scene.from + event.frame;
          const distances = utterances.map((word) => Math.abs(at - word.frame));
          const nearest = Math.min(...distances);

          return nearest <= TOLERANCE_FRAMES
            ? []
            : [
                `${event.action}("${label}") fires at frame ${at}, ${nearest} frames from the nearest time "${label}" is spoken (${utterances.map((w) => w.frame).join(', ')})`,
              ];
        }),
      ),
    );

    expect(late).toEqual([]);
  });

  /**
   * The gate above can only discriminate if the slice actually names words in payloads and
   * the take actually reports them. Both have been silently absent before — a take with no
   * word timings passes every assertion above vacuously, and so does a plan whose events
   * carry no labels.
   */
  it('has words to check against, and a deictic event that names one', () => {
    expect(document.beats.every((beat) => beat.words.length > 0)).toBe(true);

    const checked = (document.sections[0]?.scenes ?? []).flatMap((scene) =>
      scene.events.flatMap((event) => deicticWordsOf(scene.capabilityId, event)),
    );

    expect(checked.length).toBeGreaterThan(0);
  });

  /**
   * `annotate` is excluded from the gate above, and this is what holds it instead.
   *
   * Its payload names the bar the note attaches to; it does not name the moment. The
   * annotation here reads "Twenty points above Berlin", and the narrator says Berlin and
   * "twenty points" a whole beat after saying London — so anchoring it to "London" would
   * put the comparison on screen before either side of it has been spoken. Timing an
   * annotation follows the sentence that justifies it, not the bar it points at.
   *
   * What is still checkable, and worth checking, is the order: a note about a bar that has
   * not been highlighted yet is a note about a bar the viewer has not been shown.
   */
  it('annotates the London bar only after it has been highlighted', () => {
    const chart = document.sections[0]?.scenes.find((scene) => scene.id === 'chart');
    if (!chart) throw new Error('the slice compiled without its chart scene');

    const frameOf = (action: string) =>
      chart.events.find(
        (event) =>
          event.action === action &&
          (event.payload as { label?: string } | undefined)?.label === 'London',
      )?.frame;

    const highlight = frameOf('highlightBar');
    const annotation = frameOf('annotate');

    expect(highlight).toBeDefined();
    expect(annotation).toBeDefined();
    expect(annotation as number).toBeGreaterThan(highlight as number);
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
