/**
 * The value axis, drawn.
 *
 * A gridline is not decoration. It is what lets a viewer read a bar as a *quantity*
 * instead of as a length, and it is the difference between a chart and a slide with
 * rectangles on it. The anchors this system is judged against — The Economist, FT,
 * Bloomberg — all draw one, and none of them also print the number on top of every bar.
 * Carrying both is the same fact twice, and in a shot lasting seconds the reader pays for
 * it in eye travel.
 *
 * **Vertical orientation only, and that is a decision, not an omission.** A horizontal bar
 * chart in this system is a ranking: the rows are the subject, the value sits at the end
 * of its own bar where the eye already is, and an axis underneath asks the reader to
 * travel down and back for a number they were just handed. The losing alternative — draw
 * gridlines in both orientations for consistency — was rejected because consistency
 * between two charts that answer different questions is not a virtue.
 *
 * The gutter is measured, not estimated. `22 000` and `2.5` do not need the same room, and
 * a fixed indent is either wasteful on one or clipping on the other.
 */
import { measureText } from '@remotion/layout-utils';
import type React from 'react';
import { useMemo } from 'react';
import { formatValue } from '../core/format';
import type { ValueAxis } from '../core/scale';
import { mix } from '../design/theme';
import { useSpace, useTheme, useTypeSize } from './ThemeContext';

/**
 * How far a gridline recedes toward the ground.
 *
 * Fainter than the zero line's 0.72 on purpose: zero is a fact about the data, a gridline
 * is a ruler held up behind it, and a ruler that competes with the bars has failed.
 */
const GRID_RECEDE = 0.86;

/** Space between the axis numbers and the plot they measure. */
const GUTTER_STEP = 2;

/**
 * The room the axis numbers need, in px, measured on the real loaded font.
 *
 * Exported because the plot and the category row underneath it must both be indented by
 * the same amount, or the bars stop sitting over their own labels.
 */
export const useAxisGutter = (axis: ValueAxis, unit: string): number => {
  const theme = useTheme();
  const size = useTypeSize(0);
  const pad = useSpace(GUTTER_STEP);

  return useMemo(() => {
    if (axis.ticks.length === 0) return 0;
    const widest = axis.ticks.reduce((wide, tick) => {
      const width = measureText({
        text: formatValue(tick, unit),
        fontFamily: theme.type.body,
        fontSize: size,
        fontWeight: theme.type.weight.medium,
        letterSpacing: `${theme.type.tracking.wide * size}px`,
      }).width;
      return Math.max(wide, width);
    }, 0);
    return Math.ceil(widest) + pad;
    // `size` and `pad` already carry the density, so it is not a dependency of its own.
  }, [axis.ticks, unit, theme, size, pad]);
};

export type GridlinesProps = {
  axis: ValueAxis;
  unit: string;
  /** Left indent the plot already reserves for the numbers, from `useAxisGutter`. */
  gutter: number;
};

/**
 * Absolutely positioned, so it consumes no flex space and cannot move a bar. Mount it as
 * the first child of the plot box; the bars draw over it.
 */
export const Gridlines: React.FC<GridlinesProps> = ({ axis, unit, gutter }) => {
  const theme = useTheme();
  const size = useTypeSize(0);

  if (axis.ticks.length === 0) return null;

  const line = mix(theme.color.inkMuted, theme.color.bg, GRID_RECEDE);
  const ink = mix(theme.color.inkMuted, theme.color.bg, 0.35);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {axis.ticks.map((tick) => {
        const bottom = `${axis.ratio(tick) * 100}%`;
        return (
          <div key={tick}>
            <div
              style={{
                position: 'absolute',
                left: gutter,
                right: 0,
                bottom,
                height: 1,
                background: line,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                bottom,
                width: Math.max(0, gutter - 1),
                // Centres the number on its own line rather than resting it on top.
                transform: 'translateY(50%)',
                textAlign: 'right',
                fontFamily: theme.type.body,
                fontSize: size,
                fontWeight: theme.type.weight.medium,
                color: ink,
                letterSpacing: `${theme.type.tracking.wide * size}px`,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {formatValue(tick, unit)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
