/**
 * The rule that decides the top of a bar chart.
 *
 * What is worth pinning here is the *decision*, not `d3-scale`'s arithmetic, which is not
 * ours to test: that zero is always in the domain, that the extreme bar keeps its label
 * room after the rounding, and that the rounding only ever moves an end outward. The
 * third one is the whole reason the flat 14% pad could be kept rather than replaced — if
 * `nice` could pull an end inward, it would silently eat the headroom that stops a value
 * label colliding with the headline, and nothing in a rendered frame would look wrong
 * enough to notice.
 */
import { describe, expect, it } from 'vitest';
import { AXIS_HEADROOM, valueAxis } from '../src/core/scale';

describe('valueAxis', () => {
  it('rounds the top of the plot to a number a reader can hold', () => {
    // 5 743 + 14% is 6 547, which rounds out to 7 000. Not 8 000: the domain is rounded
    // more finely than the gridlines are drawn, or the tallest bar loses height for
    // nothing. That is the one thing this number is protecting.
    const axis = valueAxis([5743, 3120, 980]);

    expect(axis.min).toBe(0);
    expect(axis.max).toBe(7000);
  });

  it('keeps the headroom the value label needs, after rounding', () => {
    const values = [5743, 3120, 980];
    const axis = valueAxis(values);
    const tallest = Math.max(...values);

    // The bar must stop short of the plot edge, by at least the pad it was given.
    expect(axis.ratio(tallest)).toBeLessThanOrEqual(1 - AXIS_HEADROOM * 0.9);
    expect(axis.max).toBeGreaterThanOrEqual(tallest * (1 + AXIS_HEADROOM));
  });

  it('never moves an end inward, so no bar can overflow its plot', () => {
    for (const top of [1, 7, 42, 99, 100, 512, 5743, 88_401]) {
      const axis = valueAxis([top, top / 3]);
      expect(axis.max).toBeGreaterThan(top);
      expect(axis.ratio(top)).toBeLessThan(1);
    }
  });

  it('always includes zero, so a bar length is proportional to its value', () => {
    const axis = valueAxis([812, 799, 803]);

    expect(axis.min).toBe(0);
    expect(axis.zeroRatio).toBe(0);
  });

  it('extends below zero only when the data goes there, and finds the zero line', () => {
    const axis = valueAxis([120, -40, 60]);

    expect(axis.min).toBeLessThan(-40);
    expect(axis.max).toBeGreaterThan(120);
    expect(axis.zeroRatio).toBeGreaterThan(0);
    expect(axis.zeroRatio).toBeLessThan(1);
    expect(axis.ratio(0)).toBeCloseTo(axis.zeroRatio);
  });

  it('gives gridline values strictly inside the plot', () => {
    const axis = valueAxis([5743, 3120, 980]);

    expect(axis.ticks.length).toBeGreaterThan(1);
    for (const tick of axis.ticks) {
      expect(tick).toBeGreaterThan(axis.min);
      expect(tick).toBeLessThan(axis.max);
    }
    // Round, not arbitrary: every tick is a whole multiple of the step between them.
    const step = (axis.ticks[1] as number) - (axis.ticks[0] as number);
    for (const tick of axis.ticks) expect(tick % step).toBeCloseTo(0);
  });

  it('survives a flat series without dividing by zero', () => {
    const axis = valueAxis([0, 0, 0]);

    expect(axis.span).toBeGreaterThan(0);
    expect(Number.isFinite(axis.ratio(0))).toBe(true);
  });
});
