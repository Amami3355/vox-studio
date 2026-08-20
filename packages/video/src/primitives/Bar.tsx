/**
 * Bar primitives.
 *
 * Not exposed to the agent. BarChartScene composes these; the agent only ever sees
 * the scene. Degradation lives here: a negative value recomputes the axis instead of
 * drawing below the frame, and a label longer than the column is truncated instead of
 * pushing its neighbours around.
 */
import { measureText } from '@remotion/layout-utils';
import type React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { countTo, formatValue, truncateToWidth } from '../core/format';
import { valueAxis } from '../core/scale';
import { type MotionProfile, springConfig } from '../design/motion';
import { mix, rampColor } from '../design/theme';
import { Gridlines, useAxisGutter } from './Gridlines';
import { useSpace, useTheme, useTypeSize } from './ThemeContext';

export type Datum = { label: string; value: number };

export type BarGroupProps = {
  data: Datum[];
  /** Frame at which each bar was revealed. `null` means not yet revealed. */
  revealFrames: (number | null)[];
  highlighted: string | null;
  /** Frame the highlight landed, so the desaturation can animate rather than snap. */
  highlightSince: number;
  primary: string;
  unit: string;
  profile: MotionProfile;
  orientation: 'vertical' | 'horizontal';
  /**
   * Whether the vertical plot carries a value axis.
   *
   * Not a decoration switch: it decides *where the reader gets a number from*. With the
   * axis the chart is a shape against a ruler and only the named bar prints its figure;
   * without it every bar prints its own, because a plot with neither states no quantity
   * at all. The horizontal branch ignores it — a ranking never had an axis.
   */
  gridlines: boolean;
  /**
   * The width of the box the plot was actually given, in canvas px.
   *
   * Declared by the layout rather than measured here, for the reason `ColumnProvider`
   * gives: a CSS percentage resolves at layout time, which is too late for a component
   * that has to decide how much of a category name it can draw while rendering. The
   * scene is the only thing that knows whether an annotation column is open beside the
   * chart, so the scene is what says.
   */
  width: number;
};

/**
 * The share of a ranking's width its category names get.
 *
 * Named because two things have to agree on it: the row draws the column this wide, and
 * the label is cut to fit it. They were separate numbers — a percentage in the style and a
 * budget of 22 characters — and the second is a proxy for the first that is wrong whenever
 * the box is small. In a composed box 22% is 118px and twenty-two characters is three lines
 * of them, which made every row half again taller than `rowPitch` predicts, and a ranking
 * sized from a pitch that is not the pitch overflows the box it was cut down to fit.
 */
const LABEL_COLUMN_SHARE = 0.22;

/** How far a non-highlighted bar recedes toward the background. */
const RECEDE = 0.62;
const HIGHLIGHT_FRAMES = 14;

export const BarGroup: React.FC<BarGroupProps> = ({
  data,
  revealFrames,
  highlighted,
  highlightSince,
  primary,
  unit,
  profile,
  orientation,
  gridlines,
  width,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const gap = useSpace(3);
  const labelSize = useTypeSize(0);
  const valueSize = useTypeSize(orientation === 'vertical' ? 2 : 1);

  /**
   * The domain, its headroom and its round numbers all come from `core/scale`, which owns
   * the reasoning. A bar here is a ratio against `span`, and nothing in this file decides
   * what the top of the plot is any more.
   */
  const axis = valueAxis(data.map((d) => d.value));
  const { span, zeroRatio } = axis;
  // Measured unconditionally because it is a hook, and spent only where an axis is drawn:
  // the horizontal branch is a ranking and never draws one, and the vertical branch draws
  // one only when asked. `Gridlines` argues the first decision, `gridlines` carries the
  // second. Reserving the indent with no numbers in it would be a margin, not a gutter.
  const measuredGutter = useAxisGutter(axis, unit);
  const gutter = gridlines ? measuredGutter : 0;

  /**
   * The room one category column has for its name, in canvas px.
   *
   * The columns divide what is left of the plot after the axis indent and the gaps
   * between them, which is arithmetic the layout already does in CSS — restated here
   * because a label has to be cut *before* it is laid out, and by then the column is
   * whatever the label made it.
   */
  const columnWidth =
    orientation === 'horizontal'
      ? width * LABEL_COLUMN_SHARE
      : data.length > 0
        ? Math.max(0, (width - gutter - gap * (data.length - 1)) / data.length)
        : 0;

  /**
   * A category name cut to the column that carries it, measured on the real loaded font.
   *
   * `truncate(label, 14)` used to do this by counting characters, and a character count
   * is a proxy for a width that is wrong in exactly the case that matters: the same
   * fourteen characters that sit comfortably under a 300px column are half again wider
   * than a 60px one. A flex item's minimum size is its min-content width, so the row then
   * sized itself to the labels rather than the other way round and carried the whole plot
   * out of the box with it. Same argument, same remedy and the same `measureText` as
   * `useAxisGutter` one file over: measured, not estimated.
   *
   * A ranking pays for the same mistake on the other axis. Its names sit in a column of
   * their own, and a name that wraps to three lines makes the row three lines tall — so the
   * `rowPitch` the scene aggregates against stops being the pitch, and the ranking it cut
   * down to fit runs off the bottom of the box anyway.
   */
  const labelFor = (label: string): string =>
    truncateToWidth(
      label.toUpperCase(),
      columnWidth,
      (candidate) =>
        measureText({
          text: candidate,
          fontFamily: theme.type.body,
          fontSize: labelSize,
          fontWeight: theme.type.weight.medium,
          letterSpacing: `${theme.type.tracking.wide * labelSize}px`,
        }).width,
    );

  const highlightProgress =
    highlighted === null
      ? 0
      : Math.min(1, Math.max(0, (frame - highlightSince) / HIGHLIGHT_FRAMES));

  /**
   * With no highlight, the series reads as a warm-to-cold ramp. With a highlight, every
   * other bar collapses onto ONE cold neutral rather than a dimmed version of its own
   * hue — five differently-muted hues read as mud, not as a background.
   */
  const colorFor = (index: number, label: string): string => {
    const base = rampColor(theme.color.dataSeries, index, data.length);
    if (highlighted === null) return base;
    if (label === highlighted) return primary;
    const recessive = mix(theme.color.inkMuted, theme.color.bg, RECEDE);
    return mix(base, recessive, highlightProgress);
  };

  const inkFor = (label: string): string => {
    if (highlighted === null) return theme.color.inkMuted;
    return label === highlighted
      ? theme.color.ink
      : mix(theme.color.inkMuted, theme.color.bg, 0.45 * highlightProgress);
  };

  const progressFor = (index: number): number => {
    const at = revealFrames[index];
    if (at === null || at === undefined || frame < at) return 0;
    return spring({ frame: frame - at, fps, config: springConfig(profile) });
  };

  if (orientation === 'horizontal') {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap,
          justifyContent: 'center',
          // The vertical branch below has always had this; the horizontal one had not, so
          // its rows sized the container instead of the other way round and a ranking too
          // tall for its box grew past the frame rather than being cut down to fit.
          minHeight: 0,
        }}
      >
        {data.map((d, i) => {
          const p = progressFor(i);
          const widthRatio = (Math.abs(d.value) / span) * p;
          return (
            <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: gap }}>
              <div
                style={{
                  width: `${LABEL_COLUMN_SHARE * 100}%`,
                  textAlign: 'right',
                  fontFamily: theme.type.body,
                  fontSize: labelSize,
                  fontWeight: theme.type.weight.medium,
                  color: inkFor(d.label),
                  letterSpacing: `${theme.type.tracking.wide * labelSize}px`,
                  textTransform: 'uppercase',
                  opacity: Math.min(1, p * 3),
                }}
              >
                {labelFor(d.label)}
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: gap * 0.6 }}>
                <div
                  style={{
                    height: valueSize * 1.35,
                    width: `${widthRatio * 100}%`,
                    background: colorFor(i, d.label),
                    borderRadius: theme.radius[1],
                  }}
                />
                <div
                  style={{
                    fontFamily: theme.type.display,
                    fontSize: valueSize,
                    fontWeight: theme.type.weight.bold,
                    color:
                      d.label === highlighted || highlighted === null
                        ? theme.color.ink
                        : inkFor(d.label),
                    fontVariantNumeric: 'tabular-nums',
                    opacity: Math.min(1, p * 2),
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatValue(countTo(d.value, p), unit)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    /* `minWidth: 0` for the reason the horizontal branch above gives for its `minHeight`,
       one axis over: without it a flex item's minimum size is its min-content width, so the
       category row sized this container instead of the other way round and a chart too wide
       for its box grew past the frame rather than being cut down to fit. */
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'stretch',
          gap,
          position: 'relative',
          paddingLeft: gutter,
        }}
      >
        {gridlines ? <Gridlines axis={axis} unit={unit} gutter={gutter} /> : null}
        <div
          style={{
            position: 'absolute',
            left: gutter,
            right: 0,
            bottom: `${zeroRatio * 100}%`,
            height: 1,
            background: mix(theme.color.inkMuted, theme.color.bg, 0.72),
          }}
        />
        {data.map((d, i) => {
          const p = progressFor(i);
          const heightRatio = (Math.abs(d.value) / span) * p;
          const bottomRatio = d.value >= 0 ? zeroRatio : zeroRatio - heightRatio;
          const topRatio = bottomRatio + heightRatio;
          return (
            <div key={d.label} style={{ flex: 1, position: 'relative' }}>
              {/*
                With the axis up, only the bar the narration named carries its number: the
                axis already states every other value, and printing all of them over a ruler
                that says the same thing is the clutter the gridlines were drawn to remove.
                With no highlight the chart is then a shape and an axis, which is the
                anchors' default.

                With the axis down, every bar carries its own — the numbers are the only
                quantity left in the frame. This is the pre-axis behaviour, kept reachable
                rather than deleted, because a short shot or a chart squeezed beside a
                callout can read four figures faster than it can read a ruler.
              */}
              {d.label === highlighted || !gridlines ? (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    // Always on the outer end of the bar, so a negative value is labelled
                    // below where it lands rather than back up at the zero line.
                    ...(d.value >= 0
                      ? { bottom: `calc(${topRatio * 100}% + ${valueSize * 0.34}px)` }
                      : { top: `calc(${(1 - bottomRatio) * 100}% + ${valueSize * 0.34}px)` }),
                    textAlign: 'center',
                    fontFamily: theme.type.display,
                    fontSize: valueSize,
                    fontWeight: theme.type.weight.bold,
                    // Only the axis-down branch can reach a number on an unnamed bar, and
                    // that number has to recede with the bar it belongs to or the highlight
                    // stops being a highlight. Same rule the horizontal branch already uses.
                    color:
                      d.label === highlighted || highlighted === null
                        ? theme.color.ink
                        : inkFor(d.label),
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: `${theme.type.tracking.tight * valueSize}px`,
                    opacity: Math.min(1, p * 2),
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatValue(countTo(d.value, p), unit)}
                </div>
              ) : null}
              <div
                style={{
                  position: 'absolute',
                  left: '8%',
                  right: '8%',
                  bottom: `${bottomRatio * 100}%`,
                  height: `${heightRatio * 100}%`,
                  maxWidth: 200,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  background: colorFor(i, d.label),
                  borderRadius:
                    d.value >= 0
                      ? `${theme.radius[1]}px ${theme.radius[1]}px 0 0`
                      : `0 0 ${theme.radius[1]}px ${theme.radius[1]}px`,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Indented with the plot, or a category stops sitting under its own bar. */}
      <div style={{ display: 'flex', gap, marginTop: spaceStep(theme, 2), paddingLeft: gutter }}>
        {data.map((d, i) => {
          const p = progressFor(i);
          return (
            <div
              key={d.label}
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: 'center',
                fontFamily: theme.type.body,
                fontSize: labelSize,
                fontWeight: theme.type.weight.medium,
                color: inkFor(d.label),
                letterSpacing: `${theme.type.tracking.wide * labelSize}px`,
                textTransform: 'uppercase',
                opacity: Math.min(1, p * 3),
              }}
            >
              {labelFor(d.label)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Plain reader, not a hook: it is called from inside render branches. */
const spaceStep = (theme: ReturnType<typeof useTheme>, step: number): number =>
  theme.space[Math.min(theme.space.length - 1, Math.max(0, step))] as number;
