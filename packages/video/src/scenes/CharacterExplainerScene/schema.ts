/**
 * HARD constraints, and the single source of truth for props, manifest and validation.
 *
 * The ceilings follow the image-and-copy precedent and stay generous: a 90-character
 * headline beside a character is a quality problem, not a malformed plan, so it degrades
 * with a warning and only genuinely unrenderable copy is rejected — see `constraints.ts`
 * for the band that actually shapes agent output.
 *
 * The one thing this schema is strict about, beyond `.strict()` itself, is the asset.
 * `assetRequirement` narrows the shared asset contract to what this scene can compose
 * with: a character, as a cutout or illustration, in portrait or square. The narrowing
 * is a derivation from `core/assets.ts` rather than a second schema, so the shared
 * fields — the `min(1)` subject, the `identityKey` rules — cannot drift between the two,
 * and `.strict()` on the base survives the extension, which is what stops an agent
 * smuggling a `uri` or a `status` into an authored prop.
 */
import { z } from 'zod';
import { assetRequirementSchema } from '../../core/assets';

const characterRequirementSchema = assetRequirementSchema.extend({
  type: z
    .literal('character')
    .describe('This scene composes with a figure, never a plate or a document.'),
  treatment: z
    .enum(['cutout', 'illustration'])
    .describe(
      'A cutout or an illustration; a photograph or duotone does not read as a figure that can carry an explanation.',
    ),
  orientation: z
    .enum(['portrait', 'square'])
    .describe('Portrait or square; a landscape subject is a scene, not a figure.'),
});

export const characterExplainerSchema = z
  .object({
    label: z
      .string()
      .max(80)
      .default('')
      .describe('Optional short identity or role, like a caption name. Best under 24 characters.'),
    headline: z
      .string()
      .max(120)
      .default('')
      .describe(
        'Optional concise claim the character carries. Best under 48 characters; longer copy drops down the type scale.',
      ),
    explanation: z
      .string()
      .max(240)
      .default('')
      .describe(
        'Optional supporting copy beside the character. Best under 160 characters; longer copy wraps onto more lines.',
      ),
    assetRequirement: characterRequirementSchema.describe(
      'Semantic character request resolved before compilation. One cutout or illustration, portrait or square; never a path or URI.',
    ),
  })
  .strict();

export type CharacterExplainerProps = z.infer<typeof characterExplainerSchema>;
