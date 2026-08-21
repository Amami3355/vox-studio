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

  /**
   * Asked of the *authored* props, so an absent `valueKind` is still absent — the schema
   * default has not been applied yet, and "the agent did not say" is the whole question.
   * An explicit `'amount'` next to a percentage is a claim, and claims are trusted.
   */
  const unit = (instance.props as { unit?: unknown }).unit;
  const valueKind = (instance.props as { valueKind?: unknown }).valueKind;
  if (typeof unit === 'string' && unit.trim() === '%' && valueKind === undefined) {
    warnings.push({
      code: 'VALUE_KIND_UNSTATED',
      severity: 'quality',
      sceneId: instance.id,
      field: 'valueKind',
      message:
        'This series is measured in "%" and has not said whether its values are shares. ' +
        'If it ever has to collapse a value — past the soft limit, or in a composed box — ' +
        'the collapsed ones will be added together, and a sum of percentages of different ' +
        'wholes is a number that measures nothing.',
      suggestion: 'Set `valueKind` to "share", or to "amount" if the values really do add up.',
    });
  }

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
