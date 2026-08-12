/**
 * ADR-0003 — slot conflict resolution.
 *
 * The compiler chooses only among alternatives someone declared. This module is that rule
 * and nothing else: a pure function over declarations, with no plan, no frame and no
 * section in sight.
 *
 * The unit is the **scene**, not the (scene, element) pair. One composition holds for the
 * scene's whole duration and every element crossing it is placed against that same
 * composition, so the rectangle a scene renders into and the rectangles its elements
 * occupy cannot contradict one another. Resolving pairs independently is exactly what let
 * a scene be composed into the left half for one element while a second stayed in it.
 */
import { overlaps } from '../core/slots';
import type { Slot } from '../core/types';

export type SceneOccupation = {
  occupies: Slot[];
  supportedCompositions: Slot[];
};

/** One persistent element as the rule sees it: what it asks of this scene, and what else it declared. */
export type ContendingElement = {
  /**
   * Every slot this element occupies during this scene. Usually one; more when the author
   * moved it mid-scene, and then the scene has to clear all of them at once.
   */
  wanted: Slot[];
  /** Slots the same element occupies elsewhere in the same section. */
  declaredElsewhere: Slot[];
};

export type ElementOutcome =
  /** Rung a: the element and the scene were never in each other's way. */
  | { kind: 'keep' }
  /** Rung b: the scene yielded, and this element is one of the reasons why. */
  | { kind: 'sceneYielded' }
  /** Rung c: the element moved to a slot it already occupies in this section. */
  | { kind: 'relocate'; slot: Slot }
  /** Rung d: nothing declared fits. The element is hidden for the scene's duration. */
  | { kind: 'hide' };

export type SceneResolution = {
  /** The composition the scene yielded into, or `null` when it kept the one it declared. */
  composition: Slot | null;
  /** One outcome per element, in the order the elements were given. */
  outcomes: ElementOutcome[];
};

export const resolveSceneConflicts = (
  scene: SceneOccupation,
  elements: ContendingElement[],
): SceneResolution => {
  const contends = (regions: Slot[], slots: Slot[]): boolean =>
    slots.some((slot) => regions.some((region) => overlaps(region, slot)));

  const contended = elements.map((element) => contends(scene.occupies, element.wanted));

  if (!contended.some(Boolean)) {
    return { composition: null, outcomes: elements.map(() => ({ kind: 'keep' })) };
  }

  /**
   * The scene yields first — and it yields for everyone or for no one.
   *
   * A composition is only taken if it clears *every* element crossing the scene, including
   * the ones that were never in the way: yielding into a half that still contains someone
   * would rehouse the conflict rather than resolve it, and yielding for one element while
   * a second must move anyway buys a smaller frame *and* a character that jumps — both
   * repairs, for the benefit of one.
   */
  const wantedByAnyone = elements.flatMap((element) => element.wanted);
  const composition = scene.supportedCompositions.find((slot) => !contends([slot], wantedByAnyone));

  if (composition !== undefined) {
    return {
      composition,
      outcomes: contended.map((did) => (did ? { kind: 'sceneYielded' } : { kind: 'keep' })),
    };
  }

  /**
   * The scene keeps what it declared, so the elements that contend with it move or go.
   *
   * A relocation target must clear the scene *and* everything already standing there: the
   * elements the compiler is not moving hold their authored slots from the start, and each
   * relocation adds its own. Two characters sent to the same free corner would be the slot
   * collision this rule exists to remove, one level down.
   */
  const taken: Slot[] = elements
    .filter((_, index) => !contended[index])
    .flatMap((element) => element.wanted);

  const outcomes = elements.map((element, index): ElementOutcome => {
    if (!contended[index]) return { kind: 'keep' };

    const slot = element.declaredElsewhere.find(
      (candidate) => !contends(scene.occupies, [candidate]) && !contends(taken, [candidate]),
    );
    if (slot === undefined) return { kind: 'hide' };

    taken.push(slot);
    return { kind: 'relocate', slot };
  });

  return { composition: null, outcomes };
};
