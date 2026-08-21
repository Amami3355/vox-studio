/**
 * How many categories a box can carry at full size.
 *
 * Lifted out of `Component.tsx` because `meta.ts` now *publishes* the answer, and a
 * published number that nothing checks is the defect this file exists to prevent: on
 * 2026-08-21 `constraints.ts` still told an agent that values ranked below the top 8 are
 * collapsed, while a composed box had been collapsing below the top 3 for as long as the
 * composed form had existed. A rule the code stopped obeying, said out loud to the one
 * reader who cannot check it.
 *
 * The arithmetic did not change; only its address did. It is the same expression the
 * component ran inline, reading the same tokens through the same density, so the render
 * and the claim cannot drift apart. `tests/render/composed-capacity.test.ts` is what holds
 * them together.
 */
import { densityFor, type FrameBox } from '../../primitives/SlotFrame';
import type { Theme } from '../../design/theme';
import { barChartGeometry } from './layouts';
import type { BarChartLayoutId } from './layouts';

/** A step of a scale, read through the density a box earns. Mirrors `useTypeSize`/`useSpace`. */
const step = (scale: readonly number[], i: number, density: number): number =>
  Math.round((scale[Math.min(scale.length - 1, Math.max(0, Math.round(i)))] as number) * density);

/** True when the box is portrait enough that the scene draws its composed form. */
export const isComposed = (box: FrameBox): boolean =>
  box.width / box.height < barChartGeometry.composeBelowAspect;

export const barChartCapacity = ({
  box,
  variant,
  theme,
  recommendedMax,
}: {
  box: FrameBox;
  variant: BarChartLayoutId;
  theme: Theme;
  recommendedMax: number;
}): number => {
  if (!isComposed(box)) return recommendedMax;

  const density = densityFor(box);

  /**
   * What one horizontal row costs, from the same tokens `BarGroup` lays it out with: the
   * bar is `valueSize * 1.35` tall and the rows are separated by one `space[3]` gap.
   */
  const rowPitch = step(theme.type.scale, 1, density) * 1.35 + step(theme.space, 3, density);

  /**
   * What one vertical column costs, on the same terms: the room its name needs, plus the
   * gap that separates it from the next.
   *
   * Vertical columns ask the question of the box's *width*, because that is the axis they
   * are laid out along. This used to exclude them by name — *"bounded by width rather than
   * height and not capped here"* — which is true of the bars and false of the labels. The
   * bars did get narrower. The names underneath them did not, and a flex item's minimum
   * size is its min-content width, so the row sized itself to the names and carried the
   * plot 592px into the half the compiler had reserved for something else.
   */
  const columnPitch =
    step(theme.type.scale, 0, density) * barChartGeometry.minLabelEms + step(theme.space, 3, density);

  return Math.max(
    barChartGeometry.minCategories,
    variant === 'horizontal'
      ? Math.floor((box.height * barChartGeometry.chartShare) / rowPitch)
      : Math.floor((box.width * barChartGeometry.chartShare) / columnPitch),
  );
};
