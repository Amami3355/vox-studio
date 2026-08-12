/**
 * Plans the repository ships, and the only place a whole video exists as data.
 *
 * §12 of the frozen document makes a hand-written plan JSON the *first* development
 * objective — 20 to 30 seconds of real video, produced with no code specific to that
 * video. Everything needed for it has existed since the Section runtime landed, and none
 * of it was ever committed: the catalog ships scene examples, the tests ship fixtures, and
 * the one script that rendered a section wrote an mp4 into a gitignored folder. There was
 * no section anybody could sit down and watch.
 *
 * **These are JSON files rather than TypeScript on purpose.** §12's last criterion is that
 * modifying a prop in the JSON changes the video without breaking anything else, and that
 * is only literally true if there is a JSON file to modify. The cost is that a plan cannot
 * carry a comment, so everything worth saying about one is said here.
 *
 * A plan arriving from JSON has none of the guarantees its TypeScript type makes, which is
 * exactly what `MALFORMED_PLAN` and `checkPlanShape` were built for. The cast below is
 * therefore load-bearing in one direction only: it gets the file to the compiler, and the
 * compiler is what decides whether it is a plan.
 */
import { type VideoPlan, validateVideoPlan } from '../catalog/validate';
import { type CompiledDocument, compile } from '../compile';
import type { TimedBeat } from '../core/types';
import verticalSliceBeats from './vertical-slice.beats.json';
import verticalSlicePlan from './vertical-slice.plan.json';

export type ShippedPlan = {
  id: string;
  title: string;
  /** What this plan is for. Shown wherever it is offered to a human. */
  note: string;
  plan: VideoPlan;
  /**
   * Hand-written, and **provisional**.
   *
   * §12 calls a real TTS voice-over an imperative constraint, and it is right: invented
   * round-second boundaries hide the entire synchronisation bug class — anchors resolving
   * onto the wrong word, cuts landing mid-sentence, events half a second late. Nothing
   * here validates §12's criteria. They are plausible durations for the text as written,
   * so the section can be watched while `packages/voice` does not exist, and they live in
   * their own file so a real take replaces them wholesale rather than by editing a plan.
   */
  beats: TimedBeat[];
};

export const shippedPlans: ShippedPlan[] = [
  {
    id: 'vertical-slice',
    title: 'The vertical slice',
    note: '§12 — rent across European cities, four beats, one narrator crossing three scenes.',
    plan: verticalSlicePlan as VideoPlan,
    beats: verticalSliceBeats as TimedBeat[],
  },
];

/**
 * Compile a shipped plan, or fail loudly.
 *
 * Called at module load by whatever registers these — so a plan that stops compiling takes
 * the studio down on open rather than rendering something subtly wrong. That is rule 5,
 * and it is why `tests/plans.test.ts` compiles every one of them in the fast suite: the
 * failure should be a red test, not a blank studio.
 */
export const compileShippedPlan = (shipped: ShippedPlan): CompiledDocument => {
  const result = compile({ plan: shipped.plan, beats: shipped.beats });

  if (!result.ok) {
    const errors = result.report.errors.map((e) => `${e.code}: ${e.message}`).join('\n  ');
    throw new Error(`Shipped plan "${shipped.id}" does not compile:\n  ${errors}`);
  }

  return result.document;
};

/** The report, for a caller that wants the warnings rather than the frames. */
export const reportForShippedPlan = (shipped: ShippedPlan) => validateVideoPlan(shipped.plan);
