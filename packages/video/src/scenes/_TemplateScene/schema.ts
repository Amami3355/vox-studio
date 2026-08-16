/**
 * TEMPLATE — copy this folder, do not register this scene.
 *
 * HARD constraints, and the single source of truth for props, manifest and validation.
 * The manifest publishes this file's JSON Schema, so every `.describe()` here is agent-
 * facing documentation, not a code comment.
 *
 * Keep the ceilings generous. A headline slightly over the recommended band is a quality
 * problem, not a malformed plan: it belongs in `constraints.ts` as a warning, and only
 * genuinely unrenderable copy belongs here as a rejection.
 *
 * `.strict()` is not optional. It is what stops an agent smuggling a field the resolver
 * owns — a `uri`, a `status`, a frame — into an authored prop.
 */
import { z } from 'zod';

/**
 * TODO replace every field below. These two are a worked example of the shape, not a base
 * to extend: a scene that keeps `statement` and `eyebrow` because they were already here is
 * a scene whose props were chosen by the template.
 */
export const templateSceneSchema = z
  .object({
    statement: z
      .string()
      .max(160)
      .describe(
        'The claim the frame carries. Best under 60 characters; longer copy reduces the type scale.',
      ),
    eyebrow: z
      .string()
      .max(40)
      .default('')
      .describe('Optional small label above the statement. Carries section context.'),
  })
  .strict();

export type TemplateSceneProps = z.infer<typeof templateSceneSchema>;
