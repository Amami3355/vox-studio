/**
 * Physical time: the gate on the timings the compiler is handed, and the one conversion
 * from milliseconds to frames.
 *
 * ADR-0002 puts exactly two conversions in the system — seconds to milliseconds at the
 * edge of `packages/voice`, milliseconds to frames here — and this module is the second
 * one plus the checks that make it meaningful. Nothing above it knows what a frame is;
 * nothing below it knows what a millisecond was.
 */
import type { VideoPlan } from '../catalog/validate';
import type { FrameBeat } from '../core/anchors';
import type { CompilerError, TimedBeat } from '../core/types';

/**
 * A `TimedBeat[]` is a **projection of the plan's beats**, and this checks it as one.
 *
 * The same argument that produced `checkPlanShape` applies here and was never applied: a
 * take arriving as JSON — from `packages/voice`, from a fixture, from a file written
 * before the plan was last edited — has none of the guarantees its TypeScript type makes,
 * and every window derived from it assumes all of them. What used to be checked was that
 * each plan beat id appeared somewhere. A reversed window, a `NaN`, a gap or a beat whose
 * text the voice no longer says all compiled into a document.
 *
 * Contiguity is an invariant rather than a policy. ADR-0002 synthesises n beats from n+1
 * SSML marks, so mark *i* is both the end of one beat and the start of the next: a take
 * built the way the ADR describes cannot have a gap, and one that does was not built that
 * way. It matters because scene and section windows are derived from beat boundaries, so
 * 200ms nobody owns is a black flash between two scenes rather than a pause.
 *
 * Text equality is the stale-audio detector. ADR-0002 made a beat carry its voice-over
 * verbatim precisely so a script and the beats pointing into it could not drift "with
 * nothing able to detect it mechanically" — and then nothing detected it. A plan edited
 * after synthesis is the ordinary way this happens, and it is invisible in the render:
 * the pictures are cut against words that are no longer being spoken.
 *
 * One error code for all of it, unlike the three the beat partition earns. Those are three
 * corrections an agent can make; these are one correction no agent may make — rule 3
 * forbids it from writing a timing at all. The only repair is to synthesise again, so the
 * message says what broke and the code says whose problem it is.
 */
export const checkTimings = (plan: VideoPlan, beats: TimedBeat[], fps: number): CompilerError[] => {
  if (!Number.isFinite(fps) || fps <= 0) {
    return [
      {
        code: 'INVALID_TIMING_INPUT',
        field: 'fps',
        message: `An fps of ${fps} cannot produce a frame. Every window in the document is derived from it.`,
      },
    ];
  }

  /**
   * A plan beat the voice-over never spoke, checked before anything else and reported
   * alone: with holes in the take, every ordering and contiguity check below would fire
   * as well, and a report naming ten problems that are one problem is worse than useless
   * to whoever has to fix it.
   */
  const spoken = new Set(beats.map((beat) => beat.id));
  const missing = plan.beats
    .filter((beat) => !spoken.has(beat.id))
    .map(
      (beat): CompilerError => ({
        code: 'MISSING_BEAT_TIMING',
        field: `beats.${beat.id}`,
        message: `Beat "${beat.id}" has no timing. Every beat in the plan must be spoken, because a scene's duration is the sum of the beats it spans.`,
        expected: beats.map((b) => b.id),
      }),
    );
  if (missing.length > 0) return missing;

  const errors: CompilerError[] = [];

  if (beats.length !== plan.beats.length) {
    errors.push({
      code: 'INVALID_TIMING_INPUT',
      field: 'beats',
      message: `The voice-over has ${beats.length} beats where the plan has ${plan.beats.length}. The timings were synthesised from a different plan.`,
      expected: plan.beats.map((beat) => beat.id),
    });
  }

  for (const [index, planned] of plan.beats.entries()) {
    const timed = beats[index];
    if (timed === undefined) continue;

    if (timed.id !== planned.id) {
      errors.push({
        code: 'INVALID_TIMING_INPUT',
        field: `beats[${index}].id`,
        message: `Position ${index} of the voice-over is "${timed.id}" where the plan has "${planned.id}". The spoken script is the plan's beats in order, so a take in another order is a take of another plan.`,
        expected: plan.beats.map((beat) => beat.id),
      });
      continue;
    }

    if (timed.text !== planned.text) {
      errors.push({
        code: 'INVALID_TIMING_INPUT',
        field: `beats.${planned.id}.text`,
        message: `Beat "${planned.id}" was spoken as "${timed.text}" and the plan now says "${planned.text}". The plan was edited after it was synthesised; the pictures would be cut against words nobody says.`,
      });
    }

    errors.push(...checkWindow(timed, beats[index - 1]));
  }

  return errors;
};

const checkWindow = (beat: TimedBeat, previous: TimedBeat | undefined): CompilerError[] => {
  const at = (message: string): CompilerError => ({
    code: 'INVALID_TIMING_INPUT',
    field: `beats.${beat.id}`,
    message,
  });

  if (!Number.isFinite(beat.fromMs) || !Number.isFinite(beat.toMs)) {
    return [
      at(
        `Beat "${beat.id}" is timed ${beat.fromMs}–${beat.toMs}ms. A boundary that is not a number becomes a scene starting at frame NaN, which renders nothing and reports nothing.`,
      ),
    ];
  }

  if (beat.fromMs < 0) {
    return [at(`Beat "${beat.id}" starts at ${beat.fromMs}ms, before the audio does.`)];
  }

  if (beat.toMs <= beat.fromMs) {
    return [
      at(
        `Beat "${beat.id}" ends at ${beat.toMs}ms and starts at ${beat.fromMs}ms. A beat of no length gives every scene spanning it no duration.`,
      ),
    ];
  }

  if (previous !== undefined && Number.isFinite(previous.toMs) && beat.fromMs !== previous.toMs) {
    return [
      at(
        `Beat "${beat.id}" starts at ${beat.fromMs}ms where "${previous.id}" ended at ${previous.toMs}ms. Scene windows are derived from beat boundaries, so the difference is a black gap or an overlap between two scenes, not a pause.`,
      ),
    ];
  }

  return [];
};

/**
 * Convert *boundaries*, never durations.
 *
 * Rounding each beat's length independently and summing accumulates the error into gaps
 * and overlaps between scenes — a one-frame black flash that no test would name and
 * everyone would see. Converting each millisecond boundary with one function makes
 * contiguity a property of the arithmetic instead of something to check afterwards.
 */
export const toFrameBeats = (plan: VideoPlan, beats: TimedBeat[], fps: number): FrameBeat[] => {
  const timingOf = new Map(beats.map((beat) => [beat.id, beat]));
  const toFrame = (ms: number) => Math.round((ms * fps) / 1000);

  return plan.beats.map((beat) => {
    const timing = timingOf.get(beat.id) as TimedBeat;
    return { id: beat.id, from: toFrame(timing.fromMs), to: toFrame(timing.toMs) };
  });
};

/** The window of a contiguous run of beats. The partition is already validated. */
export const spanWindow = (spansBeats: string[], frameBeats: FrameBeat[]) => {
  const covered = frameBeats.filter((beat) => spansBeats.includes(beat.id));
  return { from: covered[0]?.from ?? 0, to: covered.at(-1)?.to ?? 0 };
};
