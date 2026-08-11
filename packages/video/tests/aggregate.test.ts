import { describe, expect, it } from 'vitest';
import { aggregateBeyond } from '../src/core/aggregate';

const series = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ label: `L${i}`, value: n - i }));

describe('aggregateBeyond', () => {
  it('leaves a series inside the soft limit untouched', () => {
    const data = series(6);
    expect(aggregateBeyond(data, 8)).toBe(data);
  });

  it('collapses the weakest values into a single bucket', () => {
    const result = aggregateBeyond(series(12), 8);
    expect(result).toHaveLength(9);
    expect(result.at(-1)).toEqual({ label: 'Others', value: 4 + 3 + 2 + 1 });
  });

  it('preserves the original order of survivors, so a chronology is not rewritten', () => {
    const data = [
      { label: '2020', value: 3 },
      { label: '2021', value: 90 },
      { label: '2022', value: 5 },
      { label: '2023', value: 80 },
    ];
    const result = aggregateBeyond(data, 2);
    expect(result.map((d) => d.label)).toEqual(['2021', '2023', 'Others']);
    expect(result.at(-1)?.value).toBe(8);
  });

  it('ranks by magnitude, so a large negative value survives', () => {
    const data = [
      { label: 'a', value: 1 },
      { label: 'b', value: -50 },
      { label: 'c', value: 2 },
    ];
    expect(aggregateBeyond(data, 1).map((d) => d.label)).toEqual(['b', 'Others']);
  });

  it('handles an empty series', () => {
    expect(aggregateBeyond([], 8)).toEqual([]);
  });
});
