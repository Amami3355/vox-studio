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
export const quoteMeta: SceneMeta = {
  id: 'quote',
  name: 'QuoteScene',
  family: 'typography',
  summary: 'A single quotation set large, with who said it. The words are the frame.',
  useWhen: [
    "letting a person's own words carry the frame",
    'handing the narration over to a testimony, verdict or declaration',
    'slowing the film down for one sentence that deserves to stand alone',
  ],
  avoidWhen: [
    'comparing quantities between categories → bar_chart',
    'pairing a claim with a photograph → image_context',
    'making one number the story → stat_counter',
  ],
  supportsEvents: true,
  requiresAssets: false,
  occupiesRegions: ['full'],
  supportedCompositions: ['full'],
  minDurationFrames: 90,
  recommendedDurationFrames: 180,
};
