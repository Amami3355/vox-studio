import type { SceneMeta } from '../../core/types';

export const lineChartMeta: SceneMeta = {
  id: 'line_chart',
  name: 'LineChartScene',
  family: 'data',
  summary: 'Continuous numeric change across ordered calendar dates.',
  useWhen: [
    'showing a trend, acceleration or slowdown over calendar time',
    'showing how a numeric measure changed across a period',
    'comparing one to three temporal series on one value axis',
    'calling out a dated high, low or inflection',
  ],
  avoidWhen: [
    'comparing discrete named categories → bar_chart',
    'showing one number → stat_counter',
    'showing shares of a whole → stat_donut',
    'showing dated events without a numeric measure → timeline',
    'showing correlation between two numeric variables → scatter_plot',
  ],
  supportsEvents: true,
  requiresAssets: false,
  occupiesRegions: ['full'],
  supportedCompositions: ['full'],
  /** Chrome settles first; three staggered series and a readable focus settle by frame 120. */
  minDurationFrames: 120,
  /** Eight seconds leaves a held trend plus room for one focus and one concise annotation. */
  recommendedDurationFrames: 240,
};
