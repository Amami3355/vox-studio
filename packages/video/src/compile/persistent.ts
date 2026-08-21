/**
 * The persistent layer of one section: where each element is, when, and what it costs the
 * scenes it crosses.
 *
 * This is ADR-0003 applied to a plan. The *rule* lives in `conflict.ts` and knows nothing
 * about frames; this module knows about frames and knows nothing about the rule beyond
 * the four outcomes it returns.
 */
import type { VideoPlanSection } from '../catalog/validate';
import { type FrameBeat, resolveAnchor } from '../core/anchors';
import { slotRect } from '../core/slots';
import {
  type CompilerWarning,
  NO_SAFE_AREA,
  type PersistentElement,
  type SafeArea,
  type Slot,
} from '../core/types';
import { requireCapability } from '../scenes/registry';
import { capacityOutcome, reducesData } from './capacity';
import { type ElementOutcome, resolveSceneConflicts } from './conflict';
import type { CompiledScene, LayoutState } from './document';

type Window = { from: number; to: number };

export type PersistentLayer = {
  layoutStates: LayoutState[];
  safeAreaOf: Map<string, SafeArea>;
  compositionOf: Map<string, Slot>;
  warnings: CompilerWarning[];
};

export const resolvePersistentLayer = (
  section: VideoPlanSection,
  scenes: CompiledScene[],
  frameBeats: FrameBeat[],
  bounds: Window,
): PersistentLayer => {
  const elements = section.persistent ?? [];
  const runsOf = new Map(
    elements.map((element) => [element.id, placementRuns(element, frameBeats, bounds)]),
  );

  const layoutStates: LayoutState[] = [];
  const safeAreaOf = new Map<string, SafeArea>();
  /**
   * The slot the scene yielded into, kept rather than discarded.
   *
   * `safeAreaOf` already carries its *rectangle*, and for the renderer that is the whole
   * story — the component is told the box it got and never the composition (ADR-0003
   * decision 4). But the compiler has one more question to ask of the composition itself:
   * whether the capability publishes a smaller capacity for it. Deriving the slot back out
   * of a rectangle would be a second reading of `slots.ts`, which is the drift decision 5
   * exists to prevent, so the answer is simply not thrown away.
   */
  const compositionOf = new Map<string, Slot>();
  const warnings: CompilerWarning[] = [];

  /**
   * ADR-0003 decision 2: the scene is the unit, for every element at once. The loop is
   * over scenes rather than over elements because one scene has one composition, and a
   * composition chosen for one element that another element still sits in is the overlap
   * this rule exists to prevent.
   */
  for (const scene of scenes) {
    const crossing = elements
      .map((element) => ({
        element,
        segments: (runsOf.get(element.id) ?? [])
          .map((run) => ({ slot: run.slot, ...intersect(run, scene) }))
          .filter((segment) => segment.to > segment.from),
      }))
      .filter((entry) => entry.segments.length > 0);

    if (crossing.length === 0) continue;

    const { meta } = requireCapability(scene.capabilityId);
    const resolution = resolveSceneConflicts(
      { occupies: meta.occupiesRegions, supportedCompositions: meta.supportedCompositions },
      crossing.map(({ element, segments }) => {
        const here = distinct(segments.map((segment) => segment.slot));
        return {
          wanted: here,
          declaredElsewhere: distinct((runsOf.get(element.id) ?? []).map((run) => run.slot)).filter(
            (slot) => !here.includes(slot),
          ),
        };
      }),
    );

    if (resolution.composition !== null) {
      safeAreaOf.set(scene.id, slotRect(resolution.composition));
      compositionOf.set(scene.id, resolution.composition);
    }

    for (const [index, { element, segments }] of crossing.entries()) {
      const outcome = resolution.outcomes[index] as ElementOutcome;

      if (outcome.kind === 'hide') {
        warnings.push({
          code: 'PERSISTENT_ELEMENT_HIDDEN',
          severity: 'important',
          sceneId: scene.id,
          sectionId: section.id,
          field: `persistent[${element.id}]`,
          message: `"${element.id}" is hidden for the duration of "${scene.id}": the scene declares no composition it can yield into, and the element declares no other slot that clears it.`,
          suggestion:
            'Give the capability a layout it can be composed into and declare that composition, or place the element in a slot it also uses elsewhere in this section.',
        });
        continue;
      }

      if (outcome.kind === 'sceneYielded') {
        /**
         * A yield that merely moves a badge is information. A yield that costs the scene
         * half its categories is not, and reporting both at `info` is what let the second
         * hide behind the first for as long as it did. The consequence is asked of
         * `capacity.ts` rather than worked out here, so that this severity and the
         * `CAPACITY_REDUCED_BY_COMPOSITION` the compiler emits can never disagree.
         */
        const costly = reducesData(capacityOutcome(scene, resolution.composition));
        warnings.push(
          relocation(
            section,
            scene,
            element,
            `the scene yields into "${resolution.composition as Slot}"`,
            costly ? 'quality' : 'info',
          ),
        );
      }

      if (outcome.kind === 'relocate') {
        warnings.push(
          relocation(
            section,
            scene,
            element,
            `the element moves to "${outcome.slot}", which it also uses in this section`,
          ),
        );
      }

      /**
       * A relocated element takes one slot for the scene's whole duration, so its segments
       * inside this scene collapse onto it; anything else kept the slots it was authored
       * into, including a move the author asked for mid-scene.
       */
      for (const segment of segments) {
        layoutStates.push({
          elementId: element.id,
          from: segment.from,
          to: segment.to,
          rect: slotRect(outcome.kind === 'relocate' ? outcome.slot : segment.slot),
        });
      }
    }
  }

  return { layoutStates: merge(layoutStates), safeAreaOf, compositionOf, warnings };
};

export const safeAreaFor = (layer: PersistentLayer, sceneId: string): SafeArea =>
  layer.safeAreaOf.get(sceneId) ?? NO_SAFE_AREA;

/** The composition a scene yielded into, or null when it kept the whole canvas. */
export const compositionFor = (layer: PersistentLayer, sceneId: string): Slot | null =>
  layer.compositionOf.get(sceneId) ?? null;

/**
 * `SLOT_RELOCATED` covers two different repairs. The code alone is ambiguous, and the
 * report is a deliverable rather than a log, so the message says which one happened.
 */
const relocation = (
  section: VideoPlanSection,
  scene: CompiledScene,
  element: PersistentElement,
  repair: string,
  severity: 'info' | 'quality' = 'info',
): CompilerWarning => ({
  code: 'SLOT_RELOCATED',
  severity,
  sceneId: scene.id,
  sectionId: section.id,
  field: `persistent[${element.id}]`,
  message: `"${element.id}" contends with "${scene.id}", so ${repair}.`,
});

/**
 * A placement holds until the next one, and the element does not exist before its first.
 * Reading a placement as a keyframe rather than as a range is what lets the agent write
 * two of them and get a move rather than a gap.
 */
const placementRuns = (
  element: PersistentElement,
  frameBeats: FrameBeat[],
  bounds: Window,
): (Window & { slot: Slot })[] => {
  const keyframes = element.placements
    .map((placement) => ({
      slot: placement.slot,
      at: resolveAnchor(placement.at, frameBeats, bounds),
    }))
    .sort((a, b) => a.at - b.at);

  return keyframes.map((keyframe, index) => ({
    slot: keyframe.slot,
    from: keyframe.at,
    to: keyframes[index + 1]?.at ?? bounds.to,
  }));
};

const intersect = (a: Window, b: Window): Window => ({
  from: Math.max(a.from, b.from),
  to: Math.min(a.to, b.to),
});

const distinct = <T>(values: T[]): T[] => [...new Set(values)];

/**
 * Adjacent states of one element in one place become a single state.
 *
 * Without this a character crossing two scenes is two entries, the runtime remounts it at
 * the boundary, and any entrance animation restarts in the middle of a section — the
 * "character that jumps" arriving through the back door.
 *
 * Grouped by element before being ordered by time, because two elements sorted by time
 * alone interleave, and interleaved states are never adjacent to their own predecessor:
 * the merge would silently stop happening the moment a section held a second element.
 */
const merge = (states: LayoutState[]): LayoutState[] => {
  const sorted = [...states].sort(
    (a, b) => a.elementId.localeCompare(b.elementId) || a.from - b.from,
  );
  const merged: LayoutState[] = [];

  for (const state of sorted) {
    const previous = merged.at(-1);
    const continues =
      previous?.elementId === state.elementId &&
      previous?.to === state.from &&
      JSON.stringify(previous?.rect) === JSON.stringify(state.rect);

    if (previous && continues) previous.to = state.to;
    else merged.push({ ...state });
  }

  return merged;
};
