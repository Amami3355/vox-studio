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
      'Chart on the left, a reserved annotation column on the right. Use when the scene ' +
      'carries an `annotate` event.',
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
} as const;
