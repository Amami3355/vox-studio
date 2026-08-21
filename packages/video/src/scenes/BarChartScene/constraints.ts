/**
 * SOFT constraints. Published to the manifest, not just used in validation.
 *
 * An agent that only sees the hard limit of 20 will produce unreadable charts every
 * time. The recommended band is the number that actually shapes its output.
 */
import type { SoftConstraints } from '../../core/types';

export const barChartConstraints: SoftConstraints = {
  data: {
    recommendedMin: 2,
    recommendedMax: 8,
    absoluteMax: 20,
    onExceed:
      'On the full canvas, values ranked below the top 8 are collapsed. A scene that ' +
      'yields into a half frame holds fewer — see `capacityByComposition`, which ' +
      'publishes the figure for every composition and layout — and collapses to that ' +
      "number instead. What collapsing does depends on `valueKind`: an 'amount' " +
      "gathers the rest into a single 'Others' bar carrying their total, a 'share' " +
      'drops them, because adding proportions of different wholes would invent a ' +
      'category.',
    onEmpty: 'Typographic empty state showing the title alone.',
  },
  title: {
    recommendedMax: 40,
    onExceed: 'Title drops one step of the type scale.',
    onExceedCode: 'TITLE_DENSITY',
  },
};

/**
 * Resulting regime, on the full canvas:
 *   0 entries    → empty state (degradation)
 *   1 entry      → renders, plus a warning
 *   2–8          → optimal band
 *   9–20         → automatic aggregation, plus a warning
 *   > 20         → validation error, rejected
 *
 * **The band above is the full canvas's, and for a long time this comment did not say
 * so.** A scene composed into a half holds as few as three, and until `meta.ts` began
 * publishing `capacityByComposition` the only statement an agent could read was the
 * unconditional one — which is how a plan with five cities inside the "optimal band"
 * rendered four bars, one of them a city that does not exist. The upper bound of the band
 * is whatever the scene's composition and layout hold; 8 is only its best case.
 */
