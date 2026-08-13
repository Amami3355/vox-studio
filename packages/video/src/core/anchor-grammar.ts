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

/** One branch of the grammar, described once for every audience that needs it. */
export type AnchorForm = {
  /** The shape as written, with `<…>` placeholders. */
  form: string;
  /**
   * Completes "Expected <form> …" in a rejection. Terse on purpose: it appears in compiler
   * errors, where a paragraph buries the one thing that was wrong.
   */
  expectation: string;
  /**
   * The same branch for a reader who has never seen the grammar — the agent, which by
   * rule 2 has only the manifest. Separate from `expectation` because they are read in
   * different situations and neither length suits both, not because the grammar has two
   * descriptions: both are generated from this one array.
   */
  means: string;
  examples: readonly string[];
};

/**
 * The grammar as data, so it can be *published* rather than only enforced.
 *
 * Rule 2 says the agent sees the manifest and never the code. Until this existed, every
 * anchor an agent had to write was described exclusively in TypeScript it cannot read —
 * `catalog.json` did not contain the word "anchor" — so the vocabulary was unlearnable by
 * construction and the first gate measure was measuring a manifest with a hole in it.
 *
 * `ANCHOR_EXPECTATION` is derived below rather than written beside this, which is the same
 * reason the two regexes are built from one `BEAT_ID`: a grammar that describes itself
 * twice describes itself differently within a month. That already happened here — three
 * copies, one of which rejected the first example to use a word anchor.
 */
export const ANCHOR_GRAMMAR = {
  rule: 'The agent expresses semantic time; the compiler produces physical time. Write an anchor, never a frame.',
  forms: [
    {
      form: '<beatId>.start|mid|end',
      expectation: 'with an optional +short/-short/+long/-long offset',
      means:
        'A boundary or the midpoint of one beat, optionally nudged by a rhythm token. ' +
        'Use it when the event follows the shape of the sentence rather than any ' +
        'particular word in it. `scene` is a pseudo-beat meaning the scene’s own bounds.',
      examples: ['b2.start', 'b4.end-short', 'scene.mid'],
    },
    {
      form: '<beatId>.word:<word>',
      expectation: 'naming a word the beat actually speaks (no offset)',
      means:
        'The frame the narrator begins that word. Use it when the event must land on ' +
        'what is being said — an action listing `deicticFields` is saying exactly that ' +
        'about those payload fields, so anchor it to the word it names. The word must ' +
        'appear in that beat’s text exactly once — ' +
        'twice is an error, not a first match — and takes no offset, because an offset ' +
        'from a word onset is the arithmetic this form exists to avoid: if the event ' +
        'belongs slightly later, name the next word. `scene` has no text, so it cannot ' +
        'carry this form.',
      examples: ['b2.word:London'],
    },
  ] as const satisfies readonly AnchorForm[],
  offsets: ['short', 'long'],
  sceneBeatId: 'scene',
} as const;

/**
 * The one sentence describing the grammar, so a rejection from the validator and a
 * rejection from the resolver cannot describe different languages — and now so that
 * neither can describe a different language from the manifest the agent read.
 */
export const ANCHOR_EXPECTATION = `${ANCHOR_GRAMMAR.forms
  .map((form) => `${form.form} ${form.expectation}`)
  .join(', or ')}.`;

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
