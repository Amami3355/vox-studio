import type { CompilerError, CompilerWarning, SceneInstance } from '../../core/types';
import { ACCENT_CHARACTER_ACTION, REVEAL_CHARACTER_ACTION } from './state';

/**
 * Referential checks the generic validator cannot express.
 *
 * The rule judges **written order, never frames**. ADR-0011 binds a scene's event list
 * to the order it plays, so reading indices lets the check fail at `validate` — before a
 * take exists, and before anyone has paid to record one. An `accentCharacter` written
 * before an explicitly declared `revealCharacter` would pulse a figure that is still
 * held back: nothing is on the frame to emphasise, which is the "renders fine, animates
 * nothing" species this file exists to catch.
 *
 * Verified against `Component.tsx`: the accent envelope reads `characterFrame` and
 * renders nothing while it is `null`, exactly the mount dependency the refusal claims.
 * With no `revealCharacter` event at all, the character opens with the scene and every
 * accent lands on it — so the check stays quiet there rather than refusing a plan that
 * renders perfectly.
 *
 * Nothing is checked between the two reveals. They are independent entrances with no
 * order the component could violate, and a rule against one of the two orders would
 * teach the agent a constraint that does not exist.
 */
export const characterExplainerChecks = (
  instance: SceneInstance,
): { errors: CompilerError[]; warnings: CompilerWarning[] } => {
  const errors: CompilerError[] = [];
  const warnings: CompilerWarning[] = [];

  const events = instance.events ?? [];
  const revealsAt = events.findIndex((event) => event.action === REVEAL_CHARACTER_ACTION);
  // No reveal event: the character opens with the scene, so every accent lands on it.
  if (revealsAt === -1) return { errors, warnings };

  const reveal = events[revealsAt];
  for (const [index, event] of events.entries()) {
    if (index >= revealsAt || event.action !== ACCENT_CHARACTER_ACTION) continue;

    errors.push({
      code: 'EVENT_BEFORE_ELEMENT_REVEALED',
      sceneId: instance.id,
      field: `events[${index}].at`,
      message:
        `An accentCharacter at "${event.at}" would emphasise a character that is not on the frame: ` +
        `revealCharacter does not arrive until "${reveal?.at}", and the cutout is held back before then. ` +
        `Move the accent to an anchor at or after "${reveal?.at}", or remove the explicit reveal so the character enters with the scene.`,
      expected: [reveal?.at ?? ''],
    });
  }

  return { errors, warnings };
};
