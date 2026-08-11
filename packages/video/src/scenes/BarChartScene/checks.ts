import type { CompilerError, CompilerWarning, SceneInstance } from '../../core/types';

/**
 * Referential integrity between events, props and data.
 *
 * A `highlightBar` pointing at a label that does not exist renders a perfectly correct
 * chart in which nothing is highlighted — no error, no trace, a dead scene. That is the
 * exact failure this file exists to make loud.
 */
export const barChartChecks = (
  instance: SceneInstance,
): { errors: CompilerError[]; warnings: CompilerWarning[] } => {
  const errors: CompilerError[] = [];
  const warnings: CompilerWarning[] = [];

  const data = (instance.props as { data?: unknown }).data;
  if (!Array.isArray(data)) return { errors, warnings };

  const labels = data
    .map((d) => (typeof d === 'object' && d !== null ? (d as { label?: unknown }).label : null))
    .filter((l): l is string => typeof l === 'string');

  // Empty series is a legitimate degraded state, and every label reference below would
  // be reported against it. Stay quiet and let the empty-state warning speak.
  if (labels.length === 0) return { errors, warnings };

  const highlight = (instance.props as { highlight?: unknown }).highlight;
  if (typeof highlight === 'string' && !labels.includes(highlight)) {
    errors.push({
      code: 'INVALID_PROPS',
      sceneId: instance.id,
      field: 'highlight',
      message: `highlight "${highlight}" does not match any label in data.`,
      expected: labels,
    });
  }

  for (const [index, event] of (instance.events ?? []).entries()) {
    if (event.action !== 'highlightBar' && event.action !== 'annotate') continue;
    const label = (event.payload as { label?: unknown } | undefined)?.label;
    if (typeof label === 'string' && !labels.includes(label)) {
      errors.push({
        code: 'INVALID_PAYLOAD',
        sceneId: instance.id,
        field: `events[${index}].payload.label`,
        message: `"${label}" does not match any label in data; this event would render nothing.`,
        expected: labels,
      });
    }
  }

  return { errors, warnings };
};
