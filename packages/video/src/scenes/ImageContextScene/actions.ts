import { z } from 'zod';
import type { ActionDef } from '../../core/types';

/** Every action is driven by narration anchors; no timers or camera commands. */
export const imageContextActions = {
  revealImage: {
    description: 'Reveal the full-frame image when the narration reaches its subject.',
    payload: null,
  },
  revealCopy: {
    description:
      'Bring the headline and optional caption over the image, one after the other. Also restores copy after hideCopy.',
    payload: null,
  },
  hideCopy: {
    description:
      'Remove the headline and caption after reading, leaving the image visible. Clear an active emphasis separately with clearEmphasis.',
    payload: null,
  },
  emphasize: {
    description:
      'Points at one spoken word or short phrase by showing it over the image as the narrator says it. Use a word anchor onto that word. Temporarily replaces headline and caption so only one message is visible. Holds until clearEmphasis, a replacement emphasis, or the scene ends.',
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
  clearEmphasis: {
    description:
      'Remove the emphasized phrase. Restores the headline and caption unless hideCopy has removed them.',
    payload: null,
  },
} as const satisfies Record<string, ActionDef>;

export type ImageContextActionId = keyof typeof imageContextActions;
