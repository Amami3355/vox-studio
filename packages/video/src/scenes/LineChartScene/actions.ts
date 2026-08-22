import { z } from 'zod';
import type { ActionDef } from '../../core/types';

const seriesTarget = z.string().min(1).max(32).describe('Must match one `series.label`.');
const pointTarget = z.string().min(1).max(24).describe('Must match one `points[].label`.');

export const lineChartActions = {
  revealTrend: {
    description: 'Hold plot marks back, then draw the trend from earlier to later dates.',
    payload: null,
  },
  focusSeries: {
    description: 'Bring one temporal series forward and clear any earlier point focus.',
    deicticFields: ['series'],
    payload: z.object({ series: seriesTarget }).strict(),
  },
  focusPoint: {
    description: 'Focus one dated observation and show its exact date and formatted value.',
    deicticFields: ['label'],
    payload: z.object({ series: seriesTarget, label: pointTarget }).strict(),
  },
  annotatePoint: {
    description: 'Attach one concise explanatory note to a dated observation.',
    payload: z
      .object({
        series: seriesTarget,
        label: pointTarget,
        text: z.string().min(1).max(70).describe('Concise annotation copy, up to 70 characters.'),
      })
      .strict(),
  },
} as const satisfies Record<string, ActionDef>;

export type LineChartActionId = keyof typeof lineChartActions;
