import type { EventReducer } from '../../core/events';
import type { TimedEvent } from '../../core/types';
export type ProcessStepsState = { active: number; stageFrame: number };
export const initialProcessStepsState = (events: TimedEvent[]): ProcessStepsState => ({
  active: events.some((e) => e.action === 'advance') ? -1 : 0,
  stageFrame: 0,
});
export const processStepsReducer: EventReducer<ProcessStepsState> = (state, event) =>
  event.action === 'advance' ? { active: state.active + 1, stageFrame: event.frame } : state;
