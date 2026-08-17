import type { SceneMeta } from '../../core/types';

/**
 * Selection metadata. This is what the agent reads to *choose* the scene, before it
 * ever reads the schema.
 *
 * `avoidWhen` entries redirect explicitly and must contain `→`; the catalog contract
 * enforces the arrow. One line of redirection is worth three paragraphs of description.
 *
 * `occupiesRegions: ['full']` and `supportedCompositions: ['full']` are the honest
 * opening. A `left`/`right` composed form is a designed frame *plus* a safe-area render
 * test, not a free declaration — `BarChartScene/meta.ts`'s header records what an unpaid
 * claim costs. Declaring one here without drawing the frame would be `ADR-0003`'s
 * "squeezed, silently and legally" in the flesh.
 */
export const statCounterMeta: SceneMeta = {
  id: 'stat_counter',
  name: 'StatCounterScene',
  family: 'data',
  summary: 'A single number set large, with what it counts. The figure is the frame.',
  useWhen: [
    'making one number the story',
    'letting a single figure land on its own',
    'stating a statistic the narration has just said aloud',
  ],
  avoidWhen: [
    'comparing quantities between categories → bar_chart',
    'pairing a claim with a photograph → image_context',
    "letting a person's own words carry the frame → quote",
  ],
  supportsEvents: true,
  requiresAssets: false,
  occupiesRegions: ['full'],
  supportedCompositions: ['full', 'left', 'right'],
  minDurationFrames: 60,
  recommendedDurationFrames: 150,
};
