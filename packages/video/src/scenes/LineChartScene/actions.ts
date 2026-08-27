import { z } from 'zod';
import type { ActionDef } from '../../core/types';

const seriesTarget = z.string().min(1).max(32).describe('Must match one `series.label`.');
const pointTarget = z.string().min(1).max(24).describe('Must match one `points[].label`.');
export const LINE_CHART_ANNOTATION_TEXT_MAX = 70;

export const lineChartActions = {
  revealTrend: {
    description: 'Hold plot marks back, then draw the trend from earlier to later dates.',
    payload: null,
  },
  focusSeries: {
    description:
      'Points at one temporal series, bringing it forward and clearing any earlier focus. It ' +
      'says "this one", so it must land while the narrator is saying that series: anchor it ' +
      'with a word anchor onto the series label, never a beat boundary.',
    deicticFields: ['series'],
    payload: z.object({ series: seriesTarget }).strict(),
  },
  focusPoint: {
    description:
      'Points at one dated observation, showing its exact date and formatted value. It says ' +
      '"this one", so it must land while the narrator is saying that observation: anchor it ' +
      'with a word anchor onto the label, never a beat boundary.',
    deicticFields: ['label'],
    payload: z.object({ series: seriesTarget, label: pointTarget }).strict(),
  },
  annotatePoint: {
    description:
      'Attach one concise explanatory note to a dated observation. It makes no pointing claim, ' +
      'so its timing may follow the sentence that justifies it and a beat boundary is legitimate.',
    payload: z
      .object({
        series: seriesTarget,
        label: pointTarget,
        text: z
          .string()
          .min(1)
          .max(LINE_CHART_ANNOTATION_TEXT_MAX)
          .describe('Concise annotation copy, up to 70 characters.'),
      })
      .strict(),
  },
} as const satisfies Record<string, ActionDef>;

export type LineChartActionId = keyof typeof lineChartActions;
