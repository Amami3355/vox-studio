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
  timeTickIndices,
  utcMidnight,
  utcMonthsBetween,
  utcTimeAxis,
  utcYearOf,
} from '../core/time-axis';

export type DatedEvent = { date: string; label: string };
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
  const yearBoundary = (year: number): string => `${String(year).padStart(4, '0')}-01-01`;
  const from = timestampOf(yearBoundary(openingYear), 'axis');
  const to = utcMidnight(closingYear + 1, 1, 1);
  const proportional = utcTimeAxis([yearBoundary(openingYear)], 0, { from, to });

  return {
    from,
    to,
    years: Array.from({ length: closingYear - openingYear + 1 }, (_, index) => openingYear + index),
    ratio: proportional.ratio,
  };
};

export type TimelineTick = { year: number; ratio: number };

/**
 * Year marks along the axis, thinned deterministically when there are more than the frame
 * can letter — always keeping the opening and closing years, which are the two a viewer
 * needs to know the span the chronology covers.
 *
 * `timeTickIndices` owns the thinning rule for every dated axis, so observation labels and
 * year divisions cannot drift into different answers about which endpoints must survive.
 */
export const timelineTicks = (axis: TimelineAxis, maximum: number): TimelineTick[] => {
  const { years } = axis;
  if (years.length === 0 || maximum <= 0) return [];

  const chosen = timeTickIndices(years.length, maximum).map((index) => years[index] as number);

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
 * Box available to a period label after the same inset is left on both sides. A band
 * narrower than the preferred inset reduces it symmetrically, so neither label edge can
 * cross the band it names.
 */
export const timelinePeriodLabelBox = (
  span: Pick<TimelinePeriodSpan, 'fromRatio' | 'toRatio'>,
  axisWidth: number,
  totalInset: number,
): { leftInset: number; width: number } => {
  const bandWidth = Math.max(0, (span.toRatio - span.fromRatio) * axisWidth);
  const leftInset = Math.min(totalInset / 2, bandWidth / 2);
  return { leftInset, width: Math.max(0, bandWidth - leftInset * 2) };
};

/**
 * The date under an event, worded. `core/time-axis.ts` owns the wording; this name is the
 * one a chronology's layout reads it by.
 */
export { formatUtcDate as formatEventDate };
