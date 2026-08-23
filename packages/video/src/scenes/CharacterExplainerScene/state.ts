import type { EventReducer } from '../../core/events';
import type { TimedEvent } from '../../core/types';

/**
 * The scene's event reducer. A scene renders as a pure function of (props, frame), so
 * events are state transitions and the render at any frame is the fold of every
 * transition that has already happened.
 *
 * Both entrances are stored as frames inside the state rather than read off
 * `resolveEvents`' per-field `since`. The reason is the untouched case: a scene the plan
 * never drives still has to animate, and `since` reports 0 for a field no event reached
 * — indistinguishable from a reveal genuinely anchored at the top of the scene. `null`
 * therefore means "held back, and the plan said so", and it is only reachable when the
 * instance carries the matching reveal event, which is what keeps an eventless instance
 * rendering exactly as it did before this file existed.
 *
 * `accentFrame: null` is a different sentence: no accent has landed yet. It cannot mean
 * "held back" because an accent is not an entrance — an unmounted character is the
 * referential failure `checks.ts` refuses, not a state this reducer represents.
 */
export type CharacterExplainerState = {
  /** Frame the cutout begins its entrance; `null` while the plan still holds it back. */
  characterFrame: number | null;
  /** Frame the copy column begins its stagger; `null` while the plan still holds it back. */
  copyFrame: number | null;
  /** Frame of the most recent accent; `null` until one has landed. */
  accentFrame: number | null;
};

export const REVEAL_CHARACTER_ACTION = 'revealCharacter';
export const REVEAL_COPY_ACTION = 'revealCopy';
export const ACCENT_CHARACTER_ACTION = 'accentCharacter';

/**
 * Character and copy auto-reveal when the instance carries no matching reveal event, so
 * an example without events still animates. As soon as the plan drives a reveal, the
 * plan owns that one — and only that one: a scene may hold its copy back while the
 * character opens on the profile's own terms, or the reverse.
 */
export const initialCharacterExplainerState = (events: TimedEvent[]): CharacterExplainerState => ({
  characterFrame: events.some((e) => e.action === REVEAL_CHARACTER_ACTION) ? null : 0,
  copyFrame: events.some((e) => e.action === REVEAL_COPY_ACTION) ? null : 0,
  accentFrame: null,
});

/**
 * No payload-reading on purpose: none of the three verbs carries one, so there is
 * nothing to read. A later accent simply overwrites the frame, which is the whole of
 * "the latest written event restarts the gesture".
 */
export const characterExplainerReducer: EventReducer<CharacterExplainerState> = (state, event) => {
  switch (event.action) {
    case REVEAL_CHARACTER_ACTION:
      return { ...state, characterFrame: event.frame };
    case REVEAL_COPY_ACTION:
      return { ...state, copyFrame: event.frame };
    case ACCENT_CHARACTER_ACTION:
      return { ...state, accentFrame: event.frame };
    default:
      // Unreachable: unknown actions are rejected by validateScene before render.
      return state;
  }
};
