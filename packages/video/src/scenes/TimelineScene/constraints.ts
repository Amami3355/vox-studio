import type { SoftConstraints } from '../../core/types';

/**
 * The soft band, and the one place this capability publishes how many events a layout
 * carries.
 *
 * **`events.recommendedMax` is computed, not asserted.** `layouts.ts` exports
 * `timelineCapacity()`, which derives the number from the same tokens the component lays
 * out with, and `tests/timeline-capacity.test.ts` recomputes it across every theme and
 * every motion profile and fails on drift. `constraints.ts` told every agent for the whole
 * life of the composed form that `bar_chart` collapsed below the top 8 while it was
 * actually collapsing below the top 3; nothing was lying and nothing was checking. That is
 * the failure this arrangement exists to prevent.
 *
 * **Why here and not in `meta.capacityByComposition`.** The table is the richer home — it
 * is keyed by composition as well as by layout, which is the axis that matters the moment
 * a chronology has to share a frame. It is also unavailable: `catalog/build.ts` requires
 * `seriesField` to name an array of required `{ label: string, value: number }` entries so
 * that the compiler's `aggregateBeyond` can actually run over it, and an event is
 * `{ date, label }` with no value to aggregate. Declaring the table would be a promise
 * `compile/capacity.ts` could not keep — `seriesOf` reads null for these props and the
 * outcome is silence. So the number is published where an agent already reads for a band,
 * and it stays here until a half frame has been drawn and looked at, which is what would
 * make the second axis mean something.
 */
export const timelineConstraints: SoftConstraints = {
  events: {
    /** Below three, a chronology is a pair of dates and reads better as one statement. */
    recommendedMin: 3,
    /** Computed. See `timelineCapacity` in `layouts.ts`, and the test that recomputes it. */
    recommendedMax: 6,
    absoluteMax: 24,
    onExceed:
      'Every event keeps its mark on the axis at its proportional date. Crowded intermediate labels stack onto a second lane and then thin deterministically, leaving the mark without its words; the first, last, focused and annotated events stay labelled on the lane nearest the axis.',
    onEmpty: 'The title remains with a designed “No dated events available” empty state.',
  },
  periods: {
    recommendedMax: 1,
    absoluteMax: 2,
    onExceed:
      'Both periods are drawn in full. Two bands on one axis read as one striped stretch of time unless the periods are far apart.',
  },
  title: {
    recommendedMax: 48,
    onExceed: 'Title drops through the shared type-fitting ladder to preserve the axis.',
    onExceedCode: 'TITLE_DENSITY',
  },
};
