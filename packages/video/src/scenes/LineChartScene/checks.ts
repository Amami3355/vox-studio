import type { CompilerError, CompilerWarning, SceneInstance } from '../../core/types';

const PLOT_ACTIONS = new Set(['focusSeries', 'focusPoint', 'annotatePoint']);

export const lineChartChecks = (
  instance: SceneInstance,
): { errors: CompilerError[]; warnings: CompilerWarning[] } => {
  const errors: CompilerError[] = [];
  const warnings: CompilerWarning[] = [];
  const points = readObjects(instance.props.points);
  const series = readObjects(instance.props.series);
  const pointLabels = points.flatMap((point) =>
    typeof point.label === 'string' ? [point.label] : [],
  );
  const seriesLabels = series.flatMap((entry) =>
    typeof entry.label === 'string' ? [entry.label] : [],
  );

  if (pointLabels.length === 0 && seriesLabels.length === 0) return { errors, warnings };

  const revealIndex = (instance.events ?? []).findIndex((event) => event.action === 'revealTrend');
  const reveal = revealIndex >= 0 ? instance.events?.[revealIndex] : undefined;

  for (const [index, event] of (instance.events ?? []).entries()) {
    if (!PLOT_ACTIONS.has(event.action)) continue;
    const seriesTarget = readString(event.payload, 'series');
    if (seriesTarget !== null && !seriesLabels.includes(seriesTarget)) {
      errors.push({
        code: 'INVALID_PAYLOAD',
        sceneId: instance.id,
        field: `events[${index}].payload.series`,
        message: `Series "${seriesTarget}" is unknown; this event would target no line.`,
        expected: seriesLabels,
      });
    }

    if (event.action !== 'focusSeries') {
      const pointTarget = readString(event.payload, 'label');
      if (pointTarget !== null && !pointLabels.includes(pointTarget)) {
        errors.push({
          code: 'INVALID_PAYLOAD',
          sceneId: instance.id,
          field: `events[${index}].payload.label`,
          message: `Point "${pointTarget}" is unknown; this event would target no observation.`,
          expected: pointLabels,
        });
      }
    }

    if (revealIndex >= 0 && index < revealIndex) {
      errors.push({
        code: 'EVENT_BEFORE_ELEMENT_REVEALED',
        sceneId: instance.id,
        field: `events[${index}]`,
        message: `${event.action} is written before revealTrend, so it targets plot marks that are still held back.`,
        ...(reveal ? { expected: [reveal.at] } : {}),
      });
    }
  }

  return { errors, warnings };
};

const readObjects = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
      )
    : [];

const readString = (payload: Record<string, unknown> | undefined, key: string): string | null => {
  const value = payload?.[key];
  return typeof value === 'string' ? value : null;
};
