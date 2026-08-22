import type { EventReducer } from '../../core/events';
import type { TimedEvent } from '../../core/types';

/**
 * The scene's event reducer.
 *
 * `null` is load-bearing in both fields and means something different in each, so both are
 * written out.
 *
 * `statementFrame` follows `QuoteScene/state.ts` verbatim, including its argument: the
 * reveal is stored as a frame inside the state rather than read off `resolveEvents`'
 * per-field `since`, because `since` reports 0 for a field no event reached and that is
 * indistinguishable from a reveal genuinely anchored at the top of the scene. `null`
 * therefore means "held back, and the plan said so".
 *
 * `spoken: null` is the same idea one field over, and it is what makes the degradation the
 * design rather than a fallback. An instance carrying no `advanceWord` is not a sweep
 * stopped at word zero — it is a card nothing is driving, and every word stands. A plan
 * written before anyone has paid to record a take renders the same card, minus the sweep,
 * and that is the whole of what it loses.
 *
 * **No frame is stored for the sweep, and that is a decision rather than an omission.** The
 * draft of this file kept a `spokenFrame` so a word's change of tone could be sprung from
 * it. It should not be. A word anchor exists so the picture moves on the frame the word was
 * *measured* at; a spring moves the visible change 10-odd frames past that onset, which at
 * this granularity is a whole word late — the same arithmetic-instead-of-a-word the anchor
 * grammar refuses when it declines to give `word:` an offset. So the tone changes on the
 * frame, and the field that would have softened it is not here to be read.
 *
 * No `readString`, on purpose: neither verb carries a payload, so there is nothing to read.
 */
export type TypographicStatementSceneState = {
  /** Frame the statement begins its entrance; `null` while the plan still holds it back. */
  statementFrame: number | null;
  /** Words the voice has reached; `null` when no event drives the sweep — all words stand. */
  spoken: number | null;
};

export const REVEAL_STATEMENT_ACTION = 'revealStatement';
export const ADVANCE_WORD_ACTION = 'advanceWord';

/**
 * The statement auto-reveals when the instance carries no reveal event, so an example
 * without events still animates. As soon as the plan drives the reveal, the plan owns it.
 *
 * The sweep works the other way round: it starts at zero only when the plan has said it
 * will drive it, so an eventless instance renders exactly as it did before this file
 * existed.
 */
export const initialTypographicStatementState = (
  events: TimedEvent[],
): TypographicStatementSceneState => ({
  statementFrame: events.some((e) => e.action === REVEAL_STATEMENT_ACTION) ? null : 0,
  spoken: events.some((e) => e.action === ADVANCE_WORD_ACTION) ? 0 : null,
});

/**
 * The count is not clamped here. The reducer sees events and not props, so it cannot know
 * how many words the statement has; the component clamps against the copy it is drawing,
 * and `checks.ts` refuses the plan that would need the clamp long before a frame exists.
 */
export const typographicStatementReducer: EventReducer<TypographicStatementSceneState> = (
  state,
  event,
) => {
  switch (event.action) {
    case REVEAL_STATEMENT_ACTION:
      return { ...state, statementFrame: event.frame };
    case ADVANCE_WORD_ACTION:
      return { ...state, spoken: (state.spoken ?? 0) + 1 };
    default:
      // Unreachable: unknown actions are rejected by validateScene before render.
      return state;
  }
};
