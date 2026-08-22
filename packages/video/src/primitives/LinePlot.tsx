import { measureText } from '@remotion/layout-utils';
import { LinePath } from '@visx/shape';
import type React from 'react';
import { useMemo } from 'react';
import { formatValue } from '../core/format';
import { utcTimeAxis } from '../core/time-axis';
import { type TrendBaseline, trendAxis } from '../core/trend-axis';
import { mix, rampColor } from '../design/theme';
import { useDensity, useSpace, useTheme, useTypeSize } from './ThemeContext';

export type LinePlotPoint = { date: string; label: string };
export type LinePlotSeries = { label: string; values: number[] };
export type LinePlotFocus = { series: string; label?: string };
export type LinePlotAnnotation = { series: string; label: string; text: string };

export type LinePlotProps = {
  width: number;
  height: number;
  points: LinePlotPoint[];
  series: LinePlotSeries[];
  unit: string;
  baseline: TrendBaseline;
  chromeProgress: number;
  revealProgress: number[];
  focus: LinePlotFocus | null;
  focusProgress: number;
  annotation: LinePlotAnnotation | null;
  annotationProgress: number;
};

type PlotDatum = { x: number; y: number; value: number; pointIndex: number };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * L1 temporal plot. This is the only Visx seam: callers speak in dated observations,
 * semantic focus and frame-derived progress, never paths, scales, margins or SVG nodes.
 */
export const LinePlot: React.FC<LinePlotProps> = ({
  width,
  height,
  points,
  series,
  unit,
  baseline,
  chromeProgress,
  revealProgress,
  focus,
  focusProgress,
  annotation,
  annotationProgress,
}) => {
  const theme = useTheme();
  const density = useDensity();
  const axisSize = useTypeSize(0);
  const legendSize = useTypeSize(0);
  const gap = useSpace(2);

  const values = series.flatMap((entry) => entry.values);
  const yAxis = useMemo(() => trendAxis(values, baseline), [values, baseline]);
  const widestDateLabel = useMemo(
    () =>
      points.reduce(
        (widest, point) =>
          Math.max(
            widest,
            measureText({
              text: point.label,
              fontFamily: theme.type.body,
              fontSize: axisSize,
              fontWeight: theme.type.weight.medium,
              letterSpacing: `${theme.type.tracking.wide * axisSize}px`,
            }).width,
          ),
        0,
      ),
    [points, theme, axisSize],
  );
  const maximumDateTicks = Math.max(
    2,
    Math.min(7, Math.floor(width / Math.max(1, widestDateLabel + gap * 2))),
  );
  const xAxis = useMemo(
    () =>
      utcTimeAxis(
        points.map((point) => point.date),
        maximumDateTicks,
      ),
    [points, maximumDateTicks],
  );

  const yLabelWidth = useMemo(
    () =>
      yAxis.ticks.reduce((widest, tick) => {
        const measured = measureText({
          text: formatValue(tick, unit),
          fontFamily: theme.type.body,
          fontSize: axisSize,
          fontWeight: theme.type.weight.medium,
          letterSpacing: `${theme.type.tracking.wide * axisSize}px`,
        }).width;
        return Math.max(widest, measured);
      }, 0),
    [yAxis.ticks, unit, theme, axisSize],
  );

  /**
   * Where each legend entry starts, measured rather than divided.
   *
   * This used to place entry *n* at `padding.left + (n * plotWidth) / series.length` — an
   * even division that knows nothing about the labels standing in it. `series.label` is a
   * 32-character ceiling, so three long labels in three equal thirds is a collision nobody
   * would find until they watched the frame, and `LinePlot`'s own contract says it owns
   * "collision-safe plot padding". The file already measures its date labels with the same
   * utility; the legend was the half that guessed.
   *
   * A cursor, in the order the plan wrote the series, each entry as wide as its own marker
   * plus its own text. `legendOverflows` is the honest report of the case where even that
   * does not fit — see where it is used.
   */
  const legendEntryWidth = useMemo(
    () =>
      series.map(
        (entry) =>
          gap * 1.9 +
          measureText({
            text: entry.label,
            fontFamily: theme.type.body,
            fontSize: legendSize,
            fontWeight: theme.type.weight.medium,
          }).width,
      ),
    [series, theme, legendSize, gap],
  );
  const legendStarts = legendEntryWidth.reduce<number[]>((starts, entryWidth, index) => {
    const previous = starts[index - 1] ?? 0;
    starts.push(index === 0 ? 0 : previous + (legendEntryWidth[index - 1] as number) + gap * 2.4);
    return starts;
  }, []);

  const legendHeight = series.length > 1 ? Math.round((legendSize + gap * 1.5) * density) : gap;
  const padding = {
    top: legendHeight + gap * 2,
    right: gap * 3,
    bottom: axisSize * 2.6,
    left: Math.ceil(yLabelWidth) + gap * 2.5,
  };
  const plotWidth = Math.max(1, width - padding.left - padding.right);
  const plotHeight = Math.max(1, height - padding.top - padding.bottom);
  const xAt = (index: number): number => padding.left + (xAxis.positions[index] ?? 0.5) * plotWidth;
  const yAt = (value: number): number => padding.top + (1 - yAxis.ratio(value)) * plotHeight;

  const focusedPointIndex = focus?.label
    ? points.findIndex((point) => point.label === focus.label)
    : -1;
  const annotationPointIndex = annotation
    ? points.findIndex((point) => point.label === annotation.label)
    : -1;
  const markerStep = points.length > 16 ? Math.ceil(points.length / 12) : 1;
  const markerIndices = new Set(
    points.flatMap((_, index) =>
      index === 0 ||
      index === points.length - 1 ||
      index % markerStep === 0 ||
      index === focusedPointIndex ||
      index === annotationPointIndex
        ? [index]
        : [],
    ),
  );
  const dateTickIndices = new Set([
    0,
    points.length - 1,
    ...(focusedPointIndex >= 0 ? [focusedPointIndex] : []),
    ...(annotationPointIndex >= 0 ? [annotationPointIndex] : []),
  ]);
  for (const candidate of xAxis.tickIndices) {
    const separated = [...dateTickIndices].every(
      (kept) =>
        Math.abs((xAxis.positions[candidate] ?? 0) - (xAxis.positions[kept] ?? 0)) * plotWidth >=
        widestDateLabel + gap * 2,
    );
    if (separated) dateTickIndices.add(candidate);
  }

  const gridInk = mix(theme.color.inkMuted, theme.color.bg, 0.82);
  const axisInk = mix(theme.color.inkMuted, theme.color.bg, 0.28);
  const quietInk = mix(theme.color.inkMuted, theme.color.bg, 0.45);
  const chromeOpacity = clamp01(chromeProgress);

  const annotationTarget = annotation
    ? pointCoordinates(annotation.series, annotation.label, series, points, xAt, yAt)
    : null;
  const focusTarget = focus?.label
    ? pointCoordinates(focus.series, focus.label, series, points, xAt, yAt)
    : null;
  const pointRevealProgress = (seriesLabel: string, pointLabel: string): number => {
    const seriesIndex = series.findIndex((entry) => entry.label === seriesLabel);
    const pointIndex = points.findIndex((point) => point.label === pointLabel);
    if (seriesIndex < 0 || pointIndex < 0) return 0;
    const reveal = clamp01(revealProgress[seriesIndex] ?? 0);
    const threshold = xAxis.positions[pointIndex] ?? 0.5;
    if (reveal + 0.001 < threshold) return 0;
    if (threshold >= 0.999) return 1;
    return clamp01((reveal - threshold) / Math.min(0.12, 1 - threshold));
  };
  const visibleFocusProgress = focusTarget
    ? Math.min(focusProgress, pointRevealProgress(focusTarget.series, focusTarget.pointLabel))
    : focusProgress;
  const visibleAnnotationProgress = annotationTarget
    ? Math.min(
        annotationProgress,
        pointRevealProgress(annotationTarget.series, annotationTarget.pointLabel),
      )
    : annotationProgress;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Line chart with ${series.length} series across ${points.length} dated observations`}
      style={{ display: 'block', overflow: 'hidden' }}
    >
      <title>{series.map((entry) => entry.label).join(', ')}</title>
      <defs>
        {series.map((entry, seriesIndex) => {
          const progress = clamp01(revealProgress[seriesIndex] ?? 0);
          return (
            <clipPath key={entry.label} id={`line-plot-reveal-${seriesIndex}`}>
              <rect
                x={padding.left - 8}
                y={padding.top - 8}
                width={(plotWidth + 16) * progress}
                height={plotHeight + 16}
              />
            </clipPath>
          );
        })}
      </defs>

      <g opacity={chromeOpacity}>
        {yAxis.ticks.map((tick) => {
          const y = yAt(tick);
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={gridInk} />
              <text
                x={padding.left - gap}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fill={axisInk}
                fontFamily={theme.type.body}
                fontSize={axisSize}
                fontWeight={theme.type.weight.medium}
                letterSpacing={theme.type.tracking.wide * axisSize}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatValue(tick, unit)}
              </text>
            </g>
          );
        })}

        {yAxis.zeroRatio >= 0 && yAxis.zeroRatio <= 1 ? (
          <line
            data-line-chart-zero="true"
            x1={padding.left}
            x2={width - padding.right}
            y1={yAt(0)}
            y2={yAt(0)}
            stroke={axisInk}
            strokeWidth={2}
          />
        ) : null}

        <line
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={height - padding.bottom}
          stroke={gridInk}
        />
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
          stroke={gridInk}
        />

        {[...dateTickIndices]
          .sort((a, b) => a - b)
          .map((index) => (
            <g key={points[index]?.date}>
              <line
                x1={xAt(index)}
                x2={xAt(index)}
                y1={height - padding.bottom}
                y2={height - padding.bottom + gap * 0.65}
                stroke={gridInk}
              />
              <text
                x={xAt(index)}
                y={height - padding.bottom + gap * 1.7}
                textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
                dominantBaseline="hanging"
                fill={quietInk}
                fontFamily={theme.type.body}
                fontSize={axisSize}
                fontWeight={theme.type.weight.medium}
                letterSpacing={theme.type.tracking.wide * axisSize}
              >
                {points[index]?.label}
              </text>
            </g>
          ))}

        {series.length > 1 ? (
          <g aria-label="Legend">
            {series.map((entry, index) => {
              const color = rampColor(theme.color.dataSeries, index, series.length);
              const receded = focus !== null && focus.series !== entry.label;
              const recedeProgress = receded ? clamp01(focusProgress) : 0;
              return (
                <g
                  key={entry.label}
                  data-legend-entry={entry.label}
                  transform={`translate(${padding.left + (legendStarts[index] as number)}, ${legendSize})`}
                >
                  <line
                    x1={0}
                    x2={gap * 1.4}
                    y1={0}
                    y2={0}
                    stroke={mix(color, theme.color.inkMuted, 0.72 * recedeProgress)}
                    strokeWidth={4}
                    strokeLinecap="round"
                  />
                  <text
                    x={gap * 1.9}
                    y={0}
                    dominantBaseline="middle"
                    fill={mix(theme.color.ink, quietInk, recedeProgress)}
                    fontFamily={theme.type.body}
                    fontSize={legendSize}
                    fontWeight={theme.type.weight.medium}
                  >
                    {entry.label}
                  </text>
                </g>
              );
            })}
          </g>
        ) : null}
      </g>

      {series.map((entry, seriesIndex) => {
        const progress = clamp01(revealProgress[seriesIndex] ?? 0);
        const baseColor = rampColor(theme.color.dataSeries, seriesIndex, series.length);
        const receded = focus !== null && focus.series !== entry.label;
        const recedeProgress = receded ? clamp01(focusProgress) : 0;
        const color = mix(baseColor, theme.color.inkMuted, 0.72 * recedeProgress);
        const data: PlotDatum[] = entry.values.map((value, pointIndex) => ({
          x: xAt(pointIndex),
          y: yAt(value),
          value,
          pointIndex,
        }));

        return (
          <g key={entry.label} data-line-series={entry.label} opacity={1 - 0.54 * recedeProgress}>
            {data.length > 1 ? (
              <LinePath<PlotDatum>
                data={data}
                x={(datum) => datum.x}
                y={(datum) => datum.y}
                fill="none"
                stroke={color}
                strokeWidth={5 - 2 * recedeProgress}
                strokeLinecap="round"
                strokeLinejoin="round"
                clipPath={`url(#line-plot-reveal-${seriesIndex})`}
              />
            ) : null}

            {data.map((datum) => {
              const ordinary = markerIndices.has(datum.pointIndex);
              const selected =
                (focus?.series === entry.label &&
                  focus.label === points[datum.pointIndex]?.label) ||
                (annotation?.series === entry.label &&
                  annotation.label === points[datum.pointIndex]?.label);
              const reached = (xAxis.positions[datum.pointIndex] ?? 0.5) <= progress + 0.001;
              if (!reached || (!ordinary && !selected)) return null;
              const pointLabel = points[datum.pointIndex]?.label;
              const selectionProgress = Math.max(
                focus?.series === entry.label && focus.label === pointLabel
                  ? visibleFocusProgress
                  : 0,
                annotation?.series === entry.label && annotation.label === pointLabel
                  ? visibleAnnotationProgress
                  : 0,
              );
              return (
                <circle
                  key={points[datum.pointIndex]?.date}
                  data-line-point={points[datum.pointIndex]?.label}
                  cx={datum.x}
                  cy={datum.y}
                  r={4.5 + 4.5 * selectionProgress}
                  fill={theme.color.bg}
                  stroke={color}
                  strokeWidth={3 + 2 * selectionProgress}
                />
              );
            })}
          </g>
        );
      })}

      {focusTarget ? (
        <FocusLabel
          target={focusTarget}
          width={width}
          padding={padding}
          unit={unit}
          progress={visibleFocusProgress}
        />
      ) : null}

      {annotation && annotationTarget ? (
        <AnnotationLabel
          target={annotationTarget}
          text={annotation.text}
          width={width}
          height={height}
          padding={padding}
          unit={unit}
          progress={visibleAnnotationProgress}
        />
      ) : null}
    </svg>
  );
};

type PointCoordinates = { x: number; y: number; value: number; pointLabel: string; series: string };

const pointCoordinates = (
  seriesLabel: string,
  pointLabel: string,
  series: LinePlotSeries[],
  points: LinePlotPoint[],
  xAt: (index: number) => number,
  yAt: (value: number) => number,
): PointCoordinates | null => {
  const seriesEntry = series.find((entry) => entry.label === seriesLabel);
  const pointIndex = points.findIndex((point) => point.label === pointLabel);
  const value = pointIndex < 0 ? undefined : seriesEntry?.values[pointIndex];
  if (seriesEntry === undefined || pointIndex < 0 || value === undefined) return null;
  return { x: xAt(pointIndex), y: yAt(value), value, pointLabel, series: seriesLabel };
};

const FocusLabel: React.FC<{
  target: PointCoordinates;
  width: number;
  padding: { top: number; right: number; bottom: number; left: number };
  unit: string;
  progress: number;
}> = ({ target, width, padding, unit, progress }) => {
  const theme = useTheme();
  const size = useTypeSize(0);
  const gap = useSpace(2);
  const cardWidth = Math.min(440, Math.max(260, width * 0.27));
  const metaLines = wrapToWidth(`${target.series} · ${target.pointLabel}`, cardWidth - gap * 2.8, {
    fontFamily: theme.type.body,
    fontSize: size * 0.95,
    fontWeight: theme.type.weight.medium,
  });
  const cardHeight = size * (2.15 + Math.max(0, metaLines.length - 1) * 0.92);
  const x = Math.min(
    width - padding.right - cardWidth,
    Math.max(padding.left, target.x - cardWidth / 2),
  );
  const above = target.y - padding.top > cardHeight + gap;
  const y = above ? target.y - cardHeight - gap : target.y + gap;
  const p = clamp01(progress);

  return (
    <g data-line-focus={`${target.series}:${target.pointLabel}`} opacity={p}>
      <line
        x1={target.x}
        x2={target.x}
        y1={padding.top}
        y2={padding.top + (target.y - padding.top) * p}
        stroke={mix(theme.color.inkMuted, theme.color.bg, 0.35)}
        strokeDasharray="6 8"
      />
      <g transform={`translate(${x}, ${y + (1 - p) * gap})`}>
        <rect
          width={cardWidth}
          height={cardHeight}
          rx={theme.radius[2]}
          fill={theme.color.surface}
          stroke={mix(theme.color.inkMuted, theme.color.bg, 0.7)}
        />
        <text
          x={gap}
          y={size * 0.85}
          fill={theme.color.inkMuted}
          fontFamily={theme.type.body}
          fontSize={size * 0.82}
          fontWeight={theme.type.weight.medium}
        >
          {metaLines.map((line, index) => (
            <tspan key={`${index}-${line}`} x={gap} dy={index === 0 ? 0 : size * 0.92}>
              {line}
            </tspan>
          ))}
        </text>
        <text
          x={gap}
          y={size * (1.75 + Math.max(0, metaLines.length - 1) * 0.92)}
          fill={theme.color.ink}
          fontFamily={theme.type.mono}
          fontSize={size}
          fontWeight={theme.type.weight.bold}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatValue(target.value, unit)}
        </text>
      </g>
    </g>
  );
};

const AnnotationLabel: React.FC<{
  target: PointCoordinates;
  text: string;
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  unit: string;
  progress: number;
}> = ({ target, text, width, height, padding, unit, progress }) => {
  const theme = useTheme();
  const size = useTypeSize(0);
  const gap = useSpace(2);
  const cardWidth = Math.min(560, Math.max(360, width * 0.34));
  /** The card's inner width: its box less the left rule and the padding on both sides. */
  const inner = cardWidth - gap * 2.8;
  const metadataLines = wrapToWidth(
    `${target.series} · ${target.pointLabel} · ${formatValue(target.value, unit)}`,
    inner,
    { fontFamily: theme.type.body, fontSize: size * 0.82, fontWeight: theme.type.weight.medium },
  );
  const annotationLines = wrapToWidth(text, inner, {
    fontFamily: theme.type.body,
    fontSize: size,
    fontWeight: theme.type.weight.medium,
  });
  const annotationStart = 1.05 + metadataLines.length * 0.9 + 0.35;
  const cardHeight =
    size * (annotationStart + Math.max(0, annotationLines.length - 1) * 1.12 + 0.8);
  const placeLeft = target.x > width * 0.58;
  const rawX = placeLeft ? target.x - cardWidth - gap * 2 : target.x + gap * 2;
  const x = Math.min(width - padding.right - cardWidth, Math.max(padding.left, rawX));
  const y = Math.min(
    height - padding.bottom - cardHeight,
    Math.max(padding.top, target.y - cardHeight / 2),
  );
  const joinX = placeLeft ? x + cardWidth : x;
  const joinY = y + cardHeight / 2;
  const p = clamp01(progress);

  return (
    <g data-line-annotation={`${target.series}:${target.pointLabel}`} opacity={p}>
      <polyline
        points={`${target.x},${target.y} ${(target.x + joinX) / 2},${target.y} ${joinX},${joinY}`}
        fill="none"
        stroke={theme.color.accentAlt}
        strokeWidth={2}
        strokeDasharray={`${Math.max(1, p * 1000)} 1000`}
      />
      <g transform={`translate(${x + (1 - p) * (placeLeft ? gap : -gap)}, ${y})`}>
        <rect
          width={cardWidth}
          height={cardHeight}
          rx={theme.radius[2]}
          fill={theme.color.surface}
        />
        <rect width={5} height={cardHeight} rx={2} fill={theme.color.accentAlt} />
        <text
          x={gap * 1.4}
          y={size * 1.05}
          fill={theme.color.inkMuted}
          fontFamily={theme.type.body}
          fontSize={size * 0.82}
          fontWeight={theme.type.weight.medium}
        >
          {metadataLines.map((line, index) => (
            <tspan key={`${index}-${line}`} x={gap * 1.4} dy={index === 0 ? 0 : size * 0.9}>
              {line}
            </tspan>
          ))}
        </text>
        <text
          x={gap * 1.4}
          y={size * annotationStart}
          fill={theme.color.ink}
          fontFamily={theme.type.body}
          fontSize={size}
          fontWeight={theme.type.weight.medium}
        >
          {annotationLines.map((line, index) => (
            <tspan key={`${index}-${line}`} x={gap * 1.4} dy={index === 0 ? 0 : size * 1.12}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    </g>
  );
};

/**
 * The font a string will actually be drawn in, which is the only thing that decides how
 * wide it is.
 */
type TextFace = { fontFamily: string; fontSize: number; fontWeight: number };

/**
 * Wrap to a width in pixels, not to a count of characters.
 *
 * This wrapped at 32, 38 and 42 characters while the cards it wraps into are sized in
 * pixels — `Math.min(560, Math.max(360, width * 0.34))` — so the two agreed only by
 * coincidence, and the coincidence is per-string: "WWWWW" and "lllll" are the same five
 * characters and nowhere near the same width. ADR-0014 §6 asks for "the deterministic
 * layout utilities already owned by the design system", and this file already reaches for
 * exactly that when it sizes the date axis; the annotation cards were the half that did not.
 *
 * Greedy, and a word too long for the line still gets its own line rather than being cut —
 * an overhanging word is visible and a silently truncated one is not.
 */
const wrapToWidth = (text: string, available: number, face: TextFace): string[] => {
  const words = text.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (words.length === 0) return [];

  const widthOf = (candidate: string) => measureText({ text: candidate, ...face }).width;

  const lines: string[] = [];
  let line = words[0] as string;
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (widthOf(candidate) <= available) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
  }
  lines.push(line);
  return lines;
};
