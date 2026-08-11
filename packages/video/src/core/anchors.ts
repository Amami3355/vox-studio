/**
 * Semantic anchor resolution.
 *
 * The agent expresses time symbolically — `b4.start`, `b5.mid`, `b6.end-short` — and
 * never in frames. This module turns anchors into frames.
 *
 * STUB NOTICE: the real beat timings come from the TTS timepoints of ADR-0002 (step 7
 * of the build order). Until that exists, `syntheticBeats` splits a scene's duration
 * evenly across the beats it spans, so examples can carry real anchors today. When the
 * beat compiler lands, it replaces `syntheticBeats` only — `resolveAnchor` and every
 * `examples.ts` in the library stay untouched.
 */
import { motion } from '../design/motion';
import type { SemanticEvent, TimedEvent } from './types';

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
};

export type AnchorOffset = 'short' | 'long';

const OFFSET_FRAMES: Record<AnchorOffset, number> = {
  short: motion.duration.quick,
  long: motion.duration.slow,
};

const ANCHOR_RE = /^([A-Za-z0-9_-]+)\.(start|mid|end)(?:([+-])(short|long))?$/;

export class UnknownAnchorError extends Error {
  constructor(
    public readonly anchor: string,
    public readonly available: string[],
  ) {
    super(
      `Unknown anchor "${anchor}". Expected <beatId>.start|mid|end with an optional ` +
        `+short/-short/+long/-long offset. Known beats: ${available.join(', ') || '(none)'}.`,
    );
    this.name = 'UnknownAnchorError';
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
  const match = ANCHOR_RE.exec(anchor.trim());
  if (!match) {
    throw new UnknownAnchorError(anchor, beats.map((b) => b.id).concat('scene'));
  }

  const [, beatId, position, sign, offset] = match as unknown as [
    string,
    string,
    'start' | 'mid' | 'end',
    '+' | '-' | undefined,
    AnchorOffset | undefined,
  ];

  const beat =
    beatId === 'scene'
      ? { id: 'scene', from: sceneBounds.from, to: sceneBounds.to }
      : beats.find((b) => b.id === beatId);

  if (!beat) {
    throw new UnknownAnchorError(anchor, beats.map((b) => b.id).concat('scene'));
  }

  const base =
    position === 'start'
      ? beat.from
      : position === 'end'
        ? beat.to
        : beat.from + Math.round((beat.to - beat.from) / 2);

  const delta = offset ? OFFSET_FRAMES[offset] * (sign === '-' ? -1 : 1) : 0;

  return clamp(base + delta, sceneBounds.from, sceneBounds.to);
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
 */
export const syntheticBeats = (beatIds: string[], durationInFrames: number): FrameBeat[] => {
  const slice = durationInFrames / beatIds.length;
  return beatIds.map((id, i) => ({
    id,
    from: Math.round(i * slice),
    to: Math.round((i + 1) * slice),
  }));
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
