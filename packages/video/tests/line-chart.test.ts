import { describe, expect, it } from 'vitest';
import { validateScene, validateVideoPlan } from '../src/catalog/validate';
import { compile } from '../src/compile';
import { resolveEvents } from '../src/core/events';
import { parseUtcDate, utcTimeAxis } from '../src/core/time-axis';
import { trendAxis } from '../src/core/trend-axis';
import type { SceneInstance, TimedBeat } from '../src/core/types';
import { lineChartSchema } from '../src/scenes/LineChartScene';
import { initialLineChartState, lineChartReducer } from '../src/scenes/LineChartScene/state';

const canonicalProps = {
  title: 'Monthly demand',
  points: [
    { date: '2025-01-01', label: 'Jan' },
    { date: '2025-03-01', label: 'Mar' },
    { date: '2025-06-01', label: 'Jun' },
  ],
  series: [{ label: 'Demand', values: [12, 18, 31] }],
  unit: 'k',
};

const scene = (overrides: Partial<SceneInstance> = {}): SceneInstance => ({
  id: 'trend',
  component: 'line_chart',
  layout: 'standard',
  motionProfile: 'editorialStatic',
  spansBeats: ['b1'],
  props: canonicalProps,
  events: [],
  ...overrides,
});

describe('line_chart schema and validation', () => {
  it('accepts canonical and aligned comparison inputs with defaults', () => {
    const canonical = lineChartSchema.parse(canonicalProps);
    const comparison = lineChartSchema.parse({
      ...canonicalProps,
      series: [...canonicalProps.series, { label: 'Capacity', values: [20, 24, 35] }],
    });

    expect(canonical.baseline).toBe('zero');
    expect(comparison.series).toHaveLength(2);
  });

  it('keeps four-digit years below 100 in their authored century', () => {
    const year25 = parseUtcDate('0025-01-01');
    const year99 = parseUtcDate('0099-12-31');
    const year100 = parseUtcDate('0100-01-01');

    expect(year25).not.toBeNull();
    expect(new Date(year25 as number).getUTCFullYear()).toBe(25);
    expect(year99).not.toBeNull();
    expect(new Date(year99 as number).getUTCFullYear()).toBe(99);
    expect((year99 as number) < (year100 as number)).toBe(true);
  });

  it.each([
    ['unknown prop', { ...canonicalProps, colour: 'red' }],
    ['bad format', { ...canonicalProps, points: [{ date: '01/01/2025', label: 'Jan' }] }],
    ['impossible date', { ...canonicalProps, points: [{ date: '2025-02-30', label: 'Feb' }] }],
    [
      'descending dates',
      {
        ...canonicalProps,
        points: [
          { date: '2025-03-01', label: 'Mar' },
          { date: '2025-01-01', label: 'Jan' },
        ],
        series: [{ label: 'Demand', values: [18, 12] }],
      },
    ],
    ['misaligned values', { ...canonicalProps, series: [{ label: 'Demand', values: [12, 18] }] }],
    ['half empty points', { ...canonicalProps, points: [] }],
    ['half empty series', { ...canonicalProps, series: [] }],
    ['bad baseline', { ...canonicalProps, baseline: 'cropped' }],
    ['bad focus series', { ...canonicalProps, focus: { series: 'Missing' } }],
    ['bad focus point', { ...canonicalProps, focus: { series: 'Demand', label: 'Missing' } }],
  ])('rejects %s', (_case, props) => {
    expect(lineChartSchema.safeParse(props).success).toBe(false);
  });

  it('rejects duplicate dates, point labels and series labels', () => {
    const duplicate = lineChartSchema.safeParse({
      ...canonicalProps,
      points: [
        { date: '2025-01-01', label: 'Same' },
        { date: '2025-01-01', label: 'Same' },
      ],
      series: [
        { label: 'Same series', values: [1, 2] },
        { label: 'Same series', values: [2, 3] },
      ],
    });

    expect(duplicate.success).toBe(false);
    if (!duplicate.success) {
      const messages = duplicate.error.issues.map((issue) => issue.message).join(' · ');
      expect(messages).toContain('Duplicate date');
      expect(messages).toContain('Duplicate point label');
      expect(messages).toContain('Duplicate series label');
      expect(duplicate.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['points', 1, 'date'] }),
          expect.objectContaining({ path: ['points', 1, 'label'] }),
          expect.objectContaining({ path: ['series', 1, 'label'] }),
        ]),
      );
    }
  });

  it('rejects non-finite values and both hard ceilings', () => {
    expect(
      lineChartSchema.safeParse({
        ...canonicalProps,
        series: [{ label: 'Demand', values: [12, Number.POSITIVE_INFINITY, 31] }],
      }).success,
    ).toBe(false);
    expect(
      lineChartSchema.safeParse({
        ...canonicalProps,
        points: Array.from({ length: 37 }, (_, index) => ({
          date: `${2020 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`,
          label: `P${index}`,
        })),
        series: [{ label: 'Demand', values: Array.from({ length: 37 }, (_, index) => index) }],
      }).success,
    ).toBe(false);
    expect(
      lineChartSchema.safeParse({
        ...canonicalProps,
        series: Array.from({ length: 4 }, (_, index) => ({
          label: `Series ${index}`,
          values: [12, 18, 31],
        })),
      }).success,
    ).toBe(false);
  });

  it('accepts only the canonical empty shape and emits its soft warning', () => {
    const report = validateScene(
      scene({ props: { title: 'No trend', points: [], series: [], unit: '' } }),
    );

    expect(report.ok).toBe(true);
    expect(report.warnings).toContainEqual(
      expect.objectContaining({ field: 'points', severity: 'info' }),
    );
  });

  it('warns without rewriting 17 points and a third series', () => {
    const points = Array.from({ length: 17 }, (_, index) => ({
      date: `2025-${String(index + 1).padStart(2, '0')}-01`,
      label: `P${index}`,
    }));
    // Keep the dates real while crossing the recommended point ceiling.
    const realPoints = points.map((point, index) => ({
      ...point,
      date: `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`,
    }));
    const report = validateScene(
      scene({
        props: {
          ...canonicalProps,
          points: realPoints,
          series: Array.from({ length: 3 }, (_, seriesIndex) => ({
            label: `Series ${seriesIndex}`,
            values: realPoints.map((_, index) => index + seriesIndex),
          })),
        },
      }),
    );

    expect(report.ok).toBe(true);
    expect(report.warnings).toContainEqual(
      expect.objectContaining({ field: 'points', code: 'SOFT_LIMIT_EXCEEDED' }),
    );
    expect(report.warnings).toContainEqual(
      expect.objectContaining({ field: 'series', code: 'SOFT_LIMIT_EXCEEDED' }),
    );
  });

  /**
   * The other end of the same published band, which the test above was named for and did not
   * exercise: `constraints.ts` states `recommendedMin: 3` for `points`, and a single
   * observation is a trend the shot cannot show a trend in.
   *
   * It must warn and still render. A one-point series is a legitimate degraded shape — the
   * schema publishes no `.min()`, which is a promise the empty and near-empty states stay
   * reachable — so a rejection here would be the hard/soft regimes bleeding into each other.
   */
  it('warns below the recommended point floor without rejecting the shape', () => {
    const report = validateScene(
      scene({
        props: {
          ...canonicalProps,
          points: [{ date: '2025-01-01', label: 'P0' }],
          series: [{ label: 'Series 0', values: [1] }],
        },
      }),
    );

    expect(report.ok).toBe(true);
    expect(report.warnings).toContainEqual(
      expect.objectContaining({ field: 'points', code: 'SOFT_LIMIT_EXCEEDED' }),
    );
  });
});

describe('line_chart referential actions and reducer', () => {
  it.each([
    ['focusSeries', { series: 'Missing' }, 'series'],
    ['focusPoint', { series: 'Demand', label: 'Missing' }, 'label'],
    ['annotatePoint', { series: 'Missing', label: 'Jun', text: 'No target' }, 'series'],
  ])('rejects %s against an unknown %s target', (action, payload, field) => {
    const report = validateScene(scene({ events: [{ at: 'b1.start', action, payload }] }));
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_PAYLOAD', field: `events[0].payload.${field}` }),
    );
  });

  /**
   * Every verb that targets the plot, not just the one that was easiest to write.
   *
   * The spec asks for "each plot-targeting action before and after an authored reveal", and
   * the rule is about the *plot* rather than about any one action: a gesture at something the
   * frame has not drawn yet points at nothing, whichever gesture it is. Checking one of the
   * three left the other two resting on the reducer being written the same way, which is the
   * kind of assumption this suite exists to stop making.
   */
  it.each([
    ['focusPoint', { series: 'Demand', label: 'Jun' }],
    ['focusSeries', { series: 'Demand' }],
    ['annotatePoint', { series: 'Demand', label: 'Jun', text: 'A durable note' }],
  ])('rejects %s written before a declared reveal and accepts it after', (action, payload) => {
    const before = validateScene(
      scene({
        events: [
          { at: 'b1.start', action, payload },
          { at: 'b1.end', action: 'revealTrend' },
        ],
      }),
    );
    const after = validateScene(
      scene({
        events: [
          { at: 'b1.start', action: 'revealTrend' },
          { at: 'b1.end', action, payload },
        ],
      }),
    );

    expect(before.errors).toContainEqual(
      expect.objectContaining({ code: 'EVENT_BEFORE_ELEMENT_REVEALED' }),
    );
    expect(after.ok).toBe(true);
  });

  it('auto-reveals without a reveal event and replaces focus and annotation deterministically', () => {
    const events = [
      { frame: 20, action: 'focusPoint', payload: { series: 'Demand', label: 'Mar' } },
      { frame: 40, action: 'focusSeries', payload: { series: 'Demand' } },
      {
        frame: 50,
        action: 'annotatePoint',
        payload: { series: 'Demand', label: 'Mar', text: 'First' },
      },
      {
        frame: 60,
        action: 'annotatePoint',
        payload: { series: 'Demand', label: 'Jun', text: 'Latest' },
      },
    ];
    const initial = initialLineChartState(events, undefined);
    const resolved = resolveEvents(events, 60, initial, lineChartReducer);

    expect(initial.revealFrame).toBe(0);
    expect(resolved.focus.value).toEqual({ series: 'Demand', since: 40 });
    expect(resolved.annotation.value).toEqual({
      series: 'Demand',
      label: 'Jun',
      text: 'Latest',
      since: 60,
    });
  });
});

describe('line chart axes', () => {
  it.each([
    [[5, 12, 20], 'zero'],
    [[-20, -8, -4], 'zero'],
    [[-8, 0, 14], 'zero'],
    [[7, 7, 7], 'extent'],
    [[0, 0, 0], 'zero'],
  ] as const)('returns a stable axis for %j with %s baseline', (values, baseline) => {
    const axis = trendAxis([...values], baseline);
    expect(axis.span).toBeGreaterThan(0);
    expect(axis.ticks.every(Number.isFinite)).toBe(true);
    expect(values.every((value) => axis.ratio(value) >= 0 && axis.ratio(value) <= 1)).toBe(true);
  });

  it('keeps zero in a zero baseline and exposes narrow variation with extent', () => {
    const zero = trendAxis([97, 100, 103], 'zero');
    const extent = trendAxis([97, 100, 103], 'extent');
    expect(zero.min).toBeLessThanOrEqual(0);
    expect(extent.min).toBeGreaterThan(0);
    expect(extent.ratio(103) - extent.ratio(97)).toBeGreaterThan(zero.ratio(103) - zero.ratio(97));
  });

  /**
   * Where a mixed-sign series puts its zero, which is what the rendered frame is named for.
   *
   * `scale.test.ts` asserts `zeroRatio` for `ValueAxis`, the zero-based axis a bar uses. A
   * trend may measure from its own extent, and this is the case that decides whether the zero
   * rule lands inside the plot at all: values either side of zero must put it strictly
   * between the two edges, and every value must fall on the side its sign says.
   */
  it('places zero strictly inside the plot when a series crosses it', () => {
    const axis = trendAxis([-40, -10, 15, 60], 'extent');

    expect(axis.zeroRatio).toBeGreaterThan(0);
    expect(axis.zeroRatio).toBeLessThan(1);
    expect(axis.ratio(-40)).toBeLessThan(axis.zeroRatio);
    expect(axis.ratio(60)).toBeGreaterThan(axis.zeroRatio);
    expect(axis.ratio(0)).toBeCloseTo(axis.zeroRatio);
  });

  it('maps irregular UTC intervals proportionally and retains endpoint ticks', () => {
    const axis = utcTimeAxis(['2024-01-01', '2024-02-29', '2024-07-01'], 2);
    expect(axis.positions[1]).toBeGreaterThan(0);
    expect(axis.positions[1]).toBeLessThan(0.5);
    expect(axis.tickIndices).toEqual([0, 2]);
    expect(axis.positions).toEqual(
      utcTimeAxis(['2024-01-01', '2024-02-29', '2024-07-01'], 2).positions,
    );
  });

  it('refuses invalid and non-increasing UTC dates instead of sorting them', () => {
    expect(() => utcTimeAxis(['2025-02-30'])).toThrow(/Invalid UTC/);
    expect(() => utcTimeAxis(['2025-03-01', '2025-01-01'])).toThrow(/strictly increasing/);
  });

  /**
   * The spec asks for "stable positions across time zones", and comparing the axis to itself
   * in one process does not ask that — the whole point of the claim is that a machine in
   * Auckland and a machine in Los Angeles agree.
   *
   * `TZ` is read by the runtime when it builds a `Date`, so this sets it around the call. The
   * dates chosen straddle a UTC day boundary at both extremes: `Pacific/Kiritimati` is UTC+14
   * and `Pacific/Midway` is UTC-11, so a parser that reached for local time would land these
   * on different calendar days and move the ticks.
   */
  it('places the same dates identically whatever the machine time zone is', () => {
    const dates = ['2024-01-01', '2024-02-29', '2024-07-01', '2024-12-31'];
    const original = process.env.TZ;

    const under = (zone: string) => {
      process.env.TZ = zone;
      return {
        // Proof the environment actually moved. Without this the two readings below could
        // agree because nothing changed, and the test would pass by doing nothing.
        localHour: new Date('2024-07-01T00:00:00Z').getHours(),
        positions: utcTimeAxis(dates, 3).positions,
        ticks: utcTimeAxis(dates, 3).tickIndices,
      };
    };

    try {
      const east = under('Pacific/Kiritimati');
      const west = under('Pacific/Midway');

      expect(east.localHour).not.toBe(west.localHour);
      expect(east.positions).toEqual(west.positions);
      expect(east.ticks).toEqual(west.ticks);
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('line_chart through the generic compiler', () => {
  it('resolves a deictic point focus against a real take without a compiler branch', () => {
    const beats: TimedBeat[] = [
      {
        id: 'b1',
        text: 'Demand rose sharply by Jun.',
        fromMs: 0,
        toMs: 5000,
        words: ['Demand', 'rose', 'sharply', 'by', 'Jun'].map((text, index) => ({
          text,
          fromMs: index * 1000,
        })),
      },
    ];
    const plan = {
      beats: beats.map(({ id, text }) => ({ id, text })),
      sections: [
        {
          id: 's1',
          spansBeats: ['b1'],
          scenes: [
            scene({
              events: [
                {
                  at: 'b1.word:Jun',
                  action: 'focusPoint',
                  payload: { series: 'Demand', label: 'Jun' },
                },
              ],
            }),
          ],
        },
      ],
    };

    expect(validateVideoPlan(plan).ok).toBe(true);
    const result = compile({ plan, beats });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.sections[0]?.scenes[0]?.events[0]?.frame).toBe(120);
    }
  });

  /**
   * The reveal's own anchor, which the test above does not exercise.
   *
   * The spec asks that "compiler tests resolve reveal and focus anchors against a real Take",
   * and the two are not the same journey: a focus carries `deicticFields` and is held to
   * landing on the word it names, while `revealTrend` carries no payload at all and is
   * anchored by the plan's sense of when the trend should arrive. A capability whose reveal
   * silently failed to resolve would draw a settled chart from frame zero and pass every
   * assertion above.
   *
   * Both in one plan, and in order, because `EVENTS_OUT_OF_ORDER` is binding (ADR-0011): the
   * frames the compiler produces have to come back in the order the plan wrote them.
   */
  it('resolves a reveal and a focus in one plan, in the order they were written', () => {
    const beats: TimedBeat[] = [
      {
        id: 'b1',
        text: 'Demand rose sharply by Jun.',
        fromMs: 0,
        toMs: 5000,
        words: ['Demand', 'rose', 'sharply', 'by', 'Jun'].map((text, index) => ({
          text,
          fromMs: index * 1000,
        })),
      },
    ];
    const plan = {
      beats: beats.map(({ id, text }) => ({ id, text })),
      sections: [
        {
          id: 's1',
          spansBeats: ['b1'],
          scenes: [
            scene({
              events: [
                { at: 'b1.word:rose', action: 'revealTrend' },
                {
                  at: 'b1.word:Jun',
                  action: 'focusPoint',
                  payload: { series: 'Demand', label: 'Jun' },
                },
              ],
            }),
          ],
        },
      ],
    };

    expect(validateVideoPlan(plan).ok).toBe(true);
    const result = compile({ plan, beats });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const events = result.document.sections[0]?.scenes[0]?.events ?? [];
    expect(events.map((event) => event.action)).toEqual(['revealTrend', 'focusPoint']);
    expect(events[0]?.frame).toBe(30);
    expect(events[1]?.frame).toBe(120);
  });
});
