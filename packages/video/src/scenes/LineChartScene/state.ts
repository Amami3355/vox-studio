import type { EventReducer } from '../../core/events';
import type { TimedEvent } from '../../core/types';
import type { LineChartProps } from './schema';

export type LineChartFocusState = { series: string; label?: string; since: number };
export type LineChartAnnotationState = {
  series: string;
  label: string;
  text: string;
  since: number;
};

export type LineChartState = {
  revealFrame: number | null;
  focus: LineChartFocusState | null;
  annotation: LineChartAnnotationState | null;
};

export const initialLineChartState = (
  events: TimedEvent[],
  initialFocus: LineChartProps['focus'],
): LineChartState => ({
  revealFrame: events.some((event) => event.action === 'revealTrend') ? null : 0,
  focus: initialFocus ? { ...initialFocus, since: 0 } : null,
  annotation: null,
});

export const lineChartReducer: EventReducer<LineChartState> = (state, event) => {
  switch (event.action) {
    case 'revealTrend':
      return { ...state, revealFrame: event.frame };
    case 'focusSeries': {
      const series = readString(event.payload, 'series');
      return series === null ? state : { ...state, focus: { series, since: event.frame } };
    }
    case 'focusPoint': {
      const series = readString(event.payload, 'series');
      const label = readString(event.payload, 'label');
      return series === null || label === null
        ? state
        : { ...state, focus: { series, label, since: event.frame } };
    }
    case 'annotatePoint': {
      const series = readString(event.payload, 'series');
      const label = readString(event.payload, 'label');
      const text = readString(event.payload, 'text');
      return series === null || label === null || text === null
        ? state
        : { ...state, annotation: { series, label, text, since: event.frame } };
    }
    default:
      return state;
  }
};

const readString = (payload: Record<string, unknown> | undefined, key: string): string | null => {
  const value = payload?.[key];
  return typeof value === 'string' ? value : null;
};
