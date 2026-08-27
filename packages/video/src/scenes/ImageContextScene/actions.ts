/**
 * Closed action vocabulary.
 *
 * This file used to be an empty object, and the empty object was the statement: an action
 * vocabulary is a promise that the compiler resolves anchors onto frames and the component
 * animates on them, and inventing one before a beat had asked for it would have produced
 * the architecture's most dangerous failure — a plan that validates, renders perfectly and
 * animates nothing.
 *
 * A beat has now asked. `docs/proposals/architecture-evolutions.md` records that "actions
 * inventées" is one of the four things the step 9 harness measures, and that a capability
 * with zero actions cannot fail that measure, which means it cannot pass it either. The
 * three verbs below are the smallest vocabulary that is honest about what this scene can
 * actually do: two entrances the motion profile used to own unconditionally, and one
 * pointing gesture.
 *
 * What is deliberately *not* here is a camera verb. `CameraRig` is the only component
 * allowed to move the camera and it publishes fixed bounds that `SlotFrame` inflates the
 * safe margin against; an event-driven push changes that contract rather than using it, so
 * it is its own increment.
 *
 * Anything outside this record is a compilation error, never a silence.
 */
import { z } from 'zod';
import type { ActionDef } from '../../core/types';

export const imageContextActions = {
  revealImage: {
    description:
      'Bring the image plate onto the frame. Use it to hold the image back until the narration reaches its subject.',
    payload: null,
  },
  revealCopy: {
    description: 'Bring the headline and caption in, one after the other, after the image.',
    payload: null,
  },
  /**
   * The pointing gesture, and the only one of the three that names something spoken.
   *
   * `text` is deictic in the strict sense the type describes: the stamp says "this word",
   * which is only true while the narrator is saying it. The agent knows the narration —
   * it wrote the beats — and does not know the image, which is why the emphasis names a
   * word rather than a region of a picture that has not been resolved yet.
   */
  emphasize: {
    description:
      'Points at one spoken word or short phrase by stamping it over the image, as the narrator ' +
      'says it. Anchor it with a word anchor onto that word, never a beat boundary. It holds ' +
      'until the scene ends, or until a later emphasis replaces it.',
    deicticFields: ['text'],
    payload: z.object({
      text: z
        .string()
        .min(1)
        .max(40)
        .describe(
          'A word or short phrase the narrator speaks in this beat. Keep it under 40 characters.',
        ),
    }),
  },
} as const satisfies Record<string, ActionDef>;

export type ImageContextActionId = keyof typeof imageContextActions;
