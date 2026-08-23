/**
 * Closed action vocabulary. Anything outside this record is a compilation error, never a
 * silence.
 *
 * Three verbs, and each is one the component actually reads: two entrances the plan may
 * take ownership of, and one repeatable graphic emphasis. The entrances are independent
 * by design — no ordering rule exists between them, in either direction.
 *
 * None of the three declares a deictic field, and that absence is a decision rather than
 * an omission. `accentCharacter` in particular may name a spoken word in its anchor —
 * any event may, when the sentence justifies the timing — but its payload names no spoken
 * content and no target, so there is nothing whose meaning depends on the moment of
 * utterance. Declaring a field would bind it to the word-landing rule the pointing
 * gestures live under; leaving it out keeps the anchor a free choice of timing.
 */
import type { ActionDef } from '../../core/types';

export const characterExplainerActions = {
  revealCharacter: {
    description:
      'Bring the character cutout onto the frame. Use it to hold the figure back until the narration reaches it.',
    payload: null,
  },
  revealCopy: {
    description:
      'Bring the label, headline and explanation in, one after the other. Independent of revealCharacter; either order is legal.',
    payload: null,
  },
  accentCharacter: {
    description:
      'A brief graphic pulse of the whole cutout — a restrained scale and tilt with its halo — that returns the figure to rest. It may repeat; the latest event restarts the gesture.',
    payload: null,
  },
} as const satisfies Record<string, ActionDef>;

export type CharacterExplainerActionId = keyof typeof characterExplainerActions;
