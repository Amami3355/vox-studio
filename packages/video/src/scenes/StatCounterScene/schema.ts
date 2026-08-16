/**
 * HARD constraints, and the single source of truth for props, manifest and validation.
 * The manifest publishes this file's JSON Schema, so every `.describe()` here is agent-
 * facing documentation, not a code comment.
 *
 * Keep the ceilings generous. Copy slightly over the recommended band is a quality
 * problem, not a malformed plan: it belongs in `constraints.ts` as a warning, and only
 * genuinely unrenderable copy belongs here as a rejection.
 *
 * `value` is a number, not a string, on purpose. The scene formats it; an agent writing
 * "1 in 3" would be choosing typography the design system owns. Requiring a number is
 * what separates "the agent authors data" from "the agent authors copy that looks like a
 * number".
 *
 * `layout` and `motionProfile` are deliberately NOT here: they belong to the
 * SceneInstance, alongside `props`, exactly as the compiled document represents them.
 *
 * `.strict()` is not optional. It is what stops an agent smuggling a field the resolver
 * owns — a `uri`, a `status`, a frame — into an authored prop.
 */
import { z } from 'zod';

export const statCounterSchema = z
  .object({
    value: z
      .number()
      .describe(
        'The number the frame carries, as a number — the scene formats it. An agent ' +
          'writing "1 in 3" is choosing typography the design system owns.',
      ),
    label: z
      .string()
      .max(80)
      .describe(
        'What the number counts, in one line. Always present — a number without a ' +
          'referent is the failure this scene exists to avoid.',
      ),
    unit: z
      .string()
      .max(12)
      .default('')
      .describe(
        "The unit set beside the value at a smaller step, e.g. '%', 'k', '°C'. Empty " +
          'for a bare count.',
      ),
    sublabel: z
      .string()
      .max(120)
      .default('')
      .describe("One supporting line under the label, e.g. 'up from 19% in 2005'. Empty for none."),
    emphasis: z
      .enum(['neutral', 'positive', 'negative'])
      .default('neutral')
      .describe('The semantic role the value reads in — its colour. Neutral for a plain figure.'),
  })
  .strict();

export type StatCounterSceneProps = z.infer<typeof statCounterSchema>;
