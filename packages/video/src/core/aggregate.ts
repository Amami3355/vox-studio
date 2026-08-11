/**
 * Soft-limit degradation for series data.
 *
 * A hard schema limit rejects; a soft limit degrades. Beyond the recommended count the
 * weakest values collapse into a single bucket, keeping the chart readable instead of
 * drawing twenty unreadable slivers.
 */

export type Series = { label: string; value: number };

export const aggregateBeyond = (data: Series[], keep: number, bucketLabel = 'Others'): Series[] => {
  if (data.length <= keep) return data;

  // Rank by magnitude to decide who survives, but emit survivors in their original
  // order: reordering a chronological series would silently rewrite its meaning.
  const ranked = data
    .map((d, index) => ({ ...d, index }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const survivors = new Set(ranked.slice(0, keep).map((d) => d.index));
  const rest = ranked.slice(keep);

  const kept = data.filter((_, i) => survivors.has(i));
  const bucket = rest.reduce((sum, d) => sum + d.value, 0);

  return [...kept, { label: bucketLabel, value: bucket }];
};
