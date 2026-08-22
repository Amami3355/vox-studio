/**
 * The chronology's arithmetic, asked directly.
 *
 * `primitives/timelineLayout.ts` is the seam this capability was given so that "is this
 * chronology truthful about elapsed time" is a question with an answer, rather than
 * something inferred from a rendered pixel. Everything below is a pure function of dates
 * and numbers — no React, no browser, no theme object.
 *
 * `layouts.ts`'s `timelineCapacity` is here too, and for the reason
 * `tests/composed-capacity.test.ts` gives for `bar_chart`: `constraints.ts` publishes a
 * number to every agent that reads the manifest, and a published number nothing recomputes
 * is `constraints.ts`'s "top 8" again — true of nothing, checked by nobody.
 */
import { describe, expect, it } from 'vitest';
import { slotRect } from '../src/core/slots';
import { parseUtcDate } from '../src/core/time-axis';
import { motionProfiles } from '../src/design/motion';
import { themes } from '../src/design/theme';
import { cameraBounds, cameraInset } from '../src/primitives/CameraRig';
import { frameBoxFor } from '../src/primitives/SlotFrame';
import {
  formatEventDate,
  formatSpan,
  monthsBetween,
  timelineAxis,
  timelineEventRatios,
  timelinePeriodLabelBox,
  timelinePeriodSpans,
  timelineTicks,
} from '../src/primitives/timelineLayout';
import { timelineConstraints } from '../src/scenes/TimelineScene/constraints';
import {
  type TimelineLayoutId,
  timelineCapacity,
  timelineLayoutIds,
} from '../src/scenes/TimelineScene/layouts';

const at = (date: string): number => parseUtcDate(date) as number;

const berlin = [
  { date: '2019-06-18', label: 'The Senate votes a cap' },
  { date: '2020-02-23', label: 'The cap takes effect' },
  { date: '2020-11-23', label: 'Rents are cut' },
  { date: '2021-04-15', label: 'Karlsruhe strikes it down' },
];

describe('the axis a chronology is drawn on', () => {
  it('snaps outward to whole years, so every year in the span is labelled', () => {
    const axis = timelineAxis(berlin, []);

    expect(axis.from).toBe(at('2019-01-01'));
    expect(axis.to).toBe(at('2022-01-01'));
    expect(axis.years).toEqual([2019, 2020, 2021]);
  });

  /**
   * The claim the `spine` layout is *for*. A viewer reading a gap as a duration is only
   * right if the arithmetic makes it one, so the ratios are compared against the day counts
   * rather than against remembered numbers.
   */
  it('places an event in exact proportion to elapsed time', () => {
    const axis = timelineAxis(berlin, []);
    const ratios = timelineEventRatios(berlin, axis);
    const span = axis.to - axis.from;

    for (const [index, event] of berlin.entries()) {
      expect(ratios[index]).toBeCloseTo((at(event.date) - axis.from) / span, 12);
    }
  });

  it('reads a longer silence as a longer gap', () => {
    const axis = timelineAxis(berlin, []);
    const [first, second, third, fourth] = timelineEventRatios(berlin, axis) as [
      number,
      number,
      number,
      number,
    ];

    // 250 days from the vote to the cap, 265 from the cut to Karlsruhe, 274 between.
    expect(second - first).toBeLessThan(third - second);
    expect(fourth - third).toBeLessThan(third - second);
  });

  /**
   * The reason `schema.ts` carries no refusal for a period outside the events: the axis
   * widens to hold it, so the frame stays truthful without anybody being told off.
   */
  it('widens over a period that starts before the first event or ends after the last', () => {
    const axis = timelineAxis(berlin, [
      { label: 'Housing emergency', from: '2018-05-01', to: '2022-09-30' },
    ]);

    expect(axis.years).toEqual([2018, 2019, 2020, 2021, 2022]);
    const [span] = timelinePeriodSpans(
      [{ label: 'Housing emergency', from: '2018-05-01', to: '2022-09-30' }],
      axis,
    );
    expect(span?.fromRatio).toBeGreaterThan(0);
    expect(span?.toRatio).toBeLessThan(1);
  });

  it('draws a one-event chronology inside its own year rather than at a point', () => {
    const axis = timelineAxis([{ date: '2021-07-02', label: 'The ruling' }], []);
    const [only] = timelineEventRatios([{ date: '2021-07-02', label: 'The ruling' }], axis);

    expect(axis.years).toEqual([2021]);
    expect(only).toBeGreaterThan(0.4);
    expect(only).toBeLessThan(0.6);
  });

  it('keeps the last schema-valid year on a finite proportional axis', () => {
    const axis = timelineAxis([{ date: '9999-12-31', label: 'The last authored day' }], []);
    const event = at('9999-12-31');

    expect(axis.ratio(event)).toBeGreaterThan(0.99);
    expect(axis.ratio(event)).toBeLessThan(1);
  });

  it('has an axis for the empty chronology rather than dividing by zero', () => {
    const axis = timelineAxis([], []);

    expect(axis.to).toBeGreaterThan(axis.from);
    expect(Number.isFinite(axis.ratio(axis.from))).toBe(true);
  });
});

describe('year marks', () => {
  it('marks every year when they fit', () => {
    expect(timelineTicks(timelineAxis(berlin, []), 8).map((tick) => tick.year)).toEqual([
      2019, 2020, 2021,
    ]);
  });

  it('thins a long span but keeps the years the chronology opens and closes in', () => {
    const long = [
      { date: '1990-03-01', label: 'First' },
      { date: '2020-03-01', label: 'Last' },
    ];
    const ticks = timelineTicks(timelineAxis(long, []), 5);

    expect(ticks).toHaveLength(5);
    expect(ticks[0]?.year).toBe(1990);
    expect(ticks.at(-1)?.year).toBe(2020);
  });

  it('puts each mark where its January actually falls', () => {
    const axis = timelineAxis(berlin, []);
    const ticks = timelineTicks(axis, 8);

    expect(ticks.map((tick) => tick.ratio)).toEqual(
      [0, 1 / 3, 2 / 3].map((r) => expect.closeTo(r)),
    );
  });
});

describe('a period is a duration, not a pair of dates', () => {
  it('counts whole calendar months, so the band letters what a reader would say', () => {
    expect(monthsBetween(at('2020-02-23'), at('2021-04-15'))).toBe(13);
    expect(monthsBetween(at('2020-02-23'), at('2021-04-23'))).toBe(14);
  });

  it('words a duration in the coarsest unit that still says something', () => {
    expect(formatSpan(at('2021-01-01'), at('2021-01-02'))).toBe('1 day');
    expect(formatSpan(at('2021-01-01'), at('2021-01-20'))).toBe('19 days');
    expect(formatSpan(at('2021-01-01'), at('2021-02-01'))).toBe('1 month');
    expect(formatSpan(at('2020-02-23'), at('2021-04-23'))).toBe('14 months');
    expect(formatSpan(at('2019-01-01'), at('2024-01-01'))).toBe('5 years');
  });

  it('never reports a negative span, whatever a caller hands it', () => {
    expect(monthsBetween(at('2021-04-15'), at('2020-02-23'))).toBe(0);
  });

  it('keeps a label inside even a very short period band', () => {
    const axis = timelineAxis(berlin, []);
    const [span] = timelinePeriodSpans(
      [{ label: 'A long name for a short period', from: '2020-02-23', to: '2020-03-01' }],
      axis,
    );
    if (!span) throw new Error('Expected one period span.');

    const axisWidth = 1200;
    const inset = 24;
    const labelBox = timelinePeriodLabelBox(span, axisWidth, inset);
    const labelLeft = span.fromRatio * axisWidth + labelBox.leftInset;
    const labelRight = labelLeft + labelBox.width;

    expect(labelLeft).toBeGreaterThanOrEqual(span.fromRatio * axisWidth);
    expect(labelRight).toBeLessThanOrEqual(span.toRatio * axisWidth);
  });
});

describe('dates are worded without a locale, so a render reproduces anywhere', () => {
  it('sets a date the way the frame prints it', () => {
    expect(formatEventDate(at('2019-06-18'))).toBe('18 Jun 2019');
    expect(formatEventDate(at('2021-04-05'))).toBe('5 Apr 2021');
  });
});

/**
 * Every capacity a real render could produce for one layout on the full canvas — every
 * theme by every motion profile, because the camera allowance belongs to the profile and
 * the density a box earns belongs to both.
 */
const computed = (layout: TimelineLayoutId): number[] =>
  Object.values(themes).flatMap((theme) =>
    Object.values(motionProfiles).map((profile) =>
      timelineCapacity({
        box: frameBoxFor(slotRect('full'), {
          margin: theme.grid.margin,
          camera: cameraInset(cameraBounds(profile.camera)),
        }),
        layout,
        theme,
      }),
    ),
  );

describe('timeline publishes what its frame actually holds', () => {
  it.each(timelineLayoutIds)('publishes the guaranteed capacity of %s', (layout) => {
    expect(timelineConstraints.events?.recommendedMax).toBe(Math.min(...computed(layout)));
  });

  it.each(timelineLayoutIds)('never promises more than %s can draw', (layout) => {
    const declared = timelineConstraints.events?.recommendedMax ?? 0;
    for (const actual of computed(layout)) expect(actual).toBeGreaterThanOrEqual(declared);
  });

  /**
   * The band is a floor and not a forecast, so it must also be a band a chronology can
   * live inside: a recommended maximum below the recommended minimum would publish an empty
   * range and tell every agent that no chronology is the right size.
   */
  it('publishes a band a chronology can actually sit in', () => {
    const {
      recommendedMin = 0,
      recommendedMax = 0,
      absoluteMax = 0,
    } = timelineConstraints.events ?? {};

    expect(recommendedMin).toBeGreaterThan(0);
    expect(recommendedMax).toBeGreaterThanOrEqual(recommendedMin);
    expect(absoluteMax).toBeGreaterThan(recommendedMax);
  });
});
