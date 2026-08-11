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
    onExceed: "Values ranked below the top 8 are collapsed into a single 'Others' bar.",
    onEmpty: 'Typographic empty state showing the title alone.',
  },
  title: {
    recommendedMax: 40,
    onExceed: 'Title drops one step of the type scale.',
  },
};

/**
 * Resulting regime:
 *   0 entries    → empty state (degradation)
 *   1 entry      → renders, plus a warning
 *   2–8          → optimal band
 *   9–20         → automatic aggregation, plus a warning
 *   > 20         → validation error, rejected
 */
