/**
 * ADR-0003 — slot conflict resolution.
 *
 * The compiler chooses only among alternatives someone declared. This module is that
 * rule and nothing else: a pure function over four declared facts.
 */
import { overlaps } from '../core/slots';
import type { Slot } from '../core/types';

export type ConflictOutcome =
  | { kind: 'keep' }
  /** The scene yields into a composition it declared support for. */
  | { kind: 'recompose'; composition: Slot }
  /** The element moves to a slot it already occupies elsewhere in the section. */
  | { kind: 'relocate'; slot: Slot }
  /** Nothing declared fits. The element is hidden for the scene's duration. */
  | { kind: 'hide' };

export type SceneOccupation = {
  occupies: Slot[];
  supportedCompositions: Slot[];
};

export type ElementPlacement = {
  /** The slot the author placed this element in over this scene. */
  wanted: Slot;
  /** Slots the same element occupies elsewhere in the same section. */
  declaredElsewhere: Slot[];
};

export const resolveConflict = (
  scene: SceneOccupation,
  element: ElementPlacement,
): ConflictOutcome => {
  if (!scene.occupies.some((region) => overlaps(region, element.wanted))) {
    return { kind: 'keep' };
  }

  /**
   * The scene yields first. A scene composed into an alternative it declared is a frame
   * somebody designed; a relocated element is §9.3's "character that jumps", authored by
   * the compiler. Where both are possible, prefer the one that was drawn on purpose.
   */
  const composition = scene.supportedCompositions.find((c) => !overlaps(c, element.wanted));
  if (composition) return { kind: 'recompose', composition };

  /**
   * Only among slots the element already occupies in this section. Any free slot would be
   * the same improvisation as an undeclared carve, applied to the element instead of the
   * scene — the character would appear somewhere no one ever placed it.
   */
  const slot = element.declaredElsewhere.find(
    (candidate) => !scene.occupies.some((region) => overlaps(region, candidate)),
  );
  if (slot) return { kind: 'relocate', slot };

  return { kind: 'hide' };
};
