/**
 * Internal composition variants.
 *
 * A composite scene is one component with several internal layouts and typed slots —
 * never a component that contains other scenes. Free nesting would make the safe-area
 * computation recursive and the studio's unit of editing ambiguous.
 *
 * Internal slots accept typed primitives (text, value, annotation, asset), not scenes.
 */
import type { LayoutDef } from '../../core/types';
import type { Theme } from '../../design/theme';
import { type FrameBox, densityFor } from '../../primitives/SlotFrame';

export const barChartLayouts = {
  standard: {
    slots: ['title', 'chart'],
    description: 'Vertical columns under a headline. The default reading order.',
  },
  horizontal: {
    slots: ['title', 'chart'],
    description:
      'Horizontal bars with labels on the left. Use for long category names or for a ranking.',
  },
  withCallout: {
    slots: ['title', 'chart', 'annotation'],
    description:
      'Chart on the left, with an annotation column on the right that opens when an ' +
      '`annotate` event lands and stays closed before it. Use when the scene carries an ' +
      '`annotate` event.',
  },
} as const satisfies Record<string, LayoutDef>;

export type BarChartLayoutId = keyof typeof barChartLayouts;

export const barChartLayoutIds = Object.keys(barChartLayouts) as BarChartLayoutId[];

/**
 * Layout-owned geometry for the *composed* form. Agents never author these, and none of
 * them is a layout: all three arrangements above keep their identity in half a frame.
 *
 * `meta.ts` has claimed `left` and `right` since the first scaffold commit, and nothing
 * was ever drawn for them. `tests/render/safe-area.test.ts` found what that bought:
 * `example-long-ranking` composed into a half put a 68-character title through five lines
 * of display type, which left the nine rows below it less height than they need, and the
 * ranking ran off the bottom of the canvas. Legal — the scene stayed inside its half —
 * and unreadable, which is exactly the frame ADR-0003 called "squeezed, silently and
 * legally".
 *
 * The composed form is the same chart drawn for a portrait box: a title that labels
 * rather than declaims, and as many categories as the box can hold at full size. Both
 * are degradations the capability already publishes — `TITLE_DENSITY` and the `Others`
 * bucket — applied on the box's terms instead of only on the string's.
 */
export const barChartGeometry = {
  /**
   * Below this ratio of width to height, the scene draws its composed form.
   *
   * Same number and the same reasoning as `splitLeftGeometry.stackBelowAspect`: it sits
   * in the gap between the two shapes a scene actually meets, with the full frame above
   * it and any half of it below. A shape, never a slot — the scene is told the box it got
   * and never the composition the compiler chose (ADR-0003 decision 4).
   */
  composeBelowAspect: 1.2,

  /**
   * …and in that composed box the title's step ceiling sits this many rungs below the
   * length ladder. The same move `QuoteScene` and `StatCounterScene` make, through the
   * shared `composedStepCeiling`; the number is each scene's own because what a rung costs
   * depends on what else the frame is carrying.
   */
  composedStepDrop: 1,

  /**
   * Share of a composed box the chart may count on when deciding how many categories it
   * can carry. The rest is the header — its rule, its title, and the margin under it —
   * plus any annotation the scene is holding.
   *
   * A proxy, and deliberately a pessimistic one. The exact figure is the title's wrapped
   * height, which is not knowable without measuring the DOM, and a scene that guesses high
   * overflows the canvas while a scene that guesses low merely aggregates one category
   * early. Only one of those two errors is visible to a viewer.
   */
  chartShare: 0.55,

  /**
   * Below three, a ranking has stopped being a ranking. If a box cannot hold three
   * categories at full size the honest outcome is a tight frame, not a two-bar chart:
   * the aggregation stops here and `Others` carries the rest.
   */
  minCategories: 3,

  /**
   * The room one vertical column needs for its name, as a multiple of the label size.
   *
   * `capacity` used to ask this question of height only, and excluded vertical columns by
   * name: *"bounded by width rather than height and not capped here — at `maxWidth: 200`
   * per column, eight of them ask for 1600px and a half frame gives 537, so they simply
   * get narrower."* True of the bars and false of the labels. The bars did get narrower;
   * the category names underneath them did not, and a flex item's minimum size is its
   * min-content width, so the row sized itself to the names and carried the plot 592px
   * into the half the compiler had reserved for something else.
   *
   * Four ems is roughly six uppercase characters at the wide tracking the labels are set
   * in — enough to name a category, and the point below which a name is an abbreviation
   * of an abbreviation. A box that cannot give every column that much is a box with too
   * many columns in it, and the answer is the aggregation the capability already
   * publishes rather than a new degradation.
   */
  minLabelEms: 4,

  /**
   * The `withCallout` split, as flex shares of the row. They do not sum to 100: the
   * remainder is the gap.
   *
   * Reached only when the annotation is actually on screen. `withCallout` used to mount
   * the right-hand column unconditionally and fill it only once an `annotate` event had
   * fired, which cost the chart 34% of its width for the entire scene. On the shipped
   * Northbridge run that was 799 frames of empty canvas out of 833 in `weekday-boardings`
   * and 694 out of 728 in `pilot-budget` — a third of the frame held in reserve for
   * roughly one second of use, and the first named offending element behind ticket 22's
   * refused system-premium row.
   *
   * The rejected alternative was to move the event instead: an annotation anchored 96%
   * into a 28-second scene is arguably a timing defect, not a layout one.
   *
   * **The reason first recorded here for rejecting it was wrong, and is corrected
   * 2026-08-15.** It said the frame came from a word anchor, so moving the event would
   * detach the annotation from the word it names. It does not. Both plans write
   * `annotate` at `<beat>.end-long`, which is a boundary anchor — the end of the beat
   * less `motion.duration.slow`, 34 frames, 1.13 s — and 799 = 833 − 34 and 694 = 728 − 34
   * are that arithmetic and nothing else. There is no word to detach from. Word anchors
   * are used in the same scene, for `revealAll` (`b2.word:January`) and `highlightBar`
   * (`b2.word:March`), which is where the mistake came from.
   *
   * The layout repair still stands on its own: a column reserved before it is occupied is
   * wrong whatever the timing does. What changes is that **the timing is reopenable**, and
   * that the interesting half of it is upstream of both.
   *
   * **Second correction, 2026-08-15.** This comment then said "from `end` the agent's
   * entire vocabulary is `-short` and `-long`, so 'well before the end of this beat' is a
   * sentence the grammar cannot say". Also false. It is true of the *boundary* branch —
   * whose offsets are absolute frame counts, so in b2's 833 frames it reaches eleven frames
   * in three knots and leaves 84% of the beat out of range — but word anchors reach any
   * word onset and are open to any event, `deicticFields` being an obligation rather than a
   * permission. `b2.word:steady` is frame 584 and `b6.word:leaving` is 292, each the onset
   * of the sentence justifying its own annotation, 7.2 s and 13.4 s earlier than what was
   * written. The same plan anchors `revealAll` at `b2.word:January` with no deictic field
   * declared. See ADR-0009: the grammar does not widen, and the repair is two anchor
   * strings in a plan we do not own.
   */
  calloutColumns: 34,
  chartColumns: 62,
} as const;

/** A step of a scale, read through the density a box earns. Mirrors `useTypeSize`/`useSpace`. */
const step = (scale: readonly number[], index: number, density: number): number =>
  Math.round(
    (scale[Math.min(scale.length - 1, Math.max(0, Math.round(index)))] as number) * density,
  );

/** True when the box is portrait enough that the scene draws its composed form. */
export const isComposed = (box: FrameBox): boolean =>
  box.width / box.height < barChartGeometry.composeBelowAspect;

/**
 * How many categories a box can carry at full size.
 *
 * `meta.ts` publishes this answer. Keeping the calculation with the layout-owned geometry
 * lets both the component and `tests/composed-capacity.test.ts` read the same arithmetic,
 * so the render and the code-blind agent's contract cannot drift apart.
 */
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
   * gap that separates it from the next. Width is the bounding axis because the labels,
   * unlike the bars, cannot shrink below their min-content width without truncation.
   */
  const columnPitch =
    step(theme.type.scale, 0, density) * barChartGeometry.minLabelEms +
    step(theme.space, 3, density);

  return Math.max(
    barChartGeometry.minCategories,
    variant === 'horizontal'
      ? Math.floor((box.height * barChartGeometry.chartShare) / rowPitch)
      : Math.floor((box.width * barChartGeometry.chartShare) / columnPitch),
  );
};
