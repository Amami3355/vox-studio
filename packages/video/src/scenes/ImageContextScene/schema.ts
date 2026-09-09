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
        'Short editorial message over the image. Prefer 3-7 words and under 40 characters. Longer copy reduces the type scale. No generic labels such as Visual context.',
      ),
    caption: z
      .string()
      .max(240)
      .default('')
      .describe(
        'Optional single supporting sentence over the image. Prefer under 90 characters; do not repeat the headline or transcribe the narration.',
      ),
    imageFocus: z
      .enum(['center', 'left', 'right', 'top', 'bottom'])
      .default('center')
      .describe(
        'Region of the accepted image to retain when filling the frame. Choose a text layout away from its subject. This is a crop alignment, not subject detection.',
      ),
    assetRequirement: assetRequirementSchema.describe(
      'Image fills the frame and may be cropped. Prefer a landscape image composed for the selected text placement, with the subject away from that area and important details away from the edges. Never provide a path or URI.',
    ),
  })
  .strict();

export type ImageContextProps = z.infer<typeof imageContextSchema>;
