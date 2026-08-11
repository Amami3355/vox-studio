import type { SceneMeta } from '../../core/types';

/**
 * Selection metadata. This is what the agent reads to *choose* the scene, before it
 * ever reads the schema.
 *
 * `avoidWhen` entries redirect explicitly. One line of redirection is worth three
 * paragraphs of description.
 */
export const barChartMeta: SceneMeta = {
  id: 'bar_chart',
  name: 'BarChartScene',
  family: 'data',
  summary: 'Comparison of discrete values across named categories.',
  useWhen: [
    'comparing quantities between named categories',
    'showing a ranking',
    'contrasting two to eight values',
    'making one value in a set stand out',
  ],
  avoidWhen: [
    'continuous change over time → line_chart',
    'share of a whole → stat_donut',
    'a single value → stat_counter',
    'a sequence of dated events → timeline',
  ],
  supportsEvents: true,
  requiresAssets: false,
  occupiesRegions: ['bottom', 'left'],
  supportedCompositions: ['full', 'left', 'right'],
  minDurationFrames: 90,
  recommendedDurationFrames: 210,
};
