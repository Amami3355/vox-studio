/**
 * TEMPLATE — copy this folder, do not register this scene. Delete it if the scene has no
 * actions.
 *
 * The scene's event reducer. A scene renders as a pure function of (props, frame), so
 * events are not imperative animations: they are state transitions, and the render at any
 * frame is the fold of every transition that has already happened.
 *
 * Store entrance frames *inside* the state rather than reading them off `resolveEvents`'
 * per-field `since`. The reason is the untouched case: a scene the plan never drives still
 * has to animate, and `since` reports 0 for a field no event reached — indistinguishable
 * from a reveal genuinely anchored at the top of the scene.
 *
 * `null` therefore means "held back, and the plan said so". It is only reachable when the
 * instance carries the matching reveal event, which is what keeps an eventless instance
 * rendering exactly as it did before this file existed.
 */
import type { EventReducer } from '../../core/events';
import type { TimedEvent } from '../../core/types';

/** TODO one field per thing an action changes. Delete this file if `actions.ts` is `{}`. */
export type TemplateSceneState = {
  /** Frame the statement begins its entrance; `null` while the plan still holds it back. */
  statementFrame: number | null;
  /** The word currently stamped over the statement, if any. Never cleared; a later event replaces it. */
  emphasis: string | null;
};

export const REVEAL_STATEMENT_ACTION = 'revealStatement';

/**
 * Auto-reveal when the instance carries no reveal event, so an example without events
 * still animates. As soon as the plan drives the reveal, the plan owns it.
 */
export const initialTemplateSceneState = (events: TimedEvent[]): TemplateSceneState => ({
  statementFrame: events.some((e) => e.action === REVEAL_STATEMENT_ACTION) ? null : 0,
  emphasis: null,
});

export const templateSceneReducer: EventReducer<TemplateSceneState> = (state, event) => {
  switch (event.action) {
    case REVEAL_STATEMENT_ACTION:
      return { ...state, statementFrame: event.frame };
    case 'emphasizeWord': {
      const word = readString(event.payload, 'word');
      return word === null ? state : { ...state, emphasis: word };
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
