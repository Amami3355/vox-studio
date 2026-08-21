import { describe, expect, it } from 'vitest';
import { aggregateBeyond } from '../src/core/aggregate';

const series = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ label: `L${i}`, value: n - i }));

describe('aggregateBeyond', () => {
  it('leaves a series inside the soft limit untouched', () => {
    const data = series(6);
    const { series: kept, collapsed } = aggregateBeyond(data, 8);
    expect(kept).toBe(data);
    expect(collapsed).toEqual([]);
  });

  it('collapses the weakest values into a single bucket', () => {
    const { series: kept } = aggregateBeyond(series(12), 8);
    expect(kept).toHaveLength(9);
    expect(kept.at(-1)).toEqual({ label: 'Others', value: 4 + 3 + 2 + 1 });
  });

  it('reports what it collapsed, so a caller can say whose name is now absent', () => {
    const { collapsed } = aggregateBeyond(series(12), 8);
    expect(collapsed.map((d) => d.label)).toEqual(['L8', 'L9', 'L10', 'L11']);
  });

  it('preserves the original order of survivors, so a chronology is not rewritten', () => {
    const data = [
      { label: '2020', value: 3 },
      { label: '2021', value: 90 },
      { label: '2022', value: 5 },
      { label: '2023', value: 80 },
    ];
    const { series: kept } = aggregateBeyond(data, 2);
    expect(kept.map((d) => d.label)).toEqual(['2021', '2023', 'Others']);
    expect(kept.at(-1)?.value).toBe(8);
  });

  it('ranks by magnitude, so a large negative value survives', () => {
    const data = [
      { label: 'a', value: 1 },
      { label: 'b', value: -50 },
      { label: 'c', value: 2 },
    ];
    const { series: kept } = aggregateBeyond(data, 1);
    expect(kept.map((d) => d.label)).toEqual(['b', 'Others']);
  });

  it('handles an empty series', () => {
    expect(aggregateBeyond([], 8)).toEqual({ series: [], collapsed: [] });
  });

  /**
   * The two directions of the same decision, and the reason this function took a mode at
   * all. `2026-08-21`'s render drew a chart titled "Share of income spent on rent" whose
   * tallest bar was `OTHERS 60` — Berlin's 27 % plus Paris's 33 %, a city that does not
   * exist standing next to a real one.
   */
  describe('valueKind', () => {
    const cities = [
      { label: 'Berlin', value: 27 },
      { label: 'Paris', value: 33 },
      { label: 'London', value: 47 },
    ];

    it('sums an amount, because two counts of a thing are a count of that thing', () => {
      const { series: kept } = aggregateBeyond(cities, 1, { valueKind: 'amount' });
      expect(kept).toEqual([
        { label: 'London', value: 47 },
        { label: 'Others', value: 60 },
      ]);
    });

    it('drops a share, because two shares of different wholes add up to nothing', () => {
      const { series: kept, collapsed } = aggregateBeyond(cities, 1, { valueKind: 'share' });
      expect(kept).toEqual([{ label: 'London', value: 47 }]);
      expect(collapsed.map((d) => d.label)).toEqual(['Berlin', 'Paris']);
    });

    it('defaults to summing, so every series that aggregated before still does', () => {
      expect(aggregateBeyond(cities, 1).series).toEqual(
        aggregateBeyond(cities, 1, { valueKind: 'amount' }).series,
      );
    });

    it('leaves a share inside its capacity alone rather than emptying it', () => {
      const { series: kept, collapsed } = aggregateBeyond(cities, 3, { valueKind: 'share' });
      expect(kept).toBe(cities);
      expect(collapsed).toEqual([]);
    });
  });
});
