import type { EventReducer } from '../../core/events';
import type { TimedEvent } from '../../core/types';
/**
 * The scene's event reducer.
 *
 * Both entrances are stored as frames inside the state rather than read off
 * `resolveEvents`' per-field `since`. The reason is the untouched case: a scene the plan
 * never drives still has to animate, so the frame a reveal *would* have happened at is a
 * value the initial state has to be able to state, and `since` cannot say it — it reports
 * 0 for a field no event reached, which is indistinguishable from a reveal genuinely
 * anchored at the top of the scene.
 *
 * `null` therefore means "held back, and the plan said so". It is only reachable when the
 * plan carries the matching reveal event, which is what keeps an eventless instance
 * rendering exactly as it did before this file existed.
 */
export type ImageContextState = {
  /** Frame the image plate begins its wipe; `null` while the plan still holds it back. */
  imageFrame: number | null;
  /** Frame the copy column begins its stagger; `null` while the plan still holds it back. */
  copyFrame: number | null;
  /**
   * The word or phrase currently stamped over the image, if any.
   *
   * Never cleared, and the action description says so rather than leaving the manifest to
   * imply otherwise. Clearing would need either a duration this file is not allowed to
   * invent — everything temporal comes from the motion profile — or a fourth verb whose
   * only job is to undo a third. A later `emphasize` replaces it, which is the one
   * transition an author can actually write.
   */
  emphasis: string | null;
};

export const REVEAL_IMAGE_ACTION = 'revealImage';
export const REVEAL_COPY_ACTION = 'revealCopy';

/**
 * Image and copy auto-reveal when the instance carries no reveal event, so an example
 * without events still animates. As soon as the plan drives a reveal, the plan owns that
 * one — and only that one: a scene may hold its copy back while letting the image open on
 * the profile's own terms.
 */
export const initialImageContextState = (events: TimedEvent[]): ImageContextState => ({
  imageFrame: events.some((e) => e.action === REVEAL_IMAGE_ACTION) ? null : 0,
  copyFrame: events.some((e) => e.action === REVEAL_COPY_ACTION) ? null : 0,
  emphasis: null,
});

export const imageContextReducer: EventReducer<ImageContextState> = (state, event) => {
  switch (event.action) {
    case REVEAL_IMAGE_ACTION:
      return { ...state, imageFrame: event.frame };
    case REVEAL_COPY_ACTION:
      return { ...state, copyFrame: event.frame };
    case 'emphasize': {
      const text = readString(event.payload, 'text');
      return text === null ? state : { ...state, emphasis: text };
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
