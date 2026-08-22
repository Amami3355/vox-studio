import { parseAnchor } from '../../core/anchor-grammar';
/**
 * Referential checks the generic validator cannot express.
 *
 * Both rules judge **content and written order, never frames**, which is what lets them fail
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
 * - The correspondence rule is true because the n-th `advanceWord` lights the n-th token.
 *   A word anchor naming anything else would cut on one spoken word and light another.
 */
import type { CompilerError, CompilerWarning, SceneInstance } from '../../core/types';
import { tokenise } from '../../core/words';
import { ADVANCE_WORD_ACTION } from './state';

export const typographicStatementChecks = (
  instance: SceneInstance,
): { errors: CompilerError[]; warnings: CompilerWarning[] } => {
  const errors: CompilerError[] = [];
  const warnings: CompilerWarning[] = [];

  const statement = instance.props.statement;
  /** A statement that is not a string is `INVALID_PROPS`, already reported, never this. */
  const words = typeof statement === 'string' ? tokenise(statement) : null;

  const events = instance.events ?? [];

  let advanced = 0;
  let surplusAt: number | null = null;

  for (const [index, event] of events.entries()) {
    if (event.action !== ADVANCE_WORD_ACTION) continue;
    advanced += 1;

    const expectedWord = words?.[advanced - 1]?.text;
    const target = parseAnchor(event.at)?.target;
    if (expectedWord !== undefined && target?.kind === 'word' && target.word !== expectedWord) {
      errors.push({
        code: 'EVENT_CONTENT_MISMATCH',
        sceneId: instance.id,
        field: `events[${index}].at`,
        message:
          `This is advanceWord ${advanced}, so it lights statement word "${expectedWord}", ` +
          `but its anchor names narration word "${target.word}".`,
        expected: [expectedWord],
      });
    }

    if (words !== null && advanced > words.length && surplusAt === null) surplusAt = index;
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
        `The statement has ${words.length} ${words.length === 1 ? 'word' : 'words'} and this scene lists ` +
        `${advanced} advanceWord events, so the last ${advanced - words.length} move nothing.`,
    });
  }

  return { errors, warnings };
};
