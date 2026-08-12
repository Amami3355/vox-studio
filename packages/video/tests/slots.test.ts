import { describe, expect, it } from 'vitest';
import { overlaps } from '../src/core/slots';
import { ALL_SLOTS } from '../src/core/types';

describe('slot geometry', () => {
  it('treats "full" as overlapping every slot, including itself', () => {
    for (const slot of ALL_SLOTS) {
      expect(overlaps('full', slot), `full vs ${slot}`).toBe(true);
    }
  });

  it('leaves opposite halves disjoint, so a scene and an element can share the frame', () => {
    expect(overlaps('left', 'right')).toBe(false);
    expect(overlaps('top', 'bottom')).toBe(false);
  });

  it('places each corner inside the two halves that contain it, and no others', () => {
    expect(overlaps('cornerBR', 'bottom')).toBe(true);
    expect(overlaps('cornerBR', 'right')).toBe(true);
    expect(overlaps('cornerBR', 'top')).toBe(false);
    expect(overlaps('cornerBR', 'left')).toBe(false);
  });

  it('lets a corner touch the centre without contending with it', () => {
    for (const corner of ['cornerTL', 'cornerTR', 'cornerBL', 'cornerBR'] as const) {
      expect(overlaps('center', corner), `center vs ${corner}`).toBe(false);
    }
  });

  it('keeps the corners disjoint from each other', () => {
    expect(overlaps('cornerTL', 'cornerBR')).toBe(false);
    expect(overlaps('cornerTL', 'cornerTR')).toBe(false);
  });
});
