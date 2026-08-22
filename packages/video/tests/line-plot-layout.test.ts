import { describe, expect, it } from 'vitest';
import {
  layoutDateLabels,
  layoutLegendEntries,
  pointIsRevealed,
  wrapTextToWidth,
} from '../src/primitives/linePlotLayout';

const monospace = (text: string): number => Array.from(text).length * 10;

describe('line-plot text geometry', () => {
  it('wraps one unbreakable token without dropping any characters', () => {
    const lines = wrapTextToWidth('WWWWWWWWWW', 40, monospace);

    expect(lines).toEqual(['WWWW', 'WWWW', 'WW']);
    expect(lines.join('')).toBe('WWWWWWWWWW');
    expect(lines.every((line) => monospace(line) <= 40)).toBe(true);
  });

  it('moves a long legend onto measured rows instead of clipping it', () => {
    const layout = layoutLegendEntries([460, 460, 460], 1000, 24);

    expect(layout.rows).toBe(2);
    expect(layout.entries).toEqual([
      { x: 0, row: 0 },
      { x: 484, row: 0 },
      { x: 0, row: 1 },
    ]);
  });

  it('retains adjacent required date labels on non-overlapping lanes', () => {
    const labels = layoutDateLabels({
      candidates: [
        { index: 0, x: 100, width: 180 },
        { index: 1, x: 125, width: 180 },
        { index: 2, x: 150, width: 180 },
        { index: 5, x: 900, width: 180 },
      ],
      required: new Set([0, 1, 2, 5]),
      left: 100,
      right: 900,
      gap: 16,
    });

    expect(labels.map(({ index }) => index)).toEqual([0, 1, 2, 5]);
    expect(new Set(labels.slice(0, 3).map(({ lane }) => lane)).size).toBe(3);
    for (const lane of new Set(labels.map((label) => label.lane))) {
      const inLane = labels
        .filter((label) => label.lane === lane)
        .sort((a, b) => a.start - b.start);
      for (let index = 1; index < inLane.length; index += 1) {
        expect((inLane[index - 1]?.end ?? 0) + 16).toBeLessThanOrEqual(inLane[index]?.start ?? 0);
      }
    }
  });
});

describe('line-plot reveal boundary', () => {
  it('does not reveal the first marker while a driven trend is held', () => {
    expect(pointIsRevealed(0, 0)).toBe(false);
    expect(pointIsRevealed(0, 0.01)).toBe(true);
  });
});
