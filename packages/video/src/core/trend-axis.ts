/**
 * The y-axis of a trend, which is a different domain question from a bar's and the same
 * legibility question.
 *
 * **Why this is not `core/scale.ts`'s `ValueAxis`, despite the matching field names.** A bar
 * measures from zero and its axis is the range it has to cover. A trend may measure from its
 * own extent — `baseline: 'extent'` — where zero can be off the plot entirely, which is what
 * `zeroRatio` exists to say and what a zero-based axis has no way to express. Two shapes with
 * the same fields are still two shapes when one of them can answer a question the other
 * cannot; folding them would mean a bar carrying a `zeroRatio` that is always the same number.
 *
 * **Why the tick count is imported rather than chosen.** It read `5` here with nothing said
 * about it, next to `AXIS_TICKS = 4` in `scale.ts` carrying an argument — *"Ten gridlines is a
 * printed page being read at leisure; a shot lasts seconds and the reader is listening at the
 * same time."* That argument is about the viewer, not about the mark, so it holds for every
 * axis this system draws. A second, quieter number beside it was the copy that goes stale, and
 * there was no counter-argument written for it because there is not one.
 */
import { scaleLinear } from 'd3-scale';
import { AXIS_TICKS } from './scale';

export type TrendBaseline = 'zero' | 'extent';

export type TrendAxis = {
  min: number;
  max: number;
  span: number;
  ticks: number[];
  /** Where zero falls from the bottom edge. It may be outside 0..1 for an extent axis. */
  zeroRatio: number;
  /** Where a value falls from the bottom edge. */
  ratio: (value: number) => number;
};

const HEADROOM_SHARE = 0.1;
const NICE_COUNT = 10;

/**
 * Numeric axis for a temporal plot.
 *
 * This module owns arithmetic only. D3 chooses round domains and ticks, while Vox keeps
 * control of the DOM, labels and animation. A constant series is expanded symmetrically
 * so a flat trend remains drawable instead of collapsing onto a zero-height scale.
 */
export const trendAxis = (
  values: number[],
  baseline: TrendBaseline = 'zero',
  options: { headroom?: number; tickCount?: number } = {},
): TrendAxis => {
  const finite = values.filter(Number.isFinite);
  const observedMin = finite.length === 0 ? 0 : Math.min(...finite);
  const observedMax = finite.length === 0 ? 0 : Math.max(...finite);
  const observedSpan = observedMax - observedMin;
  const headroomShare = options.headroom ?? HEADROOM_SHARE;

  const constantPad = Math.max(Math.abs(observedMax) * headroomShare, 1);
  const pad = observedSpan === 0 ? constantPad : observedSpan * headroomShare;

  let rawMin = observedMin - pad;
  let rawMax = observedMax + pad;

  if (baseline === 'zero') {
    rawMin = observedMin < 0 ? rawMin : 0;
    rawMax = observedMax > 0 ? rawMax : 0;
  }

  if (rawMin === rawMax) {
    rawMin -= 1;
    rawMax += 1;
  }

  const scale = scaleLinear().domain([rawMin, rawMax]).nice(NICE_COUNT);
  const [min = rawMin, max = rawMax] = scale.domain();
  const span = max - min || 1;

  return {
    min,
    max,
    span,
    ticks: scale.ticks(options.tickCount ?? AXIS_TICKS),
    zeroRatio: (0 - min) / span,
    ratio: (value: number) => (value - min) / span,
  };
};
