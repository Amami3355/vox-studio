/**
 * TEMPLATE — copy this folder, do not register this scene.
 *
 * Closed action vocabulary. Anything outside this record is a compilation error, never a
 * silence.
 *
 * **An empty object is a legitimate answer.** An action vocabulary is a promise that the
 * compiler resolves anchors onto frames and that the component animates on them. Inventing
 * a verb before a beat has asked for it produces the architecture's most dangerous failure
 * — a plan that validates, renders perfectly, and animates nothing. If this file is empty,
 * set `supportsEvents: false` in `meta.ts` and delete `state.ts` and `checks.ts`.
 *
 * `deicticFields` names the payload fields whose value is a word the narrator speaks, and
 * which the event must therefore *land on*. A pointing gesture declares them; a note whose
 * timing follows the sentence that justifies it does not. The catalog contract rejects a
 * declared field the payload does not carry, because that would read undefined and check
 * nothing.
 */
import { z } from 'zod';
import type { ActionDef } from '../../core/types';

/**
 * TODO replace both verbs, or delete them and ship `{}`. Two are shown because they are the
 * two kinds: an entrance the plan takes ownership of, and a pointing gesture that has to
 * land on a spoken word. Most scenes need neither.
 */
export const templateSceneActions = {
  revealStatement: {
    description:
      'Bring the statement onto the frame. Use it to hold the claim back until the narration reaches it.',
    payload: null,
  },
  /**
   * The pointing gesture. `word` is deictic in the strict sense: the stamp says "this
   * word", which is only true while the narrator is saying it — so the anchor to write is
   * the word form, `b3.word:London`, not `b3.start`.
   */
  emphasizeWord: {
    description:
      'Points at one spoken word by stamping it over the statement, as the narrator says it. ' +
      'Anchor it with a word anchor onto that word, never a beat boundary. It holds until the ' +
      'scene ends, or until a later emphasis replaces it.',
    deicticFields: ['word'],
    payload: z.object({
      word: z
        .string()
        .min(1)
        .max(40)
        .describe('A word or short phrase the narrator speaks in this beat.'),
    }),
  },
} as const satisfies Record<string, ActionDef>;

export type TemplateSceneActionId = keyof typeof templateSceneActions;
