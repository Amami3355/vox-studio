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
            'Semantic region of the prepared image. Whole restores the complete uncropped view.',
          ),
      })
      .strict(),
  },
  annotate: {
    description:
      'Replace the short explanatory note over the image. Use the word anchor that motivates the explanation; this is an annotation, not a precise identification of a depicted part.',
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
    description: 'Remove the annotation when it has been read so the subject has room again.',
    payload: null,
  },
} as const satisfies Record<string, ActionDef>;
