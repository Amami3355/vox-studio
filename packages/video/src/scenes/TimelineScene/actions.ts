import { z } from 'zod';
import type { ActionDef } from '../../core/types';

const eventTarget = z.string().min(1).max(48).describe('Must match one `events[].label`.');

export const TIMELINE_ANNOTATION_TEXT_MAX = 90;

/**
 * Three verbs, deliberately shaped like `line_chart`'s, so an agent that has learned one
 * dated scene has learned this one.
 *
 * `focusEvent` **declares `deicticFields: ['label']`** and `annotate` declares nothing.
 * The distinction is `ActionDef`'s own, and it holds here for the same reason it holds
 * there: a focus is a pointing gesture — it says "this one", and "this one" is only true
 * while the narrator is saying it, so the anchor to write is the word form
 * (`b4.word:Karlsruhe`) and never `b4.start`. An annotation's timing follows the sentence
 * that *justifies* it, which may be a beat away, and holding it to the landing rule would
 * be wrong rather than strict.
 *
 * The declaration has a published cost, recorded here because it is easy to read as an
 * omission: a scene example has no take, `syntheticBeats` gives it `words: []`, and a word
 * anchor resolved against one throws by design — so **`focusEvent` cannot appear in
 * `examples.ts` at all.** ADR-0012 says that is legal. `examples.ts` illustrates
 * `revealTimeline` and `annotate`; `image_context` omits `emphasize` on the same terms.
 */
export const timelineActions = {
  revealTimeline: {
    description: 'Hold the chronology back, then reveal its events in date order.',
    payload: null,
  },
  focusEvent: {
    description:
      'Points at one dated event, bringing it forward and letting the rest of the chronology ' +
      'recede. It says "this one", so it must land while the narrator is saying that event: ' +
      'anchor it with a word anchor onto the label, never a beat boundary.',
    deicticFields: ['label'],
    payload: z.object({ label: eventTarget }).strict(),
  },
  annotate: {
    description:
      'Attach one durable explanation to a dated event, and leave it up. It makes no pointing ' +
      'claim, so its timing may follow the sentence that justifies it and a beat boundary is ' +
      'legitimate.',
    payload: z
      .object({
        label: eventTarget,
        text: z
          .string()
          .min(1)
          .max(TIMELINE_ANNOTATION_TEXT_MAX)
          .describe('Concise annotation copy, up to 90 characters.'),
      })
      .strict(),
  },
} as const satisfies Record<string, ActionDef>;

export type TimelineActionId = keyof typeof timelineActions;
