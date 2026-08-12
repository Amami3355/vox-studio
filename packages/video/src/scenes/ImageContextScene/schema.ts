/**
 * HARD constraints, and the single source of truth for props, manifest and validation.
 *
 * The ceilings here are deliberately generous. A 90-character headline is a quality
 * problem, not a malformed plan, so it degrades with a warning and only genuinely
 * unrenderable copy is rejected — see `constraints.ts` for the band that actually shapes
 * agent output.
 *
 * The one thing this schema is strict about is the asset. `assetRequirement` is semantic
 * and nothing else: `.strict()` on the requirement is what stops an agent smuggling a
 * `uri` or a `status` into an authored prop and teaching itself to write the resolver's
 * output.
 */
import { z } from 'zod';
import { assetRequirementSchema } from '../../core/assets';

export const imageContextSchema = z
  .object({
    headline: z
      .string()
      .max(120)
      .describe(
        'Editorial headline paired with the image. Best under 40 characters; longer copy reduces the type scale.',
      ),
    caption: z
      .string()
      .max(240)
      .default('')
      .describe('Optional supporting context. Best under 120 characters.'),
    assetRequirement: assetRequirementSchema.describe(
      'Semantic visual request resolved before compilation. Never provide a path or URI.',
    ),
  })
  .strict();

export type ImageContextProps = z.infer<typeof imageContextSchema>;
