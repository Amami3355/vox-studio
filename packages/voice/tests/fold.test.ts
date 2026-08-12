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
    expect(script).toContain(`keeping up.${BEAT_SEPARATOR}Nowhere is`);
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

/**
 * Word onsets, which the alignment has always carried and nothing has ever read.
 *
 * ADR-0002 left "events land on the expected words" holding only for boundary anchors, and
 * recorded snapping an arithmetic anchor to the nearest word as the open repair. Measured
 * against this take, snapping is the wrong repair: the worst failure in the shipped slice —
 * `highlightBar` on London — sat *exactly* on a word onset already. It was the onset of
 * "Berlin". What was missing was never precision; it was the ability to say which word.
 *
 * So the fold now reads what it was already given. A character alignment contains word
 * onsets for free — the start time of a word is the start time of its first character —
 * and the beat is where they belong, because a beat already carries its text verbatim and
 * the words are that same text tokenised. Nothing has to be kept in sync with anything.
 */
describe('the words a beat is made of', () => {
  const timed = foldAlignment(beats, alignment);
  const b2 = timed[1] as (typeof timed)[number];

  it('tokenises each beat into its own text, and nothing from its neighbours', () => {
    expect(b2.words.map((word) => word.text)).toEqual([
      'Nowhere',
      'is',
      'that',
      'gap',
      'wider',
      'than',
      'in',
      'London',
      'where',
      'a',
      'median',
      'income',
      'now',
      'loses',
      'almost',
      'half',
      'of',
      'itself',
      'to',
      'rent',
      'alone',
    ]);
  });

  /**
   * Literal milliseconds, read off the committed alignment by hand.
   *
   * Everywhere else in this repository a timing is derived rather than written down,
   * because a take is a recording and re-recording moves every boundary. Here the numbers
   * are the point: a fold that mis-indexes the character array by even a few positions
   * still produces plausible, ordered, in-window onsets, and only a known-good value
   * disagrees with it. The fixture is committed, so these change exactly when a take is
   * re-recorded — deliberately, like the key-frame baselines.
   */
  it('gives each word the start time of its first character', () => {
    const onset = (text: string) => b2.words.find((word) => word.text === text)?.fromMs;

    expect(onset('Nowhere')).toBe(7080);
    expect(onset('London')).toBe(9509);
    expect(onset('loses')).toBe(11920);
    expect(onset('rent')).toBe(13760);
  });

  /**
   * The defect that started this, stated as the arithmetic that failed.
   *
   * No boundary and no midpoint of b2 lands on "London" — and not marginally. The threshold
   * is the landing tolerance the slice's gate uses, 400ms, so this says exactly what that
   * gate says: arithmetic over this beat cannot produce the frame the word is spoken on.
   * A snapping rule moves an anchor to the nearest onset; it cannot move it to a different
   * word, which is why the repair was naming rather than snapping.
   */
  it('puts London out of reach of every arithmetic anchor of its own beat', () => {
    const LANDING_TOLERANCE_MS = 400;
    const london = onsetOf(b2, 'London');
    const arithmetic = [b2.fromMs, b2.fromMs + Math.round((b2.toMs - b2.fromMs) / 2), b2.toMs];

    for (const frame of arithmetic) {
      expect(Math.abs(frame - london)).toBeGreaterThan(LANDING_TOLERANCE_MS);
    }
  });

  it('keeps every onset inside the window of the beat that speaks it', () => {
    for (const beat of timed) {
      for (const word of beat.words) {
        expect(word.fromMs).toBeGreaterThanOrEqual(beat.fromMs);
        expect(word.fromMs).toBeLessThan(beat.toMs);
      }
    }
  });

  it('keeps them in the order they are spoken', () => {
    for (const beat of timed) {
      const onsets = beat.words.map((word) => word.fromMs);
      expect([...onsets].sort((a, b) => a - b)).toEqual(onsets);
    }
  });

  /** An apostrophe is inside a word; the punctuation around one is not part of it. */
  it('treats "Europe\'s" as one word and drops the comma after "cities"', () => {
    expect((timed[0] as (typeof timed)[number]).words.map((word) => word.text)).toContain(
      "Europe's",
    );
    expect((timed[0] as (typeof timed)[number]).words.map((word) => word.text)).toContain('cities');
  });
});

const onsetOf = (beat: { words: { text: string; fromMs: number }[] }, text: string): number => {
  const found = beat.words.find((word) => word.text === text);
  if (!found) throw new Error(`"${text}" is not a word of that beat.`);
  return found.fromMs;
};

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
