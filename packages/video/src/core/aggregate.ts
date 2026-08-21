/**
 * Soft-limit degradation for series data.
 *
 * A hard schema limit rejects; a soft limit degrades. Beyond the recommended count the
 * weakest values collapse, keeping the chart readable instead of drawing twenty
 * unreadable slivers.
 *
 * **What "collapse" means depends on what the numbers are**, and getting that wrong is
 * not a rounding error. Summing two counts gives a count. Summing two *shares* gives a
 * quantity that measures nothing: on 2026-08-21 a chart titled "Share of income spent on
 * rent" drew `OTHERS 60` — Berlin's 27 % plus Paris's 33 % — as its tallest bar, standing
 * next to London while the narration named London as the extreme. Contained, legible,
 * inside every safe area, and false.
 *
 * So the mode is the caller's to state, and `collapsed` is returned rather than discarded:
 * whoever asked for the aggregation is the only one who can tell whether the names that
 * just left the frame are still being spoken about.
 */

/**
 * What a value *is*, which decides what happens when several of them are collapsed.
 *
 * `amount` — a count, a sum of money, a quantity. Additive: the bucket carries the total.
 * `share` — a percentage, a proportion, a rate. Not additive across categories, because
 * each one is a share of its own whole. The bucket would be a fiction, so there is none.
 */
export type ValueKind = 'amount' | 'share';

export type Series = { label: string; value: number };

export type Aggregation = {
  /** What the chart draws. */
  series: Series[];
  /**
   * What it no longer draws, in the order the caller supplied. Empty when nothing was
   * collapsed. This is what lets a caller notice that the narration still names one.
   */
  collapsed: Series[];
};

export const aggregateBeyond = (
  data: Series[],
  keep: number,
  {
    valueKind = 'amount',
    bucketLabel = 'Others',
  }: { valueKind?: ValueKind; bucketLabel?: string } = {},
): Aggregation => {
  if (data.length <= keep) return { series: data, collapsed: [] };

  // Rank by magnitude to decide who survives, but emit survivors in their original
  // order: reordering a chronological series would silently rewrite its meaning.
  const ranked = data
    .map((d, index) => ({ ...d, index }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const survivors = new Set(ranked.slice(0, keep).map((d) => d.index));

  const kept = data.filter((_, i) => survivors.has(i));
  const collapsed = data.filter((_, i) => !survivors.has(i));

  if (valueKind === 'share') return { series: kept, collapsed };

  const bucket = collapsed.reduce((sum, d) => sum + d.value, 0);
  return { series: [...kept, { label: bucketLabel, value: bucket }], collapsed };
};
