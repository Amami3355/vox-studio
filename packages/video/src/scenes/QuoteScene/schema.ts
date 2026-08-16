/**
 * HARD constraints, and the single source of truth for props, manifest and validation.
 * The manifest publishes this file's JSON Schema, so every `.describe()` here is agent-
 * facing documentation, not a code comment.
 *
 * Keep the ceilings generous. Copy slightly over the recommended band is a quality
 * problem, not a malformed plan: it belongs in `constraints.ts` as a warning, and only
 * genuinely unrenderable copy belongs here as a rejection.
 *
 * No quotation marks in `quote` on purpose — the scene draws its own oversized mark, so
 * an agent adding `"` or `"` would render a doubled mark.
 *
 * `layout` and `motionProfile` are deliberately NOT here: they belong to the
 * SceneInstance, alongside `props`, exactly as the compiled document represents them.
 *
 * `.strict()` is not optional. It is what stops an agent smuggling a field the resolver
 * owns into an authored prop.
 */
import { z } from 'zod';

export const quoteSchema = z
  .object({
    quote: z
      .string()
      .max(240)
      .describe(
        'The quoted words, without quotation marks — the scene draws its own mark. ' +
          'Best under 110 characters; beyond that the type scale drops a step ' +
          'automatically. An empty string renders a typographic empty state.',
      ),
    attribution: z
      .string()
      .max(60)
      .default('')
      .describe(
        'Who said it, as a name or short identifier. Empty makes the quote anonymous — ' +
          'use that only when the narration itself names the speaker.',
      ),
    role: z
      .string()
      .max(60)
      .default('')
      .describe(
        "One line of context under the attribution, e.g. 'Housing minister, 2021–2024'. " +
          'Empty for none.',
      ),
    eyebrow: z
      .string()
      .max(40)
      .default('')
      .describe(
        "Optional small label above the mark, e.g. 'The testimony'. Carries section " +
          'context while the quote is held back.',
      ),
  })
  .strict();

export type QuoteSceneProps = z.infer<typeof quoteSchema>;
