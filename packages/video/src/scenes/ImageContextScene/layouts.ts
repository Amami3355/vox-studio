/**
 * One layout, on purpose.
 *
 * The increment that added this capability bought breadth of *catalog* — a second
 * structurally different scene — not breadth of variants. A second layout here would be
 * paid for out of the compiler and the continuity test, which is where the remaining
 * unknowns actually live.
 */
import type { LayoutDef } from '../../core/types';

export const imageContextLayouts = {
  splitLeft: {
    slots: ['image', 'headline', 'caption'],
    description:
      'Editorial image on the left with a concise headline and optional caption on the right.',
  },
} as const satisfies Record<string, LayoutDef>;

/**
 * Layout-owned geometry. Agents never author these proportions.
 *
 * 7/5 rather than 1/1: an even split reads as a slide, and the asymmetry is what keeps
 * the image the subject and the copy its caption.
 */
export const splitLeftGeometry = {
  imageColumns: 7,
  copyColumns: 5,
} as const;
