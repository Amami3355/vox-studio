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
   * into a 28-second scene is arguably a timing defect, not a layout one. It was not
   * taken because `compile/timings.ts` derives that frame from a word anchor in the
   * narration, so moving it detaches the annotation from the word it names — and the
   * anchor landing on its word is one of the five rows that *passed* the same human
   * verdict. Repairing the layout keeps that intact; repairing the timing would spend it.
   */
  calloutColumns: 34,
  chartColumns: 62,
} as const;
