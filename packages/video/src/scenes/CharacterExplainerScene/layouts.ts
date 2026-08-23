/**
 * One layout, on purpose.
 *
 * A composition is not a layout. The agent picks a layout; the compiler picks a
 * composition. This capability declares only the full frame — see `meta.ts` for why a
 * half is not inferred by shrinking — so `sideBySide` is drawn for one shape of box and
 * says so.
 *
 * Layout-owned geometry belongs here too, exported beside the definition. Agents never
 * author proportions, so they never appear in `schema.ts`.
 */
import type { LayoutDef } from '../../core/types';

export const characterExplainerLayouts = {
  sideBySide: {
    slots: ['character', 'label', 'headline', 'explanation'],
    description:
      'A dominant contained character cutout standing on one side of the frame, a bounded copy column on the other. The proportions are the layout’s, never the plan’s.',
  },
} as const satisfies Record<string, LayoutDef>;

/**
 * Geometry the layout owns.
 *
 * 7/5 rather than 1/1, for the same reason `image_context` split the same way: an even
 * split reads as a slide, and the asymmetry is what keeps the figure the subject and the
 * copy its caption.
 *
 * `motionAllowance` is the containment contract: the share of the character cell
 * reserved around the contained cutout so the entrance, the ambient drift and the accent
 * gesture can never carry the silhouette out of the live frame. The scene's motion
 * spends fractions of it (`ambientShare`, `accentShare`) rather than inventing its own
 * bounds, which is what makes the allowance a budget the render sweeps can hold rather
 * a number the component happens to stay under.
 */
export const sideBySideGeometry = {
  characterColumns: 7,
  copyColumns: 5,
  motionAllowance: 0.06,
  ambientShare: 0.25,
  accentShare: 0.5,
  /** Whole-cutout tilts, in degrees: a stance, not a skeleton. */
  ambientTiltDegrees: 0.5,
  accentTiltDegrees: 1.2,
} as const;
