/**
 * Character alignment → `TimedBeat[]`. The pure half of this package.
 *
 * ADR-0004 decision 3 in code: n beats have n+1 boundaries, and every one of them but the
 * last is the **start** time of the first character of a beat. Reading each beat's end
 * from the end of its *own* last character leaves the inter-beat silence owned by nobody,
 * and the compiler rejects the resulting gap — 80ms of it on a two-sentence script, which
 * is a two-frame black flash between scenes rather than a rounding curiosity.
 *
 * This module is separate from `synthesise.ts` because synthesis is **not reproducible**.
 * Two identical requests return different audio and different timings, so no assertion can
 * be written against a live call. Every property this package promises is a property of
 * the fold, and the fold is tested against a recorded alignment.
 */
import { type Beat, type TimedBeat, type TimedWord, tokenise } from '@vox/video';

/**
 * The three parallel arrays ElevenLabs returns. Seconds, per character.
 *
 * `alignment`, never `normalized_alignment`: normalisation rewrites the character
 * sequence — "2026" as "twenty twenty-six" — and beat boundaries are offsets into the text
 * the agent wrote. Indexing them against the rewritten string shifts every boundary in any
 * script containing a number, silently. ADR-0004 decision 4.
 */
export type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

/**
 * The one separator, owned here.
 *
 * ADR-0002 calls the script "the ordered concatenation of beat texts", which taken
 * literally has the voice read "a decade.In London". A single space goes between beats, so
 * an offset advances by the text length *plus this*, and the separator's own time falls
 * inside the preceding beat's window — which is what makes the beats contiguous rather
 * than merely close. It must be the same string used to build the request and to compute
 * the offsets; two sources for it would be rule 1's violation in miniature.
 */
export const BEAT_SEPARATOR = ' ';

/** The exact string that goes to the synthesiser. */
export const scriptFor = (beats: Beat[]): string =>
  beats.map((beat) => beat.text).join(BEAT_SEPARATOR);

/**
 * The alignment is not of this script.
 *
 * Loud, because rule 5 gives it no choice and because every silent alternative is worse:
 * a fold over a mismatched array produces plausible numbers, and the video cuts against
 * words nobody says. The only repair is to synthesise again, which is not something this
 * package can decide to do on a caller's behalf.
 */
export class AlignmentMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlignmentMismatchError';
  }
}

/**
 * Where each beat's first character sits in the script.
 *
 * Exported because `synthesise` and the fold must agree on it, and because it is the one
 * piece of arithmetic in this package worth reading on its own.
 */
export const beatOffsets = (beats: Beat[]): number[] => {
  let offset = 0;
  return beats.map((beat) => {
    const start = offset;
    offset += beat.text.length + BEAT_SEPARATOR.length;
    return start;
  });
};

/**
 * The words of one beat, with the onset of each.
 *
 * `offset` is where this beat's text begins in the script, so a word at local index *i*
 * is character `offset + i` of the alignment — and a word's onset is simply the start
 * time of its first character. That is the whole trick, and it is why ADR-0004 predicted
 * word timings would come "for free": the synthesiser already reported when it began
 * every character it spoke, and nothing until now read past the four it was asked for.
 *
 * `tokenise` is imported rather than written here on purpose. The compiler proves this
 * fold's output *is* the tokenisation of the beat text, so a second definition of a word
 * living in this package would make that proof compare two things that were allowed to
 * disagree.
 */
const wordsOf = (text: string, offset: number, starts: number[]): TimedWord[] =>
  tokenise(text).map((word) => ({
    text: word.text,
    fromMs: Math.round((starts[offset + word.index] as number) * 1000),
  }));

export const foldAlignment = (beats: Beat[], alignment: Alignment): TimedBeat[] => {
  if (beats.length === 0) {
    throw new AlignmentMismatchError(
      'No beats to fold. A take of nothing is not an empty take, it is a plan that was never spoken.',
    );
  }

  const script = scriptFor(beats);
  const {
    characters,
    character_start_times_seconds: starts,
    character_end_times_seconds: ends,
  } = alignment;

  /**
   * Both assertions, rather than the one that reads better. The count catches a UTF-16
   * assumption breaking — the first accented character in a script would do it — and the
   * join catches an alignment of the right length for the wrong text, which is what a
   * normalised array looks like from here. ADR-0004's consequences ask for the first by
   * name and its amendment replaced a wrong guard with the second.
   */
  if (characters.length !== script.length) {
    throw new AlignmentMismatchError(
      `The alignment has ${characters.length} characters where the script has ${script.length} UTF-16 units. It was synthesised from different text, or the characters are not code units.`,
    );
  }

  if (starts.length !== characters.length || ends.length !== characters.length) {
    throw new AlignmentMismatchError(
      'The alignment character, start-time and end-time arrays must have the same length.',
    );
  }

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index] as number;
    const end = ends[index] as number;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
      throw new AlignmentMismatchError(
        `The alignment carries an invalid interval at character ${index}.`,
      );
    }
    if (index > 0 && start < (starts[index - 1] as number)) {
      throw new AlignmentMismatchError(
        `The alignment start times move backwards at character ${index}.`,
      );
    }
  }

  if (characters.join('') !== script) {
    throw new AlignmentMismatchError(
      'The alignment characters do not reproduce the script. Beat boundaries are offsets into the ' +
        'text the agent wrote, so folding against a rewritten sequence shifts every boundary silently.',
    );
  }

  const offsets = beatOffsets(beats);
  const ms = (seconds: number) => Math.round(seconds * 1000);

  return beats.map((beat, i) => ({
    id: beat.id,
    text: beat.text,
    words: wordsOf(beat.text, offsets[i] as number, starts),
    fromMs: ms(starts[offsets[i] as number] as number),
    /**
     * The tail is the only value in the system read from an end time, and it is the least
     * stable number a take carries — under a fixed seed it was measured moving 80ms while
     * every start time held. It is still the right value: there is no n+2nd beat to start.
     */
    toMs:
      i === beats.length - 1
        ? ms(alignment.character_end_times_seconds.at(-1) as number)
        : ms(starts[offsets[i + 1] as number] as number),
  }));
};
