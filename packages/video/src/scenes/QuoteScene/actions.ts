/**
 * Closed action vocabulary. Anything outside this record is a compilation error, never
 * a silence.
 *
 * One verb, and only one, because only one beat decision exists here: whether to hold
 * the words back until the narration hands over to them. The attribution's arrival is
 * designed choreography, not a plan decision — it always enters one stagger after the
 * quote, which is a fact about the frame, not a choice about pacing.
 *
 * No verb was invented for the attribution, and no stamp verb is here. A word-stamp on
 * a quote cannot be illustrated in `examples.ts` at all (ADR-0012 — a scene example has
 * no take), and `image_context`'s `emphasize` already carries that weight; a third
 * capability does not need to inherit it. A verb whose only job would be to undo a
 * reveal is exactly the empty vocabulary the template warns against.
 */
import type { ActionDef } from '../../core/types';

export const quoteActions = {
  revealQuote: {
    description:
      'Bring the quote onto the frame, with its mark and attribution. Use it to hold ' +
      'the words back until the narration hands over to them; until then the eyebrow ' +
      'carries the frame.',
    payload: null,
  },
} as const satisfies Record<string, ActionDef>;

export type QuoteSceneActionId = keyof typeof quoteActions;
