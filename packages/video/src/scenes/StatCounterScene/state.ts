import type { EventReducer } from '../../core/events';
import type { TimedEvent } from '../../core/types';

/**
 * The scene's event reducer.
 *
 * The reveal is stored as a frame inside the state rather than read off `resolveEvents`'
 * per-field `since`. The reason is the untouched case: a scene the plan never drives
 * still has to animate, so the frame a reveal *would* have happened at is a value the
 * initial state has to be able to state, and `since` cannot say it — it reports 0 for a
 * field no event reached, which is indistinguishable from a reveal genuinely anchored at
 * the top of the scene.
 *
 * `null` therefore means "held back, and the plan said so". It is only reachable when the
 * instance carries the reveal event, which is what keeps an eventless instance rendering
 * exactly as it did before this file existed.
 *
 * No `readString`, on purpose: the vocabulary carries no payloads, so there is nothing to
 * read and no fourth copy of it is needed. Same shape as `quote`'s `state.ts`.
 */
export type StatCounterSceneState = {
  /** Frame the stat begins its entrance; `null` while the plan still holds it back. */
  statFrame: number | null;
};

export const REVEAL_STAT_ACTION = 'revealStat';

/**
 * The stat auto-reveals when the instance carries no reveal event, so an example without
 * events still animates. As soon as the plan drives the reveal, the plan owns it.
 */
export const initialStatCounterSceneState = (events: TimedEvent[]): StatCounterSceneState => ({
  statFrame: events.some((e) => e.action === REVEAL_STAT_ACTION) ? null : 0,
});

export const statCounterReducer: EventReducer<StatCounterSceneState> = (state, event) => {
  switch (event.action) {
    case REVEAL_STAT_ACTION:
      return { ...state, statFrame: event.frame };
    default:
      // Unreachable: unknown actions are rejected by validateScene before render.
      return state;
  }
};
