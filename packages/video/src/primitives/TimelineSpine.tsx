import { measureText } from '@remotion/layout-utils';
import type React from 'react';
import { useMemo } from 'react';
import { truncateToWidth } from '../core/format';
import type { MotionProfile } from '../design/motion';
import { mix } from '../design/theme';
import { Callout } from './Callout';
import { useSpace, useTheme, useTypeSize } from './ThemeContext';
import { layoutDateLabels, wrapTextToWidth } from './linePlotLayout';
import {
  type DatedEvent,
  type DatedPeriod,
  formatEventDate,
  timelineAxis,
  timelineEventRatios,
  timelinePeriodSpans,
  timelineTicks,
  timestampOf,
} from './timelineLayout';

export type TimelineSpineFocus = { label: string };
export type TimelineSpineAnnotation = { label: string; text: string };

export type TimelineSpineProps = {
  width: number;
  height: number;
  events: DatedEvent[];
  periods: DatedPeriod[];
  /** Room one event column may take, and the lane budget above the axis. */
  geometry: { axisShare: number; labelEms: number; labelLanes: number; maxYearTicks: number };
  chromeProgress: number;
  /** Per event, in authored order. Staggered by the caller so the reveal runs in date order. */
  revealProgress: number[];
  focus: TimelineSpineFocus | null;
  focusProgress: number;
  annotation: TimelineSpineAnnotation | null;
  annotationProgress: number;
  profile: MotionProfile;
  annotationStartFrame: number;
};

/** The most lines an event label wraps into before its tail is cut to the column. */
const MAX_LABEL_LINES = 3;

/**
 * `Callout`'s own measurements, read back so a caller can work out how tall a card will be
 * before it draws one. Two numbers in a second place, which is a cost — the alternative was
 * to make the primitive take a height budget, and a callout that knows about the room under
 * an axis is a callout that knows about timelines.
 */
const CALLOUT_MAX_WIDTH = 520;
const CALLOUT_LINE_HEIGHT = 1.32;
const CALLOUT_RULE_HEIGHT = 2;

/**
 * The leading an event label is set at. Tighter than body copy because these are short runs
 * of display type, and the wrap prediction uses the same figure the browser draws with — a
 * fit that predicts with one number and renders with another is an estimate.
 */
const LABEL_LINE_HEIGHT = 1.12;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * L1 chronology on a proportional axis. Callers speak in dated events, named periods,
 * semantic focus and frame-derived progress — never in x coordinates, lanes or SVG nodes.
 *
 * **The rails are SVG and the words are not.** Every run of type here is an HTML block
 * absolutely positioned over the drawing, which is how the design was drawn and is also the
 * only arrangement the content-stress suite can read: `oversizedDisplayType` measures
 * `offsetHeight`, which an `<svg><text>` does not have, so display type set inside the SVG
 * would be display type nothing checks.
 *
 * **Recessive text stops at `inkMuted`.** The lighter mixes below it — `quietInk` at 2.17:1
 * and `axisInk` at 2.89:1 on `editorial-paper` — are for the ruler: ticks, rails and event
 * markers, which nobody reads. Dates, event labels, period names and the year labels are
 * letters, and they are held to the floor `theme.ts` promises for the tokens themselves.
 * The design study these frames came from set the years in `axisInk`; that is the one place
 * this deviates from the drawing, deliberately.
 */
export const TimelineSpine: React.FC<TimelineSpineProps> = ({
  width,
  height,
  events,
  periods,
  geometry,
  chromeProgress,
  revealProgress,
  focus,
  focusProgress,
  annotation,
  annotationProgress,
  profile,
  annotationStartFrame,
}) => {
  const theme = useTheme();
  const dateSize = useTypeSize(0);
  const labelSize = useTypeSize(1);
  const gap = useSpace(3);

  const axisY = Math.round(height * geometry.axisShare);
  const columnWidth = dateSize * geometry.labelEms;
  const stemGap = Math.round(gap * 0.9);

  /**
   * A period gets its own strip immediately above the axis, and the event labels start
   * above that.
   *
   * The band and the lowest label lane used to share the same slice, which put the band's
   * name straight through the date of whichever event opened the period — legible in the
   * design study, where the band was drawn under a taller header, and a collision the
   * moment a real chronology set its dates at the system's own scale. A period is a thing
   * on the axis rather than a plate behind the rows, so it takes room from the labels
   * rather than standing in it.
   */
  const bandHeight = periods.length > 0 ? Math.round(dateSize * 1.7) : 0;
  const laneBase = stemGap + bandHeight;

  /** The strip under the axis the year marks stand in, which the annotation begins below. */
  const yearRowHeight = Math.round(gap * 0.9 + dateSize * 0.9 * 1.3);

  /**
   * The faces the two runs are actually set in, so the wrap prediction measures the
   * letterforms the browser will draw rather than a grotesque standing in for a mono.
   * Memoised because the wrap depends on them and a fresh object every frame would
   * recompute every label on every frame of the shot.
   */
  const dateFace = useMemo(
    () => ({
      fontFamily: theme.type.mono,
      fontSize: dateSize * 0.86,
      fontWeight: theme.type.weight.medium,
      letterSpacing: `${theme.type.tracking.wide * dateSize * 0.86}px`,
    }),
    [theme, dateSize],
  );
  const labelFace = useMemo(
    () => ({
      fontFamily: theme.type.display,
      fontSize: labelSize,
      fontWeight: theme.type.weight.medium,
      letterSpacing: `${theme.type.tracking.tight * labelSize}px`,
    }),
    [theme, labelSize],
  );

  const axis = useMemo(() => timelineAxis(events, periods), [events, periods]);
  const ratios = useMemo(() => timelineEventRatios(events, axis), [events, axis]);
  const spans = useMemo(() => timelinePeriodSpans(periods, axis), [periods, axis]);
  const ticks = useMemo(
    () => timelineTicks(axis, geometry.maxYearTicks),
    [axis, geometry.maxYearTicks],
  );

  const xAt = (ratio: number): number => ratio * width;

  const focusIndex = focus ? events.findIndex((event) => event.label === focus.label) : -1;
  const annotationIndex = annotation
    ? events.findIndex((event) => event.label === annotation.label)
    : -1;

  /**
   * How many lines of label one lane may carry, which is the room above the axis divided
   * by the lanes that have to share it.
   *
   * The box decides, never the string — the same order `fitTitleStep` puts the two
   * questions in. A fixed three-line budget is right on a frame whose header is one line
   * and wrong on one whose header takes three: at the schema's ceiling the stack asked for
   * 392px above an axis that had 306, so the top lane was drawn through the title. A budget
   * read from the room cannot do that, and where it lands on one line the label is cut to
   * its column rather than to a character count.
   */
  const laneBudget =
    (axisY - laneBase - gap * 0.5 * (geometry.labelLanes - 1)) / geometry.labelLanes;
  const maxLabelLines = Math.max(
    1,
    Math.min(
      MAX_LABEL_LINES,
      Math.floor((laneBudget - dateSize * 1.24 - gap * 0.4) / (labelSize * LABEL_LINE_HEIGHT)),
    ),
  );

  /**
   * Each event's date and label, wrapped to its own column and cut to the column on the
   * line the budget runs out at. Measured rather than counted — a character budget hands
   * the same fourteen characters to every column, which is the mistake `truncateToWidth`
   * exists to record.
   */
  const blocks = useMemo(
    () =>
      events.map((event, index) => {
        const date = formatEventDate(timestampOf(event.date, 'events')).toUpperCase();
        const widthOf = (candidate: string): number =>
          measureText({ text: candidate, ...labelFace }).width;
        const wrapped = wrapTextToWidth(event.label, columnWidth, widthOf);
        const lines =
          wrapped.length <= maxLabelLines
            ? wrapped
            : [
                ...wrapped.slice(0, maxLabelLines - 1),
                truncateToWidth(wrapped.slice(maxLabelLines - 1).join(' '), columnWidth, widthOf),
              ];
        const height =
          dateSize * 1.24 + gap * 0.4 + Math.max(1, lines.length) * labelSize * LABEL_LINE_HEIGHT;
        return { index, date, lines, height };
      }),
    [events, columnWidth, labelFace, maxLabelLines, dateSize, labelSize, gap],
  );

  const laneHeight = blocks.reduce((tallest, block) => Math.max(tallest, block.height), 0);
  const lanePitch = laneHeight + gap * 0.5;

  const placements = layoutDateLabels({
    candidates: blocks.map((block) => ({
      index: block.index,
      x: xAt(ratios[block.index] ?? 0),
      width: columnWidth,
    })),
    required: new Set(
      [0, events.length - 1, focusIndex, annotationIndex].filter((index) => index >= 0),
    ),
    left: 0,
    right: width,
    gap: gap * 0.6,
  });
  const laneOf = new Map(placements.map((placement) => [placement.index, placement]));

  /**
   * Where a band's name has to stop.
   *
   * It may run past its own band — a period named in one word would otherwise put a length
   * ceiling on `periods[].label`, which is the composition choice the design study rejected
   * for the `ledger` gutter, and for the same reason: a choice that constrains a field is
   * worse than one that costs pixels. What it may not do is reach the next band's name, so
   * the stop is the next period along, or the edge of the frame when there is none.
   */
  const bandLabelRight = (fromRatio: number): number => {
    const next = spans
      .map((other) => other.fromRatio)
      .filter((start) => start > fromRatio)
      .sort((a, b) => a - b)[0];
    return next === undefined ? width : xAt(next);
  };

  const gridInk = mix(theme.color.inkMuted, theme.color.bg, 0.82);
  const axisInk = mix(theme.color.inkMuted, theme.color.bg, 0.28);
  const markerInk = mix(theme.color.inkMuted, theme.color.bg, 0.45);
  const chrome = clamp01(chromeProgress);

  /** How present one event is: its own reveal, dimmed further while another is focused. */
  const presence = (index: number): number => {
    const revealed = clamp01(revealProgress[index] ?? 0);
    if (focusIndex < 0 || index === focusIndex) return revealed;
    return revealed * (1 - 0.45 * clamp01(focusProgress));
  };

  const annotationWidth = Math.min(CALLOUT_MAX_WIDTH, Math.max(320, width * 0.34));
  const annotationX =
    annotationIndex >= 0
      ? Math.min(
          Math.max(0, xAt(ratios[annotationIndex] ?? 0)),
          Math.max(0, width - annotationWidth),
        )
      : 0;
  const annotationRuleY = axisY + yearRowHeight + gap;
  const annotationOpen = annotationIndex >= 0 ? clamp01(annotationProgress) : 0;

  /**
   * The annotation, cut to the room under the axis.
   *
   * `Callout` grows with whatever it is handed, and what it is handed here is agent copy at
   * a ninety-character ceiling — six lines of it once the widest glyph is repeated, which
   * ran the card off the bottom of the canvas. The arithmetic below is `Callout`'s own type
   * scale read back: the line height it sets its copy at, and the padding it puts around
   * it. That is a second copy of two numbers, and it is the price of keeping the primitive
   * ignorant of the box its caller has left it.
   */
  const annotationInner = annotationWidth - gap * 1.5;
  const annotationLineHeight = labelSize * CALLOUT_LINE_HEIGHT;
  const annotationLabelBlock = dateSize * 0.82 * 1.2 + gap + CALLOUT_RULE_HEIGHT;
  const annotationLines = Math.max(
    1,
    Math.floor((height - annotationRuleY - annotationLabelBlock - gap * 2) / annotationLineHeight),
  );
  const annotationCopy = useMemo(() => {
    if (!annotation) return '';
    const widthOf = (candidate: string): number =>
      measureText({
        text: candidate,
        fontFamily: theme.type.body,
        fontSize: labelSize,
        fontWeight: theme.type.weight.regular,
      }).width;
    const wrapped = wrapTextToWidth(annotation.text, annotationInner, widthOf);
    if (wrapped.length <= annotationLines) return annotation.text;
    return [
      ...wrapped.slice(0, annotationLines - 1),
      truncateToWidth(wrapped.slice(annotationLines - 1).join(' '), annotationInner, widthOf),
    ].join(' ');
  }, [annotation, annotationInner, annotationLines, theme, labelSize]);

  /** The card names the moment it explains, on one line — it is a title, not a second note. */
  const annotationTitle = useMemo(() => {
    const label = annotationIndex >= 0 ? (events[annotationIndex]?.label ?? '') : '';
    return truncateToWidth(
      label,
      annotationInner,
      (candidate) =>
        measureText({
          text: candidate,
          fontFamily: theme.type.mono,
          fontSize: dateSize * 0.82,
          fontWeight: theme.type.weight.regular,
          letterSpacing: `${theme.type.tracking.wide * dateSize}px`,
        }).width,
    );
  }, [annotationIndex, events, annotationInner, theme, dateSize]);

  return (
    <div style={{ position: 'relative', width, height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Chronology of ${events.length} dated events across ${axis.years.length} years`}
        style={{ position: 'absolute', inset: 0, display: 'block', overflow: 'hidden' }}
      >
        <title>{events.map((event) => event.label).join(', ')}</title>

        <g opacity={chrome}>
          {spans.map((span) => (
            <rect
              key={`${span.label}-${span.fromRatio}`}
              data-timeline-period={span.label}
              x={xAt(span.fromRatio)}
              y={axisY - bandHeight}
              width={Math.max(2, xAt(span.toRatio) - xAt(span.fromRatio))}
              height={bandHeight}
              fill={theme.color.surface}
            />
          ))}

          <line x1={0} x2={width} y1={axisY} y2={axisY} stroke={axisInk} strokeWidth={2} />

          {ticks.map((tick) => (
            <line
              key={tick.year}
              x1={xAt(tick.ratio)}
              x2={xAt(tick.ratio)}
              y1={axisY}
              y2={axisY + gap * 0.7}
              stroke={gridInk}
            />
          ))}
        </g>

        {events.map((event, index) => {
          const placement = laneOf.get(index);
          const shown = presence(index);
          if (shown <= 0.001) return null;
          const focused = index === focusIndex;
          const x = xAt(ratios[index] ?? 0);
          const top = axisY - laneBase - (placement ? placement.lane * lanePitch : 0);
          const emphasis = focused ? clamp01(focusProgress) : 0;

          return (
            <g key={event.label} data-timeline-event={event.label} opacity={shown}>
              {placement ? (
                <line
                  x1={x}
                  x2={x}
                  y1={axisY}
                  y2={top - laneHeight * 0.06}
                  stroke={focused ? theme.color.accent : gridInk}
                  strokeWidth={2}
                />
              ) : null}
              {focused ? (
                <circle
                  cx={x}
                  cy={axisY}
                  r={dateSize * 0.5 + dateSize * 0.28 * emphasis}
                  fill="none"
                  stroke={theme.color.accent}
                  strokeWidth={2}
                  opacity={0.34 * emphasis}
                />
              ) : null}
              <circle
                cx={x}
                cy={axisY}
                r={dateSize * 0.24 + dateSize * 0.12 * emphasis}
                fill={focused ? theme.color.accent : markerInk}
              />
            </g>
          );
        })}

        {annotationIndex >= 0 ? (
          <polyline
            points={`${xAt(ratios[annotationIndex] ?? 0)},${axisY} ${xAt(ratios[annotationIndex] ?? 0)},${annotationRuleY} ${annotationX},${annotationRuleY}`}
            fill="none"
            stroke={theme.color.accentAlt}
            strokeWidth={2}
            strokeDasharray={`${Math.max(1, annotationOpen * 2000)} 2000`}
          />
        ) : null}
      </svg>

      {spans.map((span) => (
        <div
          key={`${span.label}-label`}
          style={{
            position: 'absolute',
            left: xAt(span.fromRatio) + gap * 0.5,
            top: axisY - bandHeight,
            height: bandHeight,
            display: 'flex',
            alignItems: 'center',
            maxWidth: Math.max(0, bandLabelRight(span.fromRatio) - xAt(span.fromRatio) - gap),
            opacity: chrome,
            fontFamily: theme.type.mono,
            fontSize: dateSize * 0.78,
            fontWeight: theme.type.weight.medium,
            letterSpacing: `${theme.type.tracking.wide * dateSize * 0.78}px`,
            textTransform: 'uppercase',
            color: theme.color.inkMuted,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {`${span.label} · ${span.duration}`}
        </div>
      ))}

      {blocks.map((block) => {
        const placement = laneOf.get(block.index);
        if (!placement) return null;
        const shown = presence(block.index);
        const focused = block.index === focusIndex;
        const bottom = axisY - laneBase - placement.lane * lanePitch;

        return (
          <div
            key={events[block.index]?.label}
            data-timeline-label={events[block.index]?.label}
            style={{
              position: 'absolute',
              left: placement.start,
              top: bottom - block.height,
              width: placement.width,
              opacity: shown,
              transform: `translateY(${(1 - clamp01(revealProgress[block.index] ?? 0)) * labelSize * 0.3}px)`,
            }}
          >
            <div
              style={{
                ...dateFace,
                letterSpacing: dateFace.letterSpacing,
                lineHeight: 1.24,
                textTransform: 'uppercase',
                color: focused ? theme.color.accent : theme.color.inkMuted,
              }}
            >
              {block.date}
            </div>
            <div
              style={{
                marginTop: gap * 0.4,
                fontFamily: labelFace.fontFamily,
                fontSize: labelFace.fontSize,
                fontWeight: focused ? theme.type.weight.bold : theme.type.weight.medium,
                letterSpacing: labelFace.letterSpacing,
                lineHeight: LABEL_LINE_HEIGHT,
                color: focused ? theme.color.ink : theme.color.inkMuted,
                overflowWrap: 'break-word',
              }}
            >
              {block.lines.join(' ')}
            </div>
          </div>
        );
      })}

      {ticks.map((tick) => (
        <div
          key={tick.year}
          style={{
            position: 'absolute',
            left: xAt(tick.ratio) + gap * 0.5,
            top: axisY + gap * 0.9,
            opacity: chrome,
            fontFamily: theme.type.body,
            fontSize: dateSize * 0.9,
            fontWeight: theme.type.weight.medium,
            letterSpacing: `${theme.type.tracking.wide * dateSize * 0.9}px`,
            color: theme.color.inkMuted,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {tick.year}
        </div>
      ))}

      {annotation && annotationIndex >= 0 ? (
        <div
          data-timeline-annotation={annotation.label}
          style={{
            position: 'absolute',
            left: annotationX,
            top: annotationRuleY,
            width: annotationWidth,
            opacity: annotationOpen,
            /**
             * Inherited by everything `Callout` draws, and it is here rather than in
             * `Callout` on purpose.
             *
             * `AnimatedText` argues for `break-word` over `anywhere` across the system:
             * `break-word` leaves intrinsic sizing alone, so no existing layout moves. The
             * cost of leaving it alone is that a flex item sized to fit-content still asks
             * for its max-content width, so one unbreakable 90-character token made the
             * callout wider than the 520px it was given and drew off the canvas. `anywhere`
             * is the same wrap with the intrinsic size corrected. Scoped to this one
             * annotation, so the shared primitive keeps the system-wide answer.
             */
            overflowWrap: 'anywhere',
          }}
        >
          <Callout
            text={annotationCopy}
            label={annotationTitle}
            startFrame={annotationStartFrame}
            profile={profile}
          />
        </div>
      ) : null}
    </div>
  );
};
