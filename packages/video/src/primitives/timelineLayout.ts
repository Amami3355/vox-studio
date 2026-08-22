/**
 * The arithmetic a chronology is drawn from, with no React, no browser and no theme in it.
 *
 * The split `titleFit.ts` states in its own header: the measurement is a dependency of the
 * decision rather than part of it, which is what lets a test hand it a ruler that lies in a
 * known way. Everything here is a pure function of dates and numbers, so whether a
 * chronology is readable can be asked directly instead of inferred from a rendered pixel.
 *
 * **What is reused rather than reinvented.** `layoutDateLabels` in `linePlotLayout.ts`
 * already packs colliding labels onto non-overlapping lanes while keeping a required set,
 * which is exactly the crowding a proportional chronology meets; `timeline` imports it
 * rather than copying it. That leaves the module's name slightly narrower than its
 * contents, which is cheaper and more reversible than a rename — but if a third caller
 * appears, the right move is to rename it to something dated-axis-shaped rather than to
 * grow a second copy.
 */
import {
  formatUtcDate,
  formatUtcSpan,
  parseUtcDate,
  utcMidnight,
  utcMonthsBetween,
  utcYearOf,
} from '../core/time-axis';

export type DatedEvent = { date: string; label: string; track?: string };
export type DatedPeriod = { label: string; from: string; to: string };

/**
 * The axis a chronology is drawn on: whole years, and the ratio of any instant along them.
 *
 * **Snapped to year boundaries, and that is the decision this type exists to record.** The
 * alternative was to run the axis from the first event to the last, which puts both of them
 * hard against the ends of the frame and leaves a year tick nowhere honest to stand: the
 * first January inside such a span is at whatever fraction the arithmetic produces, and the
 * years the chronology actually opens and closes in have no mark at all. Snapping outward
 * to whole years costs nothing a viewer can misread — position stays exactly proportional
 * to elapsed time, which is the whole claim of the `spine` layout — and buys the two things
 * the frame needs: every year in the span is labelled, and no event sits on the edge.
 */
export type TimelineAxis = {
  /** First instant the axis covers: UTC midnight on 1 January of the opening year. */
  from: number;
  /** Last instant the axis covers: UTC midnight on 1 January after the closing year. */
  to: number;
  years: number[];
  /** Where an instant falls along the axis, 0 at `from` and 1 at `to`. */
  ratio: (timestamp: number) => number;
};

/** Parse one authored date, or throw — an unparseable date is a schema failure, not a layout one. */
export const timestampOf = (date: string, subject: string): number => {
  const parsed = parseUtcDate(date);
  if (parsed === null) throw new Error(`Invalid UTC calendar date "${date}" in ${subject}.`);
  return parsed;
};

/**
 * The axis for a chronology, over the **union** of its event dates and its period bounds.
 *
 * A period that begins before the first event or ends after the last one widens the axis
 * rather than being clipped, which is why the schema needs no refusal for it: the frame
 * tells the truth about the span either way.
 */
export const timelineAxis = (events: DatedEvent[], periods: DatedPeriod[]): TimelineAxis => {
  const stamps = [
    ...events.map((event) => timestampOf(event.date, 'events')),
    ...periods.flatMap((period) => [
      timestampOf(period.from, 'periods'),
      timestampOf(period.to, 'periods'),
    ]),
  ];

  const openingYear = stamps.length === 0 ? 1970 : utcYearOf(Math.min(...stamps));
  const closingYear = stamps.length === 0 ? 1970 : utcYearOf(Math.max(...stamps));
  const from = utcMidnight(openingYear, 1, 1);
  const to = utcMidnight(closingYear + 1, 1, 1);
  const span = to - from;

  return {
    from,
    to,
    years: Array.from({ length: closingYear - openingYear + 1 }, (_, index) => openingYear + index),
    ratio: (timestamp) => (span <= 0 ? 0 : (timestamp - from) / span),
  };
};

export type TimelineTick = { year: number; ratio: number };

/**
 * Year marks along the axis, thinned deterministically when there are more than the frame
 * can letter — always keeping the opening and closing years, which are the two a viewer
 * needs to know the span the chronology covers.
 *
 * The same shape as `timeTickIndices`, and not a call to it: that one thins a list of
 * *observations* by index, and these are the axis's own divisions.
 */
export const timelineTicks = (axis: TimelineAxis, maximum: number): TimelineTick[] => {
  const { years } = axis;
  if (years.length === 0 || maximum <= 0) return [];

  const chosen =
    years.length <= maximum
      ? years
      : maximum === 1
        ? [years[0] as number]
        : [
            ...new Set(
              Array.from(
                { length: maximum },
                (_, slot) =>
                  years[Math.round((slot * (years.length - 1)) / (maximum - 1))] as number,
              ),
            ),
          ];

  return chosen.map((year) => ({ year, ratio: axis.ratio(utcMidnight(year, 1, 1)) }));
};

export type TimelinePeriodSpan = {
  label: string;
  fromRatio: number;
  toRatio: number;
  /** Whole months between the bounds, which is what the band letters beside its name. */
  months: number;
  /** The band's duration, already worded. */
  duration: string;
};

/**
 * The calendar readings a chronology needs, re-exported from `core/time-axis.ts` where they
 * live — `tests/render-purity.test.ts` forbids `new Date(` under `src/primitives`, and the
 * calendar is `core/`'s subject anyway. Named here so a reader of this module sees the whole
 * vocabulary a layout speaks without following an import.
 */
export { utcMonthsBetween as monthsBetween, formatUtcSpan as formatSpan };

/** Each period as a stretch of the axis, in authored order. */
export const timelinePeriodSpans = (
  periods: DatedPeriod[],
  axis: TimelineAxis,
): TimelinePeriodSpan[] =>
  periods.map((period) => {
    const from = timestampOf(period.from, 'periods');
    const to = timestampOf(period.to, 'periods');
    return {
      label: period.label,
      fromRatio: axis.ratio(from),
      toRatio: axis.ratio(to),
      months: utcMonthsBetween(from, to),
      duration: formatUtcSpan(from, to),
    };
  });

/** Where each event sits along the axis, in authored order. */
export const timelineEventRatios = (events: DatedEvent[], axis: TimelineAxis): number[] =>
  events.map((event) => axis.ratio(timestampOf(event.date, 'events')));

/**
 * The distinct `track` values an authored chronology carries, in first-seen order.
 *
 * Exported because two readers need the same answer and must not drift: `checks.ts`
 * refuses a layout whose track count it cannot draw, and the component decides how many
 * rails to draw. A refusal is a claim about how the component is built, and this is the
 * one sentence both of them read it from.
 */
export const timelineTracks = (events: DatedEvent[]): string[] => [
  ...new Set(events.flatMap((event) => (event.track === undefined ? [] : [event.track]))),
];

/**
 * The date under an event, worded. `core/time-axis.ts` owns the wording; this name is the
 * one a chronology's layout reads it by.
 */
export { formatUtcDate as formatEventDate };
