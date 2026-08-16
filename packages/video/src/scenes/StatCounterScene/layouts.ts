/**
 * One layout, on purpose.
 *
 * A second arrangement with its own rhythm would be a different scene, needing its own
 * examples. A stat scene is a typographic frame; the only thing that changes it is how
 * loud the figure is allowed to be, which the geometry below owns.
 */
import type { LayoutDef } from '../../core/types';

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
   * The value's step on the type scale — the top step. A lone figure is the one element
   * that may go this loud: it is the frame, and there is nothing else to shout over.
   */
  valueStep: 6,
  /**
   * The unit sits this many steps below the value, so it reads as a suffix to the figure
   * rather than a second number. `%` beside `47` is annotation, not a rival.
   */
  unitStepDrop: 3,
} as const;
