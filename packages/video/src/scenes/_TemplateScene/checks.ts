/**
 * TEMPLATE — copy this folder, do not register this scene. Delete it if the scene has
 * nothing referential to check.
 *
 * Referential checks the generic validator cannot express. This is where the "renders
 * fine, animates nothing" class of bug gets caught, and it is the only place it can be:
 * the schema sees one field at a time, and the compiler sees frames, not intent.
 *
 * Two live instances of the class to copy from:
 *   - `BarChartScene/checks.ts` — a `highlightBar` naming a label that is not in `data`.
 *   - `ImageContextScene/checks.ts` — an `emphasize` resolving while the plate is held back.
 *
 * Judge **written order, not frames**. ADR-0011 already binds a scene's event list to the
 * order it plays, so reading indices instead of frames lets the check fail at `validate` —
 * before a take exists, and before anyone has paid to record one.
 *
 * Stay quiet where the degraded state is legitimate. An empty series is not an error, and
 * reporting every reference against it drowns the one warning that is true.
 *
 * **TODO: a check is a claim about `Component.tsx`, so verify it against yours.** The
 * refusal below is only true because the stamp is mounted *inside* the statement's gate.
 * Draw the stamp as a sibling instead and the same code rejects plans that render perfectly
 * — a false refusal, which teaches the agent a rule that is not true and is worse than
 * having no check at all (rule 2). Delete this file if your scene has nothing referential
 * to check; an empty `checks` is honest, a wrong one is not.
 */
import type { CompilerError, CompilerWarning, SceneInstance } from '../../core/types';
import { REVEAL_STATEMENT_ACTION } from './state';

export const templateSceneChecks = (
  instance: SceneInstance,
): { errors: CompilerError[]; warnings: CompilerWarning[] } => {
  const errors: CompilerError[] = [];
  const warnings: CompilerWarning[] = [];

  const events = instance.events ?? [];
  const revealsAt = events.findIndex((event) => event.action === REVEAL_STATEMENT_ACTION);
  // No reveal event: the statement opens with the scene, so every emphasis lands on it.
  if (revealsAt === -1) return { errors, warnings };

  const reveal = events[revealsAt];
  for (const [index, event] of events.entries()) {
    if (index >= revealsAt || event.action !== 'emphasizeWord') continue;

    const word = (event.payload as { word?: unknown } | undefined)?.word;
    const stamped = typeof word === 'string' ? `"${word}"` : 'A word';

    errors.push({
      code: 'EVENT_BEFORE_ELEMENT_REVEALED',
      sceneId: instance.id,
      field: `events[${index}].at`,
      message: `${stamped} is stamped at "${event.at}", but the statement does not arrive until "${reveal?.at}". The stamp is drawn inside the statement, so this event would render nothing at all. Move revealStatement to an anchor at or before "${event.at}", or move the emphasis to one at or after "${reveal?.at}".`,
      expected: [reveal?.at ?? ''],
    });
  }

  return { errors, warnings };
};
