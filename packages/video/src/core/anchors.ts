/**
 * Semantic anchor resolution.
 *
 * The agent expresses time symbolically — `b4.start`, `b6.end-short`, `b2.word:March` — and
 * never in frames. This module turns anchors into frames.
 *
 * STUB NOTICE: the real beat timings come from the TTS timepoints of ADR-0002 (step 7
 * of the build order). Until that exists, `syntheticBeats` splits a scene's duration
 * evenly across the beats it spans, so examples can carry real anchors today. When the
 * beat compiler lands, it replaces `syntheticBeats` only — `resolveAnchor` and every
 * `examples.ts` in the library stay untouched.
 */
import { motion } from '../design/motion';
import { ANCHOR_EXPECTATION, type AnchorOffset, parseAnchor } from './anchor-grammar';
import type { SemanticEvent, TimedEvent } from './types';

export type { AnchorOffset } from './anchor-grammar';

/** One spoken word, in the frame domain. */
export type FrameWord = { text: string; frame: number };

/**
 * A beat's window in frames — the third and last domain a beat travels through.
 * `Beat` is narrative, `TimedBeat` is audio in milliseconds, `FrameBeat` is Remotion.
 * Only the compiler crosses from the second to the third.
 */
export type FrameBeat = {
  id: string;
  /** Absolute frame, inclusive. */
  from: number;
  /** Absolute frame, exclusive. */
  to: number;
  /**
   * The beat's words, if this table came from a real take. Empty for a synthetic one,
   * which is why a word anchor against it fails rather than resolving to a guess.
   */
  words: FrameWord[];
};

const OFFSET_FRAMES: Record<AnchorOffset, number> = {
  short: motion.duration.quick,
  long: motion.duration.slow,
};

export class UnknownAnchorError extends Error {
  constructor(
    public readonly anchor: string,
    public readonly available: string[],
  ) {
    super(
      `Unknown anchor "${anchor}". Expected ${ANCHOR_EXPECTATION} ` +
        `Known beats: ${available.join(', ') || '(none)'}.`,
    );
    this.name = 'UnknownAnchorError';
  }
}

/**
 * A word anchor that named a word this beat cannot offer, and why.
 *
 * Separate from `UnknownAnchorError` because the corrections are different, and §8.1 feeds
 * these back to an agent to repair. An unknown anchor is bad syntax or a beat outside the
 * scene. This is a well-formed anchor into the right beat that still cannot resolve —
 * because the word is not in the beat, because it is in there twice, or because this take
 * carries no word timings at all.
 */
export class UnresolvableWordError extends Error {
  constructor(
    public readonly anchor: string,
    message: string,
  ) {
    super(message);
    this.name = 'UnresolvableWordError';
  }
}

/**
 * Resolve one anchor against a beat table.
 *
 * `scene` is accepted as a pseudo-beat id so a scene can anchor to its own bounds
 * (`scene.end-short`) without knowing which beats it covers.
 */
export const resolveAnchor = (
  anchor: string,
  beats: FrameBeat[],
  sceneBounds: { from: number; to: number },
): number => {
  const parsed = parseAnchor(anchor);
  if (!parsed) {
    throw new UnknownAnchorError(anchor, beats.map((b) => b.id).concat('scene'));
  }

  const { beatId, target } = parsed;

  /**
   * `scene` has bounds and no text, so it can answer a boundary and never a word. Caught
   * here rather than in the grammar: the string is well-formed, and "a scene does not
   * speak" is the useful thing to say.
   */
  if (beatId === 'scene' && target.kind === 'word') {
    throw new UnresolvableWordError(
      anchor,
      `Anchor "${anchor}" names a word on "scene", which is the pseudo-beat a scene uses for its own bounds and has no text. Name the beat that speaks the word.`,
    );
  }

  const beat =
    beatId === 'scene'
      ? { id: 'scene', from: sceneBounds.from, to: sceneBounds.to, words: [] }
      : beats.find((b) => b.id === beatId);

  if (!beat) {
    throw new UnknownAnchorError(anchor, beats.map((b) => b.id).concat('scene'));
  }

  if (target.kind === 'word') {
    return clamp(wordFrame(anchor, beat, target.word), sceneBounds.from, sceneBounds.to);
  }

  const base = target.position === 'start' ? beat.from : beat.to;

  const delta = target.offset ? OFFSET_FRAMES[target.offset] * target.sign : 0;

  return clamp(base + delta, sceneBounds.from, sceneBounds.to);
};

/**
 * The frame a named word begins on, or a loud refusal.
 *
 * A repeated word is an error rather than a first-match, and that is the decision this
 * whole vocabulary turns on. Resolving `b2.word:rent` to the first "rent" when the beat
 * says two is a *silent choice of which word the picture cuts on* — the precise failure
 * that produced this module, arriving through the mechanism built to prevent it. The
 * correction is cheap and an agent can make it unaided: name a word that appears once, or
 * anchor to a boundary.
 *
 * Case-sensitive, because the beat text is what the agent wrote and it can read it.
 * Matching "london" against "London" would be a kindness that costs the ability to say
 * exactly which token was meant.
 */
const wordFrame = (anchor: string, beat: FrameBeat, word: string): number => {
  if (beat.words.length === 0) {
    throw new UnresolvableWordError(
      anchor,
      `Anchor "${anchor}" names a word, but beat "${beat.id}" carries no word timings. Word anchors resolve against a recorded take; a synthetic or hand-written one can only answer .start and .end.`,
    );
  }

  const matches = beat.words.filter((candidate) => candidate.text === word);

  if (matches.length === 0) {
    throw new UnresolvableWordError(
      anchor,
      `Anchor "${anchor}" names "${word}", which beat "${beat.id}" does not speak. Its words are: ${beat.words.map((w) => w.text).join(', ')}.`,
    );
  }

  if (matches.length > 1) {
    throw new UnresolvableWordError(
      anchor,
      `Anchor "${anchor}" is ambiguous: "${word}" appears ${matches.length} times in beat "${beat.id}". Name a word that appears once, or use ${beat.id}.start or ${beat.id}.end.`,
    );
  }

  return (matches[0] as FrameWord).frame;
};

/** Resolve a whole event list, relative to the start of the scene. */
export const resolveEventTimings = (
  events: SemanticEvent[],
  beats: FrameBeat[],
  sceneBounds: { from: number; to: number },
): TimedEvent[] =>
  events.map((event) => {
    const absolute = resolveAnchor(event.at, beats, sceneBounds);
    const timed: TimedEvent = { frame: absolute - sceneBounds.from, action: event.action };
    if (event.payload !== undefined) timed.payload = event.payload;
    return timed;
  });

/**
 * STUB. Split `durationInFrames` evenly across `beatIds`, so an example can be played
 * before any voice-over exists. Replaced wholesale by the beat compiler.
 *
 * An empty list yields an empty table rather than a fabricated `b1`. Inventing a beat
 * here would relocate exactly the silent fallback ADR-0002 removed from the caller; an
 * empty table instead makes `resolveAnchor` throw, which is the loud half of rule 5.
 *
 * `words: []` for the same reason, one level down, and it is the more important of the
 * two. Splitting a duration evenly across beats produces a *plausible* beat table, which
 * is all an isolated example needs. There is no equivalent for words: nothing about a
 * duration says when "London" was spoken, and a synthetic onset would be a number that
 * looks exactly like a measured one and cuts the picture against the wrong syllable. A
 * word anchor against a synthetic take therefore fails, and says that it has no take.
 */
export const syntheticBeats = (beatIds: string[], durationInFrames: number): FrameBeat[] => {
  const slice = durationInFrames / beatIds.length;
  return beatIds.map((id, i) => ({
    id,
    from: Math.round(i * slice),
    to: Math.round((i + 1) * slice),
    words: [],
  }));
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
