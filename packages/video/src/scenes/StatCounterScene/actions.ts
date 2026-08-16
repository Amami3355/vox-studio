/**
 * Closed action vocabulary. Anything outside this record is a compilation error, never
 * a silence.
 *
 * One verb, and only one, because only one beat decision exists here: whether to hold
 * the number back until the narration says it. A single stat is the whole frame, so there
 * is nothing to point *at* — no `highlight`, no `emphasize`. `bar_chart`'s `highlightBar`
 * and `image_context`'s `emphasize` carry the catalog's pointing weight; a third
 * capability does not need to inherit it, and a deictic verb here could not be
 * illustrated in `examples.ts` anyway (ADR-0012).
 */
import type { ActionDef } from '../../core/types';

export const statCounterActions = {
  revealStat: {
    description:
      'Bring the stat onto the frame. Use it to hold the number back until the ' +
      'narration says it; until then the label carries the frame.',
    payload: null,
  },
} as const satisfies Record<string, ActionDef>;

export type StatCounterSceneActionId = keyof typeof statCounterActions;
