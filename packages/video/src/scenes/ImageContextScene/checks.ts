import type { CompilerError, CompilerWarning, SceneInstance } from '../../core/types';
import { REVEAL_IMAGE_ACTION } from './state';

/**
 * Emphasis refers to an image that has arrived. Component.tsx explicitly gates it on
 * imageFrame, independently of the normal copy. Validate written event order before a
 * take exists; ADR-0011 binds that order to playback. Without revealImage the image
 * opens automatically, so every emphasis has a visible context.
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
    const phrase = typeof text === 'string' ? `"${text}"` : 'A word';

    errors.push({
      code: 'EVENT_BEFORE_ELEMENT_REVEALED',
      sceneId: instance.id,
      field: `events[${index}].at`,
      message: `${phrase} is emphasized at "${event.at}", but the image does not arrive until "${reveal?.at}". Emphasis remains hidden until the image is revealed. Move revealImage to an anchor at or before "${event.at}", or move the emphasis to one at or after "${reveal?.at}".`,
      expected: [reveal?.at ?? ''],
    });
  }

  return { errors, warnings };
};
