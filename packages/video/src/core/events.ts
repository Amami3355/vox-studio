/**
 * Event folding.
 *
 * A scene renders as a pure function of (props, frame). Events are therefore not
 * imperative animations: they are a list of state transitions, and the render at any
 * frame is the fold of every transition that has already happened.
 *
 * The subtlety the whole library depends on: a naive fold returns `{ visibleBars: 3 }`,
 * which is not enough to animate anything. To start a spring the component needs to
 * know *at which frame* the field became 3. So the fold also reports, per field, the
 * frame of its last change. Fields that need per-item timing (a staggered batch, for
 * instance) instead store frames inside the state itself — the reducer receives the
 * event frame and may write it.
 */
import type { TimedEvent } from './types';

export type ResolvedField<T> = {
  value: T;
  /** Frame at which this field last changed. 0 when it never changed. */
  since: number;
  /** False until an event has touched this field. */
  touched: boolean;
};

export type ResolvedState<S> = { [K in keyof S]: ResolvedField<S[K]> };

export type EventReducer<S> = (state: S, event: TimedEvent) => S;

/**
 * Fold every event at or before `frame` onto `initial`.
 *
 * Deterministic and total: calling it at frame N never depends on having called it at
 * frame N-1, which is what makes distributed Remotion rendering safe.
 */
export const resolveEvents = <S extends Record<string, unknown>>(
  events: TimedEvent[],
  frame: number,
  initial: S,
  reducer: EventReducer<S>,
): ResolvedState<S> => {
  const ordered = [...events].sort((a, b) => a.frame - b.frame);

  let state = initial;
  const since = {} as Record<keyof S, number>;
  const touched = {} as Record<keyof S, boolean>;
  for (const key of Object.keys(initial) as (keyof S)[]) {
    since[key] = 0;
    touched[key] = false;
  }

  for (const event of ordered) {
    if (event.frame > frame) break;
    const next = reducer(state, event);
    if (next === state) continue;
    for (const key of Object.keys(next) as (keyof S)[]) {
      if (!Object.is(next[key], state[key])) {
        since[key] = event.frame;
        touched[key] = true;
      }
    }
    state = next;
  }

  const out = {} as ResolvedState<S>;
  for (const key of Object.keys(state) as (keyof S)[]) {
    out[key] = { value: state[key], since: since[key] as number, touched: touched[key] as boolean };
  }
  return out;
};
