/**
 * The anchor grammar: the entire vocabulary an agent may write for a point in time.
 *
 * It lived in two files that agreed by hand — `catalog/validate.ts` rejected what
 * `core/anchors.ts` could not resolve, and each carried its own copy of the pattern and
 * its own sentence describing it. That is rule 1's violation in miniature, and it was
 * survivable only while the grammar had one branch. It now has two.
 *
 * ## Word anchors take no offset, and that is the point
 *
 * `b2.start+short` is meaningful: the boundary is exact and the offset is a deliberate
 * lag from it. `b2.word:London+short` is not. The reason this branch exists is that
 * arithmetic lands on no particular word — an offset from a word onset is that same
 * arithmetic, reintroduced one token later. If an event should fire slightly after
 * "London", the beat says which word comes next, and naming it is exact where `+short`
 * only happens to be close.
 *
 * It also removes a genuine ambiguity rather than documenting one. `-short` and `-long`
 * are offsets, and a hyphen is a word character: `b2.word:month-long` would otherwise
 * parse as the word "month" with a long offset, silently, and English has enough
 * `-long` compounds for that to be a real plan rather than a hypothetical one.
 */
import { WORD_PATTERN } from './words';

export type AnchorOffset = 'short' | 'long';

/** What an anchor points at inside its beat. */
export type AnchorTarget =
  | { kind: 'boundary'; position: 'start' | 'mid' | 'end'; offset?: AnchorOffset; sign: 1 | -1 }
  | { kind: 'word'; word: string };

export type ParsedAnchor = { beatId: string; target: AnchorTarget };

const BEAT_ID = '[A-Za-z0-9_-]+';

/**
 * The `u` flag is load-bearing, not decoration. `WORD_PATTERN` is built from `\p{L}` and
 * `\p{N}`, and without `u` those are not Unicode property escapes at all — they degrade
 * silently into a character class of the literal characters `\ p { L } N`, so
 * `b2.word:London` stops parsing and the failure looks like bad syntax rather than a bad
 * flag. Both expressions carry it so the two branches cannot drift apart.
 */
const BOUNDARY_RE = new RegExp(`^(${BEAT_ID})\\.(start|mid|end)(?:([+-])(short|long))?$`, 'u');
const WORD_RE = new RegExp(`^(${BEAT_ID})\\.word:(${WORD_PATTERN})$`, 'u');

/**
 * The one sentence describing the grammar, so a rejection from the validator and a
 * rejection from the resolver cannot describe different languages.
 */
export const ANCHOR_EXPECTATION =
  '<beatId>.start|mid|end with an optional +short/-short/+long/-long offset, ' +
  'or <beatId>.word:<word> naming a word the beat actually speaks (no offset).';

export const parseAnchor = (anchor: string): ParsedAnchor | null => {
  const trimmed = anchor.trim();

  const boundary = BOUNDARY_RE.exec(trimmed);
  if (boundary) {
    const [, beatId, position, sign, offset] = boundary as unknown as [
      string,
      string,
      'start' | 'mid' | 'end',
      '+' | '-' | undefined,
      AnchorOffset | undefined,
    ];
    const target: AnchorTarget = { kind: 'boundary', position, sign: sign === '-' ? -1 : 1 };
    if (offset !== undefined) target.offset = offset;
    return { beatId, target };
  }

  const word = WORD_RE.exec(trimmed);
  if (word) {
    return {
      beatId: word[1] as string,
      target: { kind: 'word', word: word[2] as string },
    };
  }

  return null;
};
