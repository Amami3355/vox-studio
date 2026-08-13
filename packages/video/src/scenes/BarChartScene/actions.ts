/**
 * Closed action vocabulary.
 *
 * This is the system's most dangerous failure mode if left open: the agent writes
 * `emphasizeBar` instead of `highlightBar`, the scene renders perfectly, nothing
 * animates, and there is no error anywhere. A dead video with a green build.
 *
 * Anything outside this record is a compilation error, never a silence.
 */
import { z } from 'zod';
import type { ActionDef } from '../../core/types';

export const barChartActions = {
  showBaseline: {
    description: 'Reveal the first bar alone, as a reference point.',
    payload: null,
  },
  revealAll: {
    description: 'Reveal the remaining bars in a staggered cascade.',
    payload: null,
  },
  highlightBar: {
    description: 'Bring one bar forward and recede all the others.',
    deicticFields: ['label'],
    payload: z.object({
      label: z.string().describe('Must match a `label` present in `data`.'),
    }),
  },
  annotate: {
    description: 'Show a short annotation pointing at one bar.',
    payload: z.object({
      label: z.string().describe('Must match a `label` present in `data`.'),
      text: z.string().max(50).describe('Annotation copy. Keep it under 50 characters.'),
    }),
  },
} as const satisfies Record<string, ActionDef>;

export type BarChartActionId = keyof typeof barChartActions;
