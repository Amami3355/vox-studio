import type { CompilerError, CompilerWarning, SceneInstance } from '../../core/types';
/** Identical consecutive framing changes nothing; intervening notes do not reframe the image. */
export const imageDetailChecks = (
  instance: SceneInstance,
): { errors: CompilerError[]; warnings: CompilerWarning[] } => {
  const errors: CompilerError[] = [];
  let region: unknown = 'whole';
  for (const [index, event] of (instance.events ?? []).entries()) {
    if (event.action !== 'focus') continue;
    if (event.payload?.region === region)
      errors.push({
        code: 'EVENT_CONTENT_MISMATCH',
        sceneId: instance.id,
        field: `events[${index}]`,
        message:
          'This focus already has that framing and changes nothing. Choose another region or remove it.',
      });
    region = event.payload?.region;
  }
  return { errors, warnings: [] };
};
