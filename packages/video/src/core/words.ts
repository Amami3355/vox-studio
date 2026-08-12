/**
 * What counts as one word, and the one place that decides it.
 *
 * Three things depend on agreeing exactly: the fold in `packages/voice`, which cuts a
 * recorded alignment into words; the anchor grammar, which decides what an agent is
 * allowed to write after `word:`; and `checkTimings`, which proves a take's words were
 * derived from the beat text rather than supplied beside it. A tokeniser that disagreed
 * with the grammar would make a word the agent can plainly read in the beat text
 * unnameable, and would say nothing about why — so this lives in the package all three
 * import, and `packages/voice` reaches for it here rather than keeping its own.
 */

/**
 * A word starts and ends on a letter or a digit, and may carry apostrophes or hyphens
 * inside it. So "Europe's" is one word, "twenty-six" is one word, and the comma after
 * "cities" belongs to no word at all.
 *
 * Unicode classes rather than `A-Za-z`: the scripts this reads are not all English, and a
 * beat naming "Zürich" should be anchorable to it. The same reasoning that made the fold
 * assert a UTF-16 character count applies here — the first accented word in a script is
 * where a narrower class would quietly stop matching.
 */
export const WORD_PATTERN = "[\\p{L}\\p{N}](?:[\\p{L}\\p{N}'’-]*[\\p{L}\\p{N}])?";

const WORD_RE = new RegExp(WORD_PATTERN, 'gu');

/** Every word of a text, with the index it starts at. */
export const tokenise = (text: string): { text: string; index: number }[] =>
  [...text.matchAll(WORD_RE)].map((match) => ({
    text: match[0],
    index: match.index as number,
  }));
