import type { CompilerError, CompilerWarning, SceneInstance } from '../../core/types';
import { REVEAL_IMAGE_ACTION } from './state';

/**
 * The stamp needs something to be stamped onto.
 *
 * `Component.tsx` mounts `Stamp` inside the image plate's `Reveal`, so an `emphasize` that
 * resolves while the plan is still holding the plate back has nowhere to land: the plan
 * validates, the scene renders, and the emphasis is silently absent. `actions.ts` names
 * that shape — "a plan that validates, renders perfectly and animates nothing" — as the
 * architecture's most dangerous failure, and `SceneCapability.checks` is where its own type
 * says the class gets caught. This is the second instance of it in the catalog, after
 * `bar_chart`'s dangling `highlightBar` label.
 *
 * Judged on **written order**, not on frames, and that is a stronger check rather than a
 * weaker one. ADR-0011 already binds a scene's event list to the order it plays, so an
 * `emphasize` written above its `revealImage` is either the defect this reports or the
 * defect `EVENTS_OUT_OF_ORDER` reports — there is no arrangement that is wrong here and
 * right there. Reading indices instead of frames is what lets it fail at `validate`, before
 * a take exists and before anyone has paid to record one.
 *
 * Silent when the scene carries no `revealImage`: the plate then opens with the scene on
 * the motion profile's own terms, and every emphasis lands on a plate that is already there.
 */
export const imageContextChecks = (
  instance: SceneInstance,
): { errors: CompilerError[]; warnings: CompilerWarning[] } => {
  const errors: CompilerError[] = [];
  const warnings: CompilerWarning[] = [];

  const events = instance.events ?? [];
  const revealsAt = events.findIndex((event) => event.action === REVEAL_IMAGE_ACTION);
  if (revealsAt === -1) return { errors, warnings };

  const reveal = events[revealsAt];
  for (const [index, event] of events.entries()) {
    if (index >= revealsAt || event.action !== 'emphasize') continue;

    const text = (event.payload as { text?: unknown } | undefined)?.text;
    const stamped = typeof text === 'string' ? `"${text}"` : 'A word';

    errors.push({
      code: 'EVENT_BEFORE_ELEMENT_REVEALED',
      sceneId: instance.id,
      field: `events[${index}].at`,
      message: `${stamped} is stamped at "${event.at}", but the image plate does not arrive until "${reveal?.at}". The stamp is drawn on the plate, so this event would render nothing at all. Move revealImage to an anchor at or before "${event.at}", or move the emphasis to one at or after "${reveal?.at}".`,
      expected: [reveal?.at ?? ''],
    });
  }

  return { errors, warnings };
};
