import { z } from 'zod';
import { assetRequirementSchema } from '../../core/assets';
export const imageDetailSchema = z
  .object({
    headline: z
      .string()
      .max(120)
      .default('')
      .describe('Optional introductory title. Leave empty when the image explains on its own.'),
    caption: z
      .string()
      .max(240)
      .default('')
      .describe('Optional context or illustration disclosure, set outside the image.'),
    assetRequirement: assetRequirementSchema.describe(
      'A deliberately composed image. Name the location of a detail in the subject only when needed. The whole image is initially contained without cropping. Never provide a path.',
    ),
  })
  .strict();
export type ImageDetailProps = z.infer<typeof imageDetailSchema>;
