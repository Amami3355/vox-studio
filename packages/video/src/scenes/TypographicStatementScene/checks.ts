/**
 * Referential checks the generic validator cannot express.
 *
 * Both rules judge **counts and written order, never frames**, which is what lets them fail
 * at `validate` — before a take exists and before anyone has paid to record one. ADR-0011
 * makes that sound: a scene's events play in the order they are written, so the n-th
 * `advanceWord` is the n-th word whatever the anchors later resolve to.
 *
 * Written after `Component.tsx` and verified against it, per the procedure, because a
 * refusal is a claim about how the component is built:
 *
 * - The surplus rule is true because `Statement` clamps `spoken` to the words it is
 *   drawing. The eighth `advanceWord` on a seven-word sentence is not a crash and not a
 *   different picture; it is an event that moves nothing, which is the "renders fine,
 *   animates nothing" species this file exists to catch.
 * - The order rule is true because the words are mounted *inside* the statement's gate.
 *   Move the sentence out from behind `revealStatement` and this rule stops being true, so
 *   it has to be re-read against the component if the gate ever moves.
 */
import type { CompilerError, CompilerWarning, SceneInstance } from '../../core/types';
import { tokenise } from '../../core/words';
import { ADVANCE_WORD_ACTION, REVEAL_STATEMENT_ACTION } from './state';

export const typographicStatementChecks = (
  instance: SceneInstance,
): { errors: CompilerError[]; warnings: CompilerWarning[] } => {
  const errors: CompilerError[] = [];
  const warnings: CompilerWarning[] = [];

  const statement = instance.props.statement;
  /** A statement that is not a string is `INVALID_PROPS`, already reported, never this. */
  const words = typeof statement === 'string' ? tokenise(statement).length : null;

  const events = instance.events ?? [];
  const revealIndex = events.findIndex((event) => event.action === REVEAL_STATEMENT_ACTION);
  const reveal = revealIndex >= 0 ? events[revealIndex] : undefined;

  let advanced = 0;
  let surplusAt: number | null = null;

  for (const [index, event] of events.entries()) {
    if (event.action !== ADVANCE_WORD_ACTION) continue;
    advanced += 1;

    if (revealIndex >= 0 && index < revealIndex) {
      errors.push({
        code: 'EVENT_BEFORE_ELEMENT_REVEALED',
        sceneId: instance.id,
        field: `events[${index}]`,
        message:
          'advanceWord is written before revealStatement, so it moves the voice through a ' +
          'sentence that is still held back.',
        ...(reveal ? { expected: [reveal.at] } : {}),
      });
    }

    if (words !== null && advanced > words && surplusAt === null) surplusAt = index;
  }

  /**
   * One error and not one per surplus event. The author wrote too many of the same thing;
   * repeating the same sentence four times tells them nothing the count does not.
   */
  if (words !== null && surplusAt !== null) {
    errors.push({
      code: 'EVENT_EXCEEDS_CONTENT',
      sceneId: instance.id,
      field: `events[${surplusAt}]`,
      message:
        `The statement has ${words} ${words === 1 ? 'word' : 'words'} and this scene lists ` +
        `${advanced} advanceWord events, so the last ${advanced - words} move nothing.`,
    });
  }

  return { errors, warnings };
};
