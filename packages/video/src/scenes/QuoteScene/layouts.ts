/**
 * One layout, on purpose.
 *
 * A second arrangement with its own rhythm would be a different scene, needing its own
 * examples. A quote scene is a typographic frame; the only thing that changes it is how
 * much of the column the type is allowed to take, which the fit already owns.
 */
import type { LayoutDef } from '../../core/types';

export const quoteLayouts = {
  centered: {
    slots: ['eyebrow', 'mark', 'quote', 'attribution'],
    description:
      'Eyebrow over an oversized quotation mark, the quote at display scale, and the ' +
      'attribution below — centred, nothing else on the frame.',
  },
} as const satisfies Record<string, LayoutDef>;

/**
 * Layout-owned geometry. Agents never author these proportions, so none of it appears in
 * `schema.ts`.
 *
 * The mark is one step louder than the quote's fitted step, so it reads as the same
 * statement scaled up rather than as a standalone glyph at a size the quote has to live
 * with. Both steps stay inside the scale the theme actually carries.
 */
export const centeredGeometry = {
  /** Share of the frame box the quote column gets. The mark hangs inside this width. */
  columnRatio: 0.72,
  /** The mark's ceiling — always one louder than the quote, never louder than this. */
  markStep: 6,
} as const;
