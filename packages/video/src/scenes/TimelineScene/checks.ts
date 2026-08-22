import type { CompilerError, CompilerWarning, SceneInstance } from '../../core/types';
import { timelineTracks } from '../../primitives/timelineLayout';

const EVENT_ACTIONS = new Set(['focusEvent', 'annotate']);

/**
 * The refusals the generic validator cannot express.
 *
 * All of them judge **written order, not resolved frames**, per ADR-0011 — so they fail at
 * `validate`, before a take exists and before anyone has paid to record one.
 *
 * Written **against** `Component.tsx` rather than ahead of it, per the trap in
 * `docs/adding-a-capability.md`: a refusal is a claim about how the component is built, and
 * one that outlives the branch teaches the agent a rule that is not true. The track refusal
 * below is exactly that kind of claim — `spine` draws one rail and reads no `track`, so a
 * second track is a dimension the author wrote that the frame does not carry. When `lanes`
 * lands it draws two, and this refusal narrows to the layouts that still cannot.
 */
export const timelineChecks = (
  instance: SceneInstance,
): { errors: CompilerError[]; warnings: CompilerWarning[] } => {
  const errors: CompilerError[] = [];
  const warnings: CompilerWarning[] = [];
  const events = readObjects(instance.props.events);
  const labels = events.flatMap((event) => (typeof event.label === 'string' ? [event.label] : []));

  const tracks = timelineTracks(
    events.flatMap((event) =>
      typeof event.date === 'string' && typeof event.label === 'string'
        ? [
            {
              date: event.date,
              label: event.label,
              ...(typeof event.track === 'string' ? { track: event.track } : {}),
            },
          ]
        : [],
    ),
  );

  /**
   * The "renders fine, means something else" class, which is the one worth a hard error:
   * the frame would be correct and a dimension the author wrote would simply be missing
   * from it. Nothing downstream would ever say so.
   */
  if (tracks.length > 1) {
    errors.push({
      code: 'INVALID_PROPS',
      sceneId: instance.id,
      field: 'events[].track',
      message: `The "${instance.layout ?? 'spine'}" layout draws one thread, and this chronology carries ${tracks.length}; the others would be dropped from the picture without a word. Give each thread its own scene, or drop the track names.`,
    });
  }

  if (labels.length === 0) return { errors, warnings };

  const revealIndex = (instance.events ?? []).findIndex(
    (event) => event.action === 'revealTimeline',
  );
  const reveal = revealIndex >= 0 ? instance.events?.[revealIndex] : undefined;

  for (const [index, event] of (instance.events ?? []).entries()) {
    if (!EVENT_ACTIONS.has(event.action)) continue;

    const target = readString(event.payload, 'label');
    if (target !== null && !labels.includes(target)) {
      errors.push({
        code: 'INVALID_PAYLOAD',
        sceneId: instance.id,
        field: `events[${index}].payload.label`,
        message: `Event "${target}" is unknown; this event would target no moment in the chronology.`,
        expected: labels,
      });
    }

    if (revealIndex >= 0 && index < revealIndex) {
      errors.push({
        code: 'EVENT_BEFORE_ELEMENT_REVEALED',
        sceneId: instance.id,
        field: `events[${index}]`,
        message: `${event.action} is written before revealTimeline, so it emphasises a moment that is still held back.`,
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
