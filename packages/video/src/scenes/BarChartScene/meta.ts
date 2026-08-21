import type { SceneMeta } from '../../core/types';

/**
 * Selection metadata. This is what the agent reads to *choose* the scene, before it
 * ever reads the schema.
 *
 * `avoidWhen` entries redirect explicitly. One line of redirection is worth three
 * paragraphs of description.
 *
 * On `supportedCompositions` — the halves are a claim that a layout exists for them, and
 * for most of this file's life they were not. The list was written in the scaffold commit
 * and never revisited; `tests/render/safe-area.test.ts` eventually rendered
 * `example-long-ranking` into a half and found the ranking running off the bottom of the
 * canvas, which is ADR-0003's "squeezed, silently and legally" in the flesh. The claim is
 * now paid for: `Component.tsx` reads the shape of the box it was given and draws a
 * composed form for a portrait one. Do not add an entry here without drawing the frame and
 * looking at it — the suite will render whatever this list says, but only a person can say
 * whether the result is worth watching.
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
  /**
   * Measured, not estimated — `tests/render/composed-capacity.test.ts` recomputes every
   * one of these from `capacity.ts` and fails on drift.
   *
   * The horizontal row is the entry worth reading twice: a half frame that holds three
   * vertical columns holds eight horizontal rows, because a column is bounded by the width
   * its name needs and a row by the height of the box. An agent whose chart has to share a
   * section with a persistent element has a real repair here that costs it no data at all,
   * and until this table existed there was no way to publish it.
   */
  capacityByComposition: {
    full: { standard: 8, horizontal: 8, withCallout: 8 },
    left: { standard: 3, horizontal: 8, withCallout: 3 },
    right: { standard: 3, horizontal: 8, withCallout: 3 },
  },
  seriesField: 'data',
  minDurationFrames: 90,
  recommendedDurationFrames: 210,
};
