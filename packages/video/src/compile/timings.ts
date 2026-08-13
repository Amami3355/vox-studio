/**
 * Physical time: the gate on the timings the compiler is handed, and the one conversion
 * from milliseconds to frames.
 *
 * ADR-0002 puts exactly two conversions in the system — seconds to milliseconds at the
 * edge of `packages/voice`, milliseconds to frames here — and this module is the second
 * one plus the checks that make it meaningful. Nothing above it knows what a frame is;
 * nothing below it knows what a millisecond was.
 */
import { type VideoPlan, sectionAnchors } from '../catalog/validate';
import { parseAnchor } from '../core/anchor-grammar';
import type { FrameBeat } from '../core/anchors';
import type { CompilerError, TimedBeat } from '../core/types';
import { tokenise } from '../core/words';

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
    errors.push(...checkWords(timed));
  }

  errors.push(...checkTakeIsWhole(beats));
  errors.push(...checkAnchoredWords(plan, beats));

  return errors;
};

/**
 * Recorded is a property of a take, not of a beat inside one.
 *
 * CONTEXT.md defines an empty word list as "this take was never recorded", and that is a
 * sentence about a take: a fold either ran over an alignment or it did not, and it writes
 * words for every beat or for none. So a take with onsets on b1 and none on b2 is not an
 * unusual legal state — it is a fold that half completed, an artifact someone edited by
 * hand, or two takes spliced. Every one of those makes the onsets that *are* present
 * suspect, because whatever produced the gap was working on those beats as well.
 *
 * Worth its own check rather than leaving it to the anchor. Anchors only complain about
 * the beats they name, so a mixed take is silent for every beat that happens to carry
 * words — the failure resolves to plausible frames and says nothing, which is the shape of
 * defect this whole module exists to make impossible.
 *
 * A beat whose text tokenises to nothing is exempt, because an empty list is the *correct*
 * fold of a beat with no words in it. Without that, punctuation alone in a beat would look
 * like a half-recorded take.
 */
const checkTakeIsWhole = (beats: TimedBeat[]): CompilerError[] => {
  const shaped = beats.filter((beat) => Array.isArray(beat.words));
  /** Shape is reported per beat by `checkWords`; coherence over a broken take says nothing. */
  if (shaped.length !== beats.length) return [];

  const speaking = shaped.filter((beat) => tokenise(beat.text).length > 0);
  const recorded = speaking.filter((beat) => beat.words.length > 0);

  if (recorded.length === 0 || recorded.length === speaking.length) return [];

  return speaking
    .filter((beat) => beat.words.length === 0)
    .map((beat) => ({
      code: 'INVALID_TIMING_INPUT' as const,
      field: `beats.${beat.id}.words`,
      message: `Beat "${beat.id}" carries no word timings, but ${recorded.length} of the take's ${speaking.length} speaking beats do. A take is recorded or it is not; a partial one is a fold that did not finish, an edited artifact, or two takes spliced together — and the onsets that are present were produced by whatever left this beat without any.`,
    }));
};

/**
 * A word anchor against a beat this take never recorded.
 *
 * ADR-0002 decided that `words: []` is legal at the take and *loud at the anchor*, and the
 * decision stands — a synthetic take that spread words across a duration would report
 * numbers indistinguishable from measured ones. What was missing is that loud meant a
 * thrown `UnresolvableWordError`, which left `compile` past a signature promising a
 * `CompileResult` and past §8.1's promise that a plan the compiler refuses comes back with
 * a reason. A crash is not a report.
 *
 * This is the take's half of a question `checkWordAnchors` asks the plan's half of. Whether
 * b2 speaks "London" is a fact about the beat text, answerable in the cold pass with no
 * audio; whether *this* take measured it is a fact only a take carries. Asked here because
 * this is the first point both are in the room, and asked over `sectionAnchors` so that a
 * placement and an event are held to it identically.
 *
 * One error per beat rather than per anchor. Three anchors into an unrecorded beat are not
 * three corrections — they are one take that needs recording, and a report naming each of
 * them separately is the noise `MISSING_BEAT_TIMING` already refuses to make.
 */
const checkAnchoredWords = (plan: VideoPlan, beats: TimedBeat[]): CompilerError[] => {
  const unrecorded = new Set(
    beats.filter((beat) => Array.isArray(beat.words) && beat.words.length === 0).map((b) => b.id),
  );
  if (unrecorded.size === 0) return [];

  const errors: CompilerError[] = [];
  const reported = new Set<string>();

  for (const section of plan.sections ?? []) {
    for (const { at } of sectionAnchors(section)) {
      const parsed = parseAnchor(at);
      if (!parsed || parsed.target.kind !== 'word') continue;
      if (!unrecorded.has(parsed.beatId) || reported.has(parsed.beatId)) continue;

      reported.add(parsed.beatId);
      errors.push({
        code: 'INVALID_TIMING_INPUT',
        field: `beats.${parsed.beatId}.words`,
        message: `Anchor "${at}" names a word of beat "${parsed.beatId}", but this take carries no word timings for it. A word anchor resolves against a recorded take; this one was assembled without folding an alignment, so there is no measured onset to cut on. Record the take, or anchor to ${parsed.beatId}.start, ${parsed.beatId}.mid or ${parsed.beatId}.end.`,
      });
    }
  }

  return errors;
};

/**
 * The words of a beat are a projection of its own text, and this checks them as one.
 *
 * The same argument as text equality one level up, applied to the field a word anchor
 * resolves against. A word list is an easier thing to get subtly wrong than a boundary —
 * an extra word, a word belonging to the neighbouring beat, an onset outside the window —
 * and every one of those resolves an anchor to a plausible frame and cuts the picture
 * against the wrong word. That is the exact defect the word vocabulary exists to repair,
 * and it is invisible in the render: the video plays, the highlight appears, it appears
 * over the wrong syllable.
 *
 * Equality against `tokenise`, not containment. "Every word the take names appears
 * somewhere in the text" would accept a take with the words in the wrong order and a take
 * missing half of them, which are the two ways a fold with an off-by-one produces output
 * that still looks like English.
 *
 * An empty list passes deliberately. A take assembled by hand, or by anything that did not
 * fold a recorded alignment, genuinely has no word timings — `render-demo.mts` is one, and
 * so is every catalog example. Requiring words here would make the compiler refuse plans
 * that use no word anchors at all. The anchor is where the absence becomes an error,
 * because the anchor is where someone asked for a word.
 */
const checkWords = (beat: TimedBeat): CompilerError[] => {
  const at = (message: string): CompilerError => ({
    code: 'INVALID_TIMING_INPUT',
    field: `beats.${beat.id}.words`,
    message,
  });

  /**
   * The field's own shape, checked before its contents.
   *
   * This module's premise is that a take arriving as JSON has none of the guarantees its
   * TypeScript type makes, and `words` was the one field that leaned on them anyway: a take
   * written before the field existed carries no `words` key, and reading `.length` off it
   * threw a TypeError from inside the gate whose whole purpose is to return an error
   * instead. A crash is not a report, and §8.1 needs the report for precisely the takes
   * that cannot compile.
   */
  if (!Array.isArray(beat.words)) {
    return [
      at(
        `Beat "${beat.id}" carries ${beat.words === undefined ? 'no word list at all' : `a word list that is not a list (${typeof beat.words})`}. A take records a list of words or an empty one; there is no third state, and every anchor into this beat would resolve against a value the fold never wrote.`,
      ),
    ];
  }

  if (beat.words.length === 0) return [];

  const expected = tokenise(beat.text).map((word) => word.text);
  const actual = beat.words.map((word) => word.text);

  if (expected.length !== actual.length || expected.some((word, i) => word !== actual[i])) {
    return [
      at(
        `Beat "${beat.id}" carries the words [${actual.join(', ')}] where its text reads [${expected.join(', ')}]. The words are the beat's own text tokenised, so a list that is not it was folded against different characters — and every anchor into it points at the wrong one.`,
      ),
    ];
  }

  const errors: CompilerError[] = [];

  for (const [i, word] of beat.words.entries()) {
    if (!Number.isFinite(word.fromMs) || word.fromMs < beat.fromMs || word.fromMs >= beat.toMs) {
      errors.push(
        at(
          `"${word.text}" is timed at ${word.fromMs}ms in beat "${beat.id}", which runs ${beat.fromMs}–${beat.toMs}ms. A word spoken outside the beat that carries it puts an anchor in a scene the agent never named.`,
        ),
      );
      continue;
    }

    const previous = beat.words[i - 1];
    if (previous !== undefined && word.fromMs < previous.fromMs) {
      errors.push(
        at(
          `"${word.text}" starts at ${word.fromMs}ms after "${previous.text}" at ${previous.fromMs}ms, in beat "${beat.id}". Words are in spoken order or they are not this beat's words.`,
        ),
      );
    }
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
    return {
      id: beat.id,
      from: toFrame(timing.fromMs),
      to: toFrame(timing.toMs),
      /**
       * Words cross with the same `toFrame` as the boundaries, so a word onset and the
       * beat boundary it may coincide with round identically. Two rounding rules here
       * would put the first word of a beat one frame before the beat it belongs to.
       */
      words: timing.words.map((word) => ({ text: word.text, frame: toFrame(word.fromMs) })),
    };
  });
};

/** The window of a contiguous run of beats. The partition is already validated. */
export const spanWindow = (spansBeats: string[], frameBeats: FrameBeat[]) => {
  const covered = frameBeats.filter((beat) => spansBeats.includes(beat.id));
  return { from: covered[0]?.from ?? 0, to: covered.at(-1)?.to ?? 0 };
};
