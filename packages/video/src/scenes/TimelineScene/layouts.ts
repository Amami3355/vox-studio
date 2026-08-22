/**
 * The arrangements a chronology is drawn in, and the geometry they own.
 *
 * One capability, several layouts branching inside one `Component.tsx` — the shape
 * `bar_chart` already carries. `spine` ships first and alone, because
 * `docs/adding-a-capability.md` says to start with one layout and prove it end to end:
 * `ledger` (a vertical register that buys a real sentence per event) and `lanes` (two
 * threads on one shared axis) are staged behind it and add no field this one does not
 * already carry, except `lanes`, which is why it is last.
 *
 * A fourth arrangement was drawn and **deferred rather than rejected**: a full-bleed
 * playhead sweeping era bands, where a single event holds the frame. That is a different
 * *rhythm*, not a different arrangement, and this doc's own sentence — a second
 * arrangement with its own rhythm is a different scene — is what puts it outside the
 * capability instead of inside it as a fourth layout.
 */
import type { LayoutDef } from '../../core/types';
import type { Theme } from '../../design/theme';
import { type FrameBox, densityFor } from '../../primitives/SlotFrame';

export const timelineLayouts = {
  spine: {
    slots: ['title', 'axis', 'events', 'period', 'annotation'],
    description:
      'A horizontal axis where distance is elapsed time, so the gap between two events is ' +
      'information rather than composition. Use when how long something took is part of ' +
      'what the chronology says.',
  },
} as const satisfies Record<string, LayoutDef>;

export type TimelineLayoutId = keyof typeof timelineLayouts;

export const timelineLayoutIds = Object.keys(timelineLayouts) as TimelineLayoutId[];

export const timelineGeometry = {
  titleMaxStep: 4,
  titleBottomSpace: 2,

  /**
   * Where the axis sits inside the plot, as a share of its height measured from the top.
   *
   * Above it the events, below it the years. Not a half: the labels above carry a date and
   * a sentence and the years below carry four digits, so an even split would leave the
   * bottom two thirds empty and crowd the top.
   */
  axisShare: 0.52,

  /**
   * The room one event's column needs, as a multiple of the date size beneath it.
   *
   * Ten ems of the mono date face is about the width of `18 JUN 2019` at the wide tracking
   * the dates are set in, plus enough beside it for a short label to wrap into two lines
   * rather than five. It is the pitch that decides `timelineCapacity`, so it is the number
   * to move if the published band is wrong — not the band.
   */
  labelEms: 10,

  /**
   * Ordinary event labels may stack this many lanes above the axis before one is dropped.
   *
   * The packer's own limit, restated as the capability's: `layoutDateLabels` lets a
   * required label create a lane and holds ordinary ones to `Math.max(2, lanes.length)`.
   * Published capacity counts **one** lane, because a second lane is the degradation
   * `constraints.onExceed` describes and not room the capability promises.
   */
  labelLanes: 2,

  /** Below three, a chronology has stopped being one — the same judgement as `minCategories`. */
  minEvents: 3,

  /** The most year marks an axis letters before it starts thinning them. */
  maxYearTicks: 8,
} as const;

/** A step of a scale, read through the density a box earns. Mirrors `useTypeSize`/`useSpace`. */
const step = (scale: readonly number[], index: number, density: number): number =>
  Math.round(
    (scale[Math.min(scale.length - 1, Math.max(0, Math.round(index)))] as number) * density,
  );

/**
 * How many events a box can carry with every label on the lane nearest the axis.
 *
 * `constraints.ts` publishes this answer as `events.recommendedMax`. Keeping the
 * calculation beside the geometry the component lays out with is what lets both the render
 * and the code-blind agent's contract read the same arithmetic, so the number an agent is
 * told and the number the frame draws cannot drift apart — the discipline
 * `tests/composed-capacity.test.ts` imposes on `bar_chart`, applied to the field this
 * capability publishes it in.
 *
 * **A floor, not a forecast.** The real capacity moves with the camera allowance, which
 * belongs to the motion profile, so the published figure is the smallest value across every
 * profile and every theme. Warning slightly early is the safe direction: the repair — drop
 * an event, or accept a second label lane — is the same either way.
 */
export const timelineCapacity = ({
  box,
  layout,
  theme,
}: {
  box: FrameBox;
  layout: TimelineLayoutId;
  theme: Theme;
}): number => {
  const density = densityFor(box);

  /**
   * What one event costs along the axis, from the same tokens the component sets its date
   * in: ten ems of the date size, plus the gap that keeps two columns apart.
   */
  const pitch =
    step(theme.type.scale, 0, density) * timelineGeometry.labelEms + step(theme.space, 3, density);

  /** One layout today; the `switch` arrives with `ledger`, whose pitch is vertical. */
  const held = layout === 'spine' ? Math.floor(box.width / pitch) : 0;

  return Math.max(timelineGeometry.minEvents, held);
};
