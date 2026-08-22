import { scaleLinear } from 'd3-scale';

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
const TICK_COUNT = 5;
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
    ticks: scale.ticks(options.tickCount ?? TICK_COUNT),
    zeroRatio: (0 - min) / span,
    ratio: (value: number) => (value - min) / span,
  };
};
