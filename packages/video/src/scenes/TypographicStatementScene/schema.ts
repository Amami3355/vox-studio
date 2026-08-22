/**
 * HARD constraints, and the single source of truth for props, manifest and validation.
 * The manifest publishes this file's JSON Schema, so every `.describe()` here is agent-
 * facing documentation, not a code comment.
 *
 * Four fields, and the ceilings are tight rather than generous — deliberately, and against
 * the usual advice. `quote` accepts 240 characters because a long quotation is still a
 * quotation; a long chapter card is a `quote`, and 140 is the length past which the card
 * has stopped being one sentence set large. `constraints.ts` carries the band that shapes
 * what gets written; this is where copy stops being renderable as a card at all.
 *
 * `layout` and `motionProfile` are deliberately NOT here: they belong to the SceneInstance,
 * exactly as the compiled document represents them.
 *
 * There is no subtitle field. The layout draws none, and a field the layout ignores is a
 * rule the agent would learn wrongly.
 */
import { z } from 'zod';

export const typographicStatementSchema = z
  .object({
    statement: z
      .string()
      .max(140)
      .describe(
        'The sentence the chapter is about, without quotation marks — this is the film ' +
          'speaking, not a person. Best under 72 characters; beyond that the type steps ' +
          'down the scale until it fits the band the layout reserves. An empty string ' +
          'renders a typographic empty state.',
      ),
    eyebrow: z
      .string()
      .max(40)
      .default('')
      .describe(
        "Optional small label above the statement, e.g. 'Chapter two'. It carries the " +
          'frame on its own while `revealStatement` holds the sentence back.',
      ),
    ordinal: z
      .string()
      .max(12)
      .default('')
      .describe(
        "Where this chapter sits, as you want it read: '02 / 05', 'II', 'Part three'. Set " +
          'small in mono at the foot of the frame. Nothing derives or checks it — the ' +
          'plan has no act model — so a wrong ordinal renders exactly as a right one.',
      ),
    emphasis: z
      .enum(['neutral', 'positive', 'negative'])
      .default('neutral')
      .describe(
        'Semantic reading of the chapter this card opens. Selects the ground role from ' +
          'the theme; never a raw colour.',
      ),
  })
  .strict();

export type TypographicStatementProps = z.infer<typeof typographicStatementSchema>;
