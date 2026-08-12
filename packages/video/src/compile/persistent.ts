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
import { resolveConflict } from './conflict';
import type { CompiledScene, LayoutState } from './document';

type Window = { from: number; to: number };

export type PersistentLayer = {
  layoutStates: LayoutState[];
  safeAreaOf: Map<string, SafeArea>;
  warnings: CompilerWarning[];
};

export const resolvePersistentLayer = (
  section: VideoPlanSection,
  scenes: CompiledScene[],
  frameBeats: FrameBeat[],
  bounds: Window,
): PersistentLayer => {
  const layoutStates: LayoutState[] = [];
  const safeAreaOf = new Map<string, SafeArea>();
  const warnings: CompilerWarning[] = [];

  for (const element of section.persistent ?? []) {
    const runs = placementRuns(element, frameBeats, bounds);
    const declared = [...new Set(runs.map((run) => run.slot))];

    for (const scene of scenes) {
      const overlapping = runs
        .map((run) => ({ slot: run.slot, ...intersect(run, scene) }))
        .filter((segment) => segment.to > segment.from);

      if (overlapping.length === 0) continue;

      const capability = requireCapability(scene.capabilityId);
      const occupation = {
        occupies: capability.meta.occupiesRegions,
        supportedCompositions: capability.meta.supportedCompositions,
      };

      /**
       * ADR-0003 decision 2: the scene is the unit. Every segment of this element inside
       * this scene is resolved together and the worst outcome wins, because an element
       * that appears and disappears mid-scene reads as a bug rather than as a resolution.
       */
      const outcomes = overlapping.map((segment) =>
        resolveConflict(occupation, {
          wanted: segment.slot,
          declaredElsewhere: declared.filter((slot) => slot !== segment.slot),
        }),
      );

      if (outcomes.some((outcome) => outcome.kind === 'hide')) {
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

      const recomposed = outcomes.find((outcome) => outcome.kind === 'recompose');
      if (recomposed?.kind === 'recompose') {
        safeAreaOf.set(scene.id, slotRect(recomposed.composition));
        warnings.push(
          relocation(section, scene, element, `the scene yields into "${recomposed.composition}"`),
        );
      }

      for (const [index, segment] of overlapping.entries()) {
        const outcome = outcomes[index];
        const slot = outcome?.kind === 'relocate' ? outcome.slot : segment.slot;

        if (outcome?.kind === 'relocate') {
          warnings.push(
            relocation(
              section,
              scene,
              element,
              `the element moves to "${slot}", which it also uses in this section`,
            ),
          );
        }

        layoutStates.push({
          elementId: element.id,
          from: segment.from,
          to: segment.to,
          rect: slotRect(slot),
        });
      }
    }
  }

  return { layoutStates: merge(layoutStates), safeAreaOf, warnings };
};

export const safeAreaFor = (layer: PersistentLayer, sceneId: string): SafeArea =>
  layer.safeAreaOf.get(sceneId) ?? NO_SAFE_AREA;

/**
 * `SLOT_RELOCATED` covers two different repairs. The code alone is ambiguous, and the
 * report is a deliverable rather than a log, so the message says which one happened.
 */
const relocation = (
  section: VideoPlanSection,
  scene: CompiledScene,
  element: PersistentElement,
  repair: string,
): CompilerWarning => ({
  code: 'SLOT_RELOCATED',
  severity: 'info',
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

/**
 * Adjacent states of one element in one place become a single state.
 *
 * Without this a character crossing two scenes is two entries, the runtime remounts it at
 * the boundary, and any entrance animation restarts in the middle of a section — the
 * "character that jumps" arriving through the back door.
 */
const merge = (states: LayoutState[]): LayoutState[] => {
  const sorted = [...states].sort((a, b) => a.from - b.from);
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
