import type { EventReducer } from '../../core/events';
import type { TimedEvent } from '../../core/types';
/**
 * The scene's event reducer.
 *
 * Two timing mechanisms coexist here, on purpose:
 *   - scalar fields (`highlighted`, `annotation`) rely on `resolveEvents` reporting the
 *     frame each field last changed, so their transition can spring rather than snap;
 *   - per-item timing (`revealFrames`) is written into the state by the reducer, which
 *     receives the event frame — a single `since` cannot describe a staggered batch
 *     where bar 0 appeared 70 frames before bars 1..n.
 */
import { type MotionProfile, staggerFrames } from '../../design/motion';

export type BarChartState = {
  /** Frame each bar became visible; `null` while it is still hidden. */
  revealFrames: (number | null)[];
  highlighted: string | null;
  annotation: { label: string; text: string } | null;
};

export const REVEAL_ACTIONS = new Set(['showBaseline', 'revealAll']);

/**
 * Bars auto-reveal when the instance carries no reveal event, so an example without
 * events still animates. As soon as the plan drives the reveal, the plan owns it.
 */
export const initialBarChartState = (
  barCount: number,
  profile: MotionProfile,
  events: TimedEvent[],
  highlight: string | null,
): BarChartState => {
  const driven = events.some((e) => REVEAL_ACTIONS.has(e.action));
  const step = staggerFrames(profile);
  return {
    revealFrames: Array.from({ length: barCount }, (_, i) => (driven ? null : i * step)),
    highlighted: highlight,
    annotation: null,
  };
};

export const makeBarChartReducer =
  (profile: MotionProfile): EventReducer<BarChartState> =>
  (state, event) => {
    const step = staggerFrames(profile);

    switch (event.action) {
      case 'showBaseline': {
        const revealFrames = state.revealFrames.map((v, i) => (i === 0 ? event.frame : v));
        return { ...state, revealFrames };
      }
      case 'revealAll': {
        let batchIndex = 0;
        const revealFrames = state.revealFrames.map((v) => {
          if (v !== null) return v;
          const at = event.frame + step * batchIndex;
          batchIndex += 1;
          return at;
        });
        return { ...state, revealFrames };
      }
      case 'highlightBar': {
        const label = readString(event.payload, 'label');
        return label === null ? state : { ...state, highlighted: label };
      }
      case 'annotate': {
        const label = readString(event.payload, 'label');
        const text = readString(event.payload, 'text');
        if (label === null || text === null) return state;
        return { ...state, annotation: { label, text } };
      }
      default:
        // Unreachable: unknown actions are rejected by validateScene before render.
        return state;
    }
  };

const readString = (payload: Record<string, unknown> | undefined, key: string): string | null => {
  const value = payload?.[key];
  return typeof value === 'string' ? value : null;
};
