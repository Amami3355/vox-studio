/**
 * TEMPLATE — copy this folder, do not register this scene.
 *
 * At least one layout, each with typed internal slots and a description. Start with one.
 *
 * A composition is not a layout. The agent picks a layout; the compiler picks a
 * composition. Keeping the two lists in step is how they become the same thing, and then
 * neither means anything. If a second arrangement has a different rhythm and needs its own
 * examples, it is a different scene, not a second layout.
 *
 * Layout-owned geometry belongs here too, exported beside the definition. Agents never
 * author proportions, so they never appear in `schema.ts`.
 */
import type { LayoutDef } from '../../core/types';

/** TODO rename the layout and its slots to yours. One layout is the right number to start. */
export const templateSceneLayouts = {
  centered: {
    slots: ['eyebrow', 'statement'],
    description: 'Eyebrow above a single centred statement, with nothing else on the frame.',
  },
} as const satisfies Record<string, LayoutDef>;

/**
 * Geometry the layout owns. Derived from the box the compiler handed the scene, never
 * from the slot it came from — `safeArea` is the translation, not a second layout system
 * (ADR-0003 decision 4).
 */
export const centeredGeometry = {
  /** TODO your own proportions, named after what they mean, not after the number. */
  columnRatio: 0.72,
} as const;
