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
import { type CompiledAudio, type CompiledDocument, compile } from '../compile';
import type { CompileReport, CompilerWarning, TimedBeat } from '../core/types';
import verticalSliceBeats from './vertical-slice.beats.json';
import verticalSlicePlan from './vertical-slice.plan.json';

export type ShippedPlan = {
  id: string;
  title: string;
  /** What this plan is for. Shown wherever it is offered to a human. */
  note: string;
  plan: VideoPlan;
  /**
   * A **recording**, and the plan's audio is the other half of it.
   *
   * These were hand-written until a real take replaced them wholesale, which is what the
   * separate file was always for. §12 calls a real TTS voice-over an imperative
   * constraint, and it was right in a way the invented numbers could not show: six round
   * seconds for b1 happened to be exactly `image_context`'s recommended duration, so the
   * fixture had been flattering the plan. Spoken, that sentence takes 4.64s, and the
   * compiler now says the scene is hurried.
   *
   * Produced by `packages/voice`'s `record-take` script, never by a build step. Synthesis
   * is not reproducible — two identical requests return different audio and different
   * boundaries — so these numbers and `audio.voiceover` are one artifact that must travel
   * together. `packages/voice`'s fold test asserts exactly that, against the alignment
   * recorded in the same call.
   */
  beats: TimedBeat[];
  /**
   * Names of files in `packages/video/public/`. The recording this plan's beats came from.
   */
  audio?: CompiledAudio;
};

export const shippedPlans: ShippedPlan[] = [
  {
    id: 'vertical-slice',
    title: 'The vertical slice',
    note: '§12 — rent across European cities, four beats, one narrator crossing three scenes.',
    plan: verticalSlicePlan as VideoPlan,
    beats: verticalSliceBeats as TimedBeat[],
    /** Recorded 2026-08-13 with `eleven_v3`, voice `JBFqnCBsd6RMkjVDRZzb`, seed 7. */
    audio: { voiceover: 'vertical-slice.vo.mp3' },
  },
];

/**
 * Compile a shipped plan, or fail loudly.
 *
 * Called at module load by whatever registers these — so a plan that stops compiling takes
 * the studio down on open rather than rendering something subtly wrong. That is rule 5,
 * and it is why `tests/plans.test.ts` compiles every one of them in the fast suite: the
 * failure should be a red test, not a blank studio.
 *
 * **The report comes back with the document, because `ok: true` is not the same as
 * "nothing to say".** A plan can compile cleanly and still have been changed on the way:
 * a scene yielded into a half, an element relocated or hidden, a plate standing in for a
 * picture. This function used to return `result.document` alone, which threw that away at
 * the exact point it was produced — the slice compiles with two `SLOT_RELOCATED` warnings
 * and nobody opening `section--vertical-slice` was ever told. ADR-0003 says the report is
 * a deliverable rather than a log; a deliverable the only caller cannot see is neither.
 */
export const compileShippedPlan = (
  shipped: ShippedPlan,
): { document: CompiledDocument; report: CompileReport } => {
  const result = compile({ plan: shipped.plan, beats: shipped.beats, audio: shipped.audio ?? {} });

  if (!result.ok) {
    const errors = result.report.errors.map((e) => `${e.code}: ${e.message}`).join('\n  ');
    throw new Error(`Shipped plan "${shipped.id}" does not compile:\n  ${errors}`);
  }

  return { document: result.document, report: result.report };
};

/**
 * Say, once, what compiling a shipped plan had to warn about.
 *
 * Console rather than anything cleverer, because the audience is whoever just opened the
 * studio or started a render, and the studio's console is where they already are. Severity
 * picks the channel: `important` means something is missing from the frames — an element
 * hidden, a picture that never resolved — and belongs above the fold, while `info` and
 * `quality` are the compiler narrating decisions it was right to take.
 *
 * Silent on a clean plan. A line that appears every time is a line nobody reads.
 */
export const announceShippedPlan = (shipped: ShippedPlan, report: CompileReport): void => {
  if (report.warnings.length === 0) return;

  const loud = report.warnings.filter((warning) => warning.severity === 'important');
  const rest = report.warnings.filter((warning) => warning.severity !== 'important');
  const line = (warning: CompilerWarning): string =>
    `  ${warning.code}${warning.sceneId ? ` (${warning.sceneId})` : ''}: ${warning.message}`;

  if (loud.length > 0) {
    console.warn(`Shipped plan "${shipped.id}" compiled with:\n${loud.map(line).join('\n')}`);
  }
  if (rest.length > 0) {
    console.info(`Shipped plan "${shipped.id}" compiled with:\n${rest.map(line).join('\n')}`);
  }
};

/** The report, for a caller that wants the warnings rather than the frames. */
export const reportForShippedPlan = (shipped: ShippedPlan) => validateVideoPlan(shipped.plan);
