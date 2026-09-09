import { z } from 'zod';
import { assetRequirementSchema } from '../../core/assets';
export const imageDetailSchema = z
  .object({
    headline: z
      .string()
      .max(120)
      .default('')
      .describe(
        'Optional short introductory title over the lower-left of the image. Replaced by the first annotation. Leave empty when the image explains on its own.',
      ),
    caption: z
      .string()
      .max(240)
      .default('')
      .describe(
        'Optional introductory context or illustration disclosure below the title in the same overlay. Replaced along with the title by an annotation; put any continuing disclosure in the annotation itself.',
      ),
    imageFit: z
      .enum(['contain', 'cover'])
      .default('contain')
      .describe(
        'Contain preserves the complete image in the full frame, with dark bands if its aspect differs. Cover fills every edge by cropping centrally; use only when the accepted image tolerates that crop. Focus regions refer to this base view.',
      ),
    assetRequirement: assetRequirementSchema.describe(
      'A deliberately composed image, preferably matching the video aspect. Keep the lower-left quiet when using copy. Name the location of a detail only when needed and verify it in the accepted image. The whole image is initially contained unless imageFit is cover. Never provide a path.',
    ),
  })
  .strict();
export type ImageDetailProps = z.infer<typeof imageDetailSchema>;
