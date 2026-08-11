/**
 * Bar primitives.
 *
 * Not exposed to the agent. BarChartScene composes these; the agent only ever sees
 * the scene. Degradation lives here: a negative value recomputes the axis instead of
 * drawing below the frame, and a label longer than the column is truncated instead of
 * pushing its neighbours around.
 */
import type React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { countTo, formatValue, truncate } from '../core/format';
import { type MotionProfile, springConfig } from '../design/motion';
import { mix, rampColor } from '../design/theme';
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
};

/** How far a non-highlighted bar recedes toward the background. */
const RECEDE = 0.62;
const HIGHLIGHT_FRAMES = 14;
/** Share of the value range kept clear at each end the data reaches, for value labels. */
const AXIS_HEADROOM = 0.14;

export const BarGroup: React.FC<BarGroupProps> = ({
  data,
  revealFrames,
  highlighted,
  highlightSince,
  primary,
  unit,
  profile,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const gap = useSpace(3);
  const labelSize = useTypeSize(0);
  const valueSize = useTypeSize(orientation === 'vertical' ? 2 : 1);

  const values = data.map((d) => d.value);
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);

  /**
   * Headroom on whichever side the data actually reaches.
   *
   * Without it the extreme bar fills the plot edge to edge and its value label has
   * nowhere to sit: at the top it collides with the headline, at the bottom with the
   * category row. The axis, not the label, is what has to make room.
   */
  const headroom = (rawMax - rawMin || 1) * AXIS_HEADROOM;
  const min = rawMin < 0 ? rawMin - headroom : 0;
  const max = rawMax > 0 ? rawMax + headroom : 0;
  const range = max - min || 1;
  const zeroRatio = (0 - min) / range;

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
        style={{ flex: 1, display: 'flex', flexDirection: 'column', gap, justifyContent: 'center' }}
      >
        {data.map((d, i) => {
          const p = progressFor(i);
          const widthRatio = (Math.abs(d.value) / range) * p;
          return (
            <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: gap }}>
              <div
                style={{
                  width: '22%',
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
                {truncate(d.label, 22)}
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', gap, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: `${zeroRatio * 100}%`,
            height: 1,
            background: mix(theme.color.inkMuted, theme.color.bg, 0.72),
          }}
        />
        {data.map((d, i) => {
          const p = progressFor(i);
          const heightRatio = (Math.abs(d.value) / range) * p;
          const bottomRatio = d.value >= 0 ? zeroRatio : zeroRatio - heightRatio;
          const topRatio = bottomRatio + heightRatio;
          return (
            <div key={d.label} style={{ flex: 1, position: 'relative' }}>
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
                  color:
                    highlighted === null || d.label === highlighted
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

      <div style={{ display: 'flex', gap, marginTop: spaceStep(theme, 2) }}>
        {data.map((d, i) => {
          const p = progressFor(i);
          return (
            <div
              key={d.label}
              style={{
                flex: 1,
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
              {truncate(d.label, 14)}
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
