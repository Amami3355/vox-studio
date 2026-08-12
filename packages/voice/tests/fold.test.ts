/**
 * The fold is the whole reason this package has a pure core.
 *
 * Synthesis is not reproducible — two identical requests return different audio and
 * different timings — so nothing here calls the API. It folds a *recorded* alignment,
 * which is the only kind of TTS output an assertion can be written against.
 */
import { checkTimings, shippedPlans } from '@vox/video';
import { describe, expect, it } from 'vitest';
import { AlignmentMismatchError, BEAT_SEPARATOR, foldAlignment, scriptFor } from '../src/fold';
import type { Alignment } from '../src/fold';
import recorded from './fixtures/vertical-slice.alignment.json';

const alignment = recorded as Alignment;
const plan = shippedPlans[0]?.plan as (typeof shippedPlans)[number]['plan'];
const beats = plan.beats;

describe('scriptFor', () => {
  it('joins beat texts with the separator this package owns', () => {
    const script = scriptFor(beats);
    expect(script).toContain(`a decade.${BEAT_SEPARATOR}In London`);
  });

  it('is the string the recorded alignment was synthesised from', () => {
    expect(alignment.characters.join('')).toBe(scriptFor(beats));
  });
});

describe('foldAlignment', () => {
  const timed = foldAlignment(beats, alignment);

  it('returns one timed beat per plan beat, in order', () => {
    expect(timed.map((beat) => beat.id)).toEqual(beats.map((beat) => beat.id));
  });

  it('carries each beat text verbatim, which is what makes it checkable', () => {
    expect(timed.map((beat) => beat.text)).toEqual(beats.map((beat) => beat.text));
  });

  /** ADR-0004 decision 3: beat i's toMs *is* beat i+1's fromMs, by construction. */
  it('is contiguous by construction, not by luck', () => {
    for (const [i, beat] of timed.slice(1).entries()) {
      expect(beat.fromMs).toBe(timed[i]?.toMs);
    }
  });

  it('starts at zero and runs the length of the take', () => {
    expect(timed[0]?.fromMs).toBe(0);
    expect(timed.at(-1)?.toMs).toBeGreaterThan(20_000);
  });

  /**
   * The load-bearing assertion of this package: the beats the compiler reads are the fold
   * of the alignment recorded beside them.
   *
   * It compares two committed artifacts rather than hardcoded numbers, so re-recording a
   * take needs no edit here — while a beats file assembled from a *different* take than
   * its audio fails immediately. Since synthesis is not reproducible, that mismatch is
   * otherwise undetectable: the numbers look perfectly well-formed, and the only symptom
   * is a video cut against words nobody says.
   */
  it('reproduces the beats file shipped beside it', () => {
    expect(timed).toEqual(shippedPlans[0]?.beats);
  });

  /**
   * The reason the rule reads start offsets and not end times. If this fixture ever stops
   * containing inter-beat silence, the naive fold would pass on it and the test above
   * would stop discriminating.
   */
  it('is folded from a take that actually contains inter-beat silence', () => {
    const firstBeatLength = beats[0]?.text.length as number;
    const endOfOwnLastCharacter = Math.round(
      (alignment.character_end_times_seconds[firstBeatLength - 1] as number) * 1000,
    );
    expect(endOfOwnLastCharacter).toBeLessThan(timed[0]?.toMs as number);
  });

  it('satisfies the compiler it was built for', () => {
    expect(checkTimings(plan, timed, 30)).toEqual([]);
  });
});

describe('foldAlignment rejects an alignment that is not of this script', () => {
  it('throws when the character count does not match the script', () => {
    const short: Alignment = {
      characters: alignment.characters.slice(0, -1),
      character_start_times_seconds: alignment.character_start_times_seconds.slice(0, -1),
      character_end_times_seconds: alignment.character_end_times_seconds.slice(0, -1),
    };
    expect(() => foldAlignment(beats, short)).toThrow(AlignmentMismatchError);
  });

  /** A normalised alignment is the realistic way this happens: same length, other text. */
  it('throws when the characters do not reproduce the script', () => {
    const rewritten: Alignment = {
      ...alignment,
      characters: alignment.characters.map((c, i) => (i === 0 ? 'X' : c)),
    };
    expect(() => foldAlignment(beats, rewritten)).toThrow(AlignmentMismatchError);
  });

  it('throws rather than fabricating a take from no beats', () => {
    expect(() => foldAlignment([], alignment)).toThrow(AlignmentMismatchError);
  });
});
