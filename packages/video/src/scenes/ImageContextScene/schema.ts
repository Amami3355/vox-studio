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
