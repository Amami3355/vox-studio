import type { EventReducer } from '../../core/events';
import type { TimedEvent } from '../../core/types';

export type TimelineFocusState = { label: string; since: number };
export type TimelineAnnotationState = { label: string; text: string; since: number };

export type TimelineState = {
  /**
   * The frame the chronology was revealed at, `null` while it is still held back.
   *
   * Stored **inside** the state rather than read off `resolveEvents`' `since`, per the trap
   * in `docs/adding-a-capability.md`: `since` reports 0 for a field no event reached, which
   * is indistinguishable from a reveal anchored at the top of the scene. A chronology that
   * cannot tell "held back" from "revealed at frame 0" draws its events before the plan
   * asked for them.
   */
  revealFrame: number | null;
  focus: TimelineFocusState | null;
  annotation: TimelineAnnotationState | null;
};

export const initialTimelineState = (events: TimedEvent[]): TimelineState => ({
  revealFrame: events.some((event) => event.action === 'revealTimeline') ? null : 0,
  focus: null,
  annotation: null,
});

export const timelineReducer: EventReducer<TimelineState> = (state, event) => {
  switch (event.action) {
    case 'revealTimeline':
      return { ...state, revealFrame: event.frame };
    case 'focusEvent': {
      const label = readString(event.payload, 'label');
      return label === null ? state : { ...state, focus: { label, since: event.frame } };
    }
    case 'annotate': {
      const label = readString(event.payload, 'label');
      const text = readString(event.payload, 'text');
      return label === null || text === null
        ? state
        : { ...state, annotation: { label, text, since: event.frame } };
    }
    default:
      return state;
  }
};

const readString = (payload: Record<string, unknown> | undefined, key: string): string | null => {
  const value = payload?.[key];
  return typeof value === 'string' ? value : null;
};
