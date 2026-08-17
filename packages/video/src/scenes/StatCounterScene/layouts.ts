/**
 * One layout, on purpose.
 *
 * A second arrangement with its own rhythm would be a different scene, needing its own
 * examples. A stat scene is a typographic frame; the only thing that changes it is how
 * loud the figure is allowed to be, which the geometry below owns.
 */
import type { LayoutDef } from '../../core/types';

/**
 * Three slots, in the order the frame draws them.
 *
 * The approved spec listed a fourth, `eyebrow`, carried over from `quote`'s block. It is
 * dropped on purpose: this capability has no `eyebrow` prop and the component draws none,
 * and a slot published for an element that is never on the frame is a placement the agent
 * can anchor a persistent element to and get nothing back. The label is this scene's
 * standing element — the role `quote` gives its eyebrow — so nothing is lost.
 */
export const statCounterLayouts = {
  centered: {
    slots: ['label', 'value', 'sublabel'],
    description:
      'The value at display scale, its unit beside it, and what it counts beneath — ' +
      'centred, nothing else on the frame.',
  },
} as const satisfies Record<string, LayoutDef>;

/**
 * Layout-owned geometry. Agents never author these proportions, so none of it appears in
 * `schema.ts`.
 *
 * The value is one figure, not prose, so it does not climb the length ladder in
 * `titleFit.ts` — that ladder is for strings that wrap, and a figure does not. It is set
 * at a fixed display step and the widest-*value* fit in `Component.tsx` is what keeps a
 * long number inside its column.
 */
export const statGeometry = {
  /**
   * Share of the frame box the stat column gets. Same number the template and `quote`
   * ship: a measure near 0.72 is what puts display-scale type at a readable line length
   * on a 1920 frame. A decision here, not an unedited placeholder.
   */
  columnRatio: 0.72,
  /**
   * Below this ratio of box width to height, the scene draws its composed form.
   *
   * Same number and the same reasoning as `barChartGeometry.composeBelowAspect`: it sits
   * in the gap between the two shapes a scene actually meets, the full frame above it and
   * any half of it below. A shape, never a slot — the scene is told the box it got and
   * never the composition the compiler chose (ADR-0003 decision 4).
   */
  composeBelowAspect: 1.2,
  /**
   * In a composed box the column is the box. `columnRatio` is a measure for a 1920
   * canvas; applying it inside a half-frame box narrows the column a second time, and an
   * 80-character label wraps into a header that has eaten its own scene — ten lines of
   * display type over the figure, measured at the schema ceiling under `pushIn`.
   */
  composedColumnRatio: 1,
  /**
   * …and the label's step ceiling sits this many rungs below the length ladder, the same
   * move `BarChartScene` makes for its title. The value keeps `valueStep` as its ceiling
   * in both forms: a figure does not wrap, and the widest-value fit already answers the
   * narrower column.
   */
  composedStepDrop: 1,
  /**
   * The value's step on the type scale — the top step. A lone figure is the one element
   * that may go this loud: it is the frame, and there is nothing else to shout over.
   */
  valueStep: 6,
  /**
   * The unit sits this many steps below the value, so it reads as a suffix to the figure
   * rather than a second number. `%` beside `47` is annotation, not a rival.
   */
  unitStepDrop: 3,
  /**
   * The gap between the figure and its unit, as a share of the *unit's* own size. It is a
   * proportion rather than a spacing token because the pair has to read as one word at any
   * step: a fixed token that looks right at step 3 is a chasm at step 6.
   */
  unitGap: 0.18,
} as const;
