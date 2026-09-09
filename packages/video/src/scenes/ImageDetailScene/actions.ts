import { z } from 'zod';
import type { ActionDef } from '../../core/types';
export const imageDetailActions = {
  focus: {
    description:
      'Reframe the image content toward a prepared region, or return to the whole image. Use a word anchor when the narration motivates the detail. This moves a flattened image, never its articulated parts. Confirm that the accepted image actually places the subject in that region.',
    payload: z
      .object({
        region: z
          .enum(['whole', 'center', 'top', 'bottom', 'left', 'right'])
          .describe(
            'Semantic region of the prepared base view. Whole restores that view: complete and uncropped with contain, centrally cropped with cover.',
          ),
      })
      .strict(),
  },
  annotate: {
    description:
      'Show one short explanation over the lower-left of the image, replacing the introductory title and caption or the previous annotation. Use the word anchor that motivates the explanation; this is an annotation, not a precise identification of a depicted part.',
    payload: z
      .object({
        text: z
          .string()
          .min(1)
          .max(120)
          .describe(
            'An explanatory note supported by the narration and image. No invented technical precision.',
          ),
      })
      .strict(),
  },
  clearAnnotation: {
    description:
      'Clear the text overlay and its contrast scrim to leave only the image. The introductory title and caption do not return. May also clear the introduction before any annotation.',
    payload: null,
  },
} as const satisfies Record<string, ActionDef>;
