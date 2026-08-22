/**
 * Closed action vocabulary. Anything outside this record is a compilation error, never
 * a silence.
 *
 * Two verbs, and the second one is the reason this capability was built alongside the word
 * anchor rather than after it.
 *
 * **`advanceWord` carries no payload, and that is the decision.** ADR-0011 binds a scene's
 * events to the order they are written, so the *n*-th `advanceWord` is the *n*-th word by
 * construction. A payload naming the word would write it twice — once in the anchor, once
 * in the payload — and two sources that can diverge is the failure this vocabulary exists
 * to avoid. It would also make the verb deictic, and under ADR-0012 a deictic action cannot
 * be illustrated in `examples.ts` at all, because a scene example has no take.
 *
 * So the verb declares no `deicticFields` either, and that is not an oversight. A pointing
 * gesture says "this one" and is wrong if it lands late. This one says "the voice has moved
 * on", and it is *legitimate* at a beat boundary: a plan with no recorded take paces the
 * card at beat granularity and loses nothing but the sweep. Requiring a word anchor would
 * make the honest coarse form unwritable.
 */
import type { ActionDef } from '../../core/types';

export const typographicStatementActions = {
  revealStatement: {
    description:
      'Bring the sentence onto the frame. Use it to hold the statement back until the ' +
      'narration hands over to it; until then the eyebrow and the ground carry the card.',
    payload: null,
  },
  advanceWord: {
    description:
      'Move the voice on by one word: everything before it stands in full, the word ' +
      'itself takes the mark, and the rest of the sentence stays recessive. Write one ' +
      'per word, in spoken order — the n-th event is the n-th word, so there is nothing ' +
      'to name. Anchor them to `word:` forms for a card that follows a recorded take, or ' +
      'to beat boundaries to pace it without one. Write none and the whole sentence ' +
      'simply stands.',
    payload: null,
  },
} as const satisfies Record<string, ActionDef>;

export type TypographicStatementActionId = keyof typeof typographicStatementActions;
