import type { CompilerError, CompilerWarning, SceneInstance } from '../../core/types';
export const processStepsChecks = (
  instance: SceneInstance,
): { errors: CompilerError[]; warnings: CompilerWarning[] } => {
  const errors: CompilerError[] = [];
  if (!Array.isArray(instance.props.steps)) return { errors, warnings: [] };
  let advances = 0;
  for (const [index, event] of (instance.events ?? []).entries()) {
    if (event.action === 'advance' && ++advances > instance.props.steps.length) {
      errors.push({
        code: 'EVENT_EXCEEDS_CONTENT',
        sceneId: instance.id,
        field: `events[${index}]`,
        message:
          'This advance has no remaining stage to reveal. Remove it or author the missing stage.',
      });
      break;
    }
  }
  return { errors, warnings: [] };
};
