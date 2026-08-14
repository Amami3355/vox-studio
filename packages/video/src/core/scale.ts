/**
 * The value axis.
 *
 * A bar's height is a ratio, and a ratio is only as honest as the domain it is taken
 * against. Two separate things decide that domain, and conflating them is how an axis
 * ends up arbitrary:
 *
 * 1. **Headroom.** The extreme bar must not reach the plot edge, because its own value
 *    label sits just outside it — at the top that collides with the headline, at the
 *    bottom with the category row. The axis makes the room; the label never moves.
 * 2. **Round numbers.** The anchors this system is judged against — The Economist, FT,
 *    Bloomberg — do not end an axis on 5 743. They end it on 6 000, and their gridlines
 *    fall on values a reader can hold in their head while the shot lasts.
 *
 * Until now only (1) existed, as a flat 14% pad inside `Bar.tsx`, and (2) had no
 * mechanism at all. The pad is still here, because rounding cannot invent headroom — it
 * only ever expands outward, so it can add room and never take it away. What is new is
 * that the rounded domain is what a bar is measured against, and that `ticks` exists,
 * which is the thing a gridline needs and the reason the axis could not be drawn before.
 *
 * **The losing alternative** was to write the rounding by hand and keep the render
 * surface at a single third-party dependency, which is a real property of this package.
 * Rejected: choosing round steps is a 1/2/5×10^k search whose edges are easy to get
 * subtly wrong, and it would be wrong in the direction nobody reviews — a plausible axis.
 * `d3-scale` is arithmetic only. No DOM, no components, and no animation of its own, so
 * it cannot break the rule that a frame is a pure function of its frame number.
 */
import { scaleLinear } from 'd3-scale';

/** Share of the value range kept clear at the end the data reaches, for value labels. */
export const AXIS_HEADROOM = 0.14;

/**
 * Four, not d3's default of ten. Ten gridlines is a printed page being read at leisure;
 * a shot lasts seconds and the reader is listening at the same time.
 */
export const AXIS_TICKS = 4;

/**
 * How finely the domain itself is rounded — deliberately *not* `AXIS_TICKS`.
 *
 * Rounding and labelling are two jobs and they want opposite answers. Round the domain as
 * coarsely as the gridlines and a series topping out at 5 743 pushes the plot to 8 000,
 * which costs the tallest bar a quarter of its height for nothing. Round it finely and
 * the top lands on 7 000, so the chart stays tall and the number is still round. The
 * gridlines are then chosen separately, and sparsely, from that domain.
 */
const AXIS_ROUNDING = 10;

export type ValueAxis = {
  min: number;
  max: number;
  /** `max - min`, never zero, so it is always safe to divide by. */
  span: number;
  /** Where zero sits: 0 is the bottom edge of the plot, 1 the top. */
  zeroRatio: number;
  /** Round values inside the domain, for gridlines and axis labels. */
  ticks: number[];
  /** Where a value sits: 0 is the bottom edge of the plot, 1 the top. */
  ratio: (value: number) => number;
};

/**
 * Zero is always in the domain. A bar chart whose baseline is not zero exaggerates every
 * difference it draws, which is the one chart lie a data-editorial reference will not
 * forgive. A scene that wants to show a narrow band asks for a different capability.
 */
export const valueAxis = (
  values: number[],
  options: { headroom?: number; tickCount?: number } = {},
): ValueAxis => {
  const headroomShare = options.headroom ?? AXIS_HEADROOM;
  const tickCount = options.tickCount ?? AXIS_TICKS;

  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const headroom = (rawMax - rawMin || 1) * headroomShare;

  const padded: [number, number] = [
    rawMin < 0 ? rawMin - headroom : 0,
    rawMax > 0 ? rawMax + headroom : 0,
  ];

  // `nice` only ever moves an end outward, so the headroom above survives it.
  const scale = scaleLinear().domain(padded).nice(AXIS_ROUNDING);
  const [min = 0, max = 0] = scale.domain();
  const span = max - min || 1;

  return {
    min,
    max,
    span,
    zeroRatio: (0 - min) / span,
    // Ends are excluded: a gridline on the top of the plot is a border, and one on the
    // baseline is already drawn by the zero line.
    ticks: scale.ticks(tickCount).filter((tick) => tick > min && tick < max),
    ratio: (value: number) => (value - min) / span,
  };
};
