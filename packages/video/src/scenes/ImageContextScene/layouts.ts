/**
 * One layout, on purpose.
 *
 * The increment that added this capability bought breadth of *catalog* — a second
 * structurally different scene — not breadth of variants. A second layout here would be
 * paid for out of the compiler and the continuity test, which is where the remaining
 * unknowns actually live.
 *
 * That is still one layout after `meta.ts` gained `left` and `right`. A composition is not
 * a layout: the agent picks a layout, the compiler picks a composition, and the two must
 * not become the same list. `splitLeft` composed into half a frame is `splitLeft` drawn for
 * the box it was given, not a `stacked` the agent could ask for over the whole canvas —
 * which would be a different scene, with a different rhythm, needing its own examples.
 */
import type { LayoutDef } from '../../core/types';

export const imageContextLayouts = {
  splitLeft: {
    slots: ['image', 'headline', 'caption'],
    description:
      'Editorial image on the left with a concise headline and optional caption on the right. Composed into half a frame, the same three slots stack: plate above, copy below.',
  },
} as const satisfies Record<string, LayoutDef>;

/**
 * Layout-owned geometry. Agents never author these proportions.
 *
 * 7/5 rather than 1/1: an even split reads as a slide, and the asymmetry is what keeps
 * the image the subject and the copy its caption. The stack keeps the same 7/5, turned
 * ninety degrees, so the scene reads as itself in either arrangement.
 */
export const splitLeftGeometry = {
  imageColumns: 7,
  copyColumns: 5,
  imageRows: 7,
  copyRows: 5,

  /**
   * Below this ratio of width to height, the split becomes a stack.
   *
   * The number sits in the gap between the two shapes this scene actually meets: the full
   * canvas is 1.78, and any half of it is 0.89. It is not a tuned threshold — it is the
   * statement that a box narrower than it is tall cannot hold two columns.
   *
   * Why a shape and not a flag: the scene is told the box it got, never the slot the
   * compiler chose (ADR-0003 decision 4 — `safeArea` is the translation, not a second
   * layout system). A `top` composition is 3.56 and stays split, which is right, and it
   * follows from the shape rather than from a list of slots kept in step with `meta.ts`.
   */
  stackBelowAspect: 1.2,
} as const;
