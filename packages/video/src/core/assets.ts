/**
 * The asset contracts.
 *
 * Two types that must never be confused. An `AssetRequirement` is *semantic* and
 * agent-authored: it says what the picture must show. An `AssetRef` is *runtime* and
 * resolver-produced: it says where the picture is, or why there isn't one. The agent
 * writes the first and may never write the second — which is why the resolved reference
 * travels beside the plan rather than inside `props`.
 */
import { z } from 'zod';

export const assetRequirementSchema = z
  .object({
    type: z
      .enum(['image', 'character', 'map', 'document'])
      .describe('Semantic kind of visual material required by the scene.'),
    /**
     * `min(1)`, not just a ceiling. The subject is the visible label of every
     * placeholder and failed plate, so an empty one renders a blank rectangle and
     * silently destroys the one thing the degraded state exists to communicate.
     */
    subject: z
      .string()
      .min(1)
      .max(80)
      .describe('Visual subject in natural language. Never a path or URI.'),
    treatment: z
      .enum(['photo', 'cutout', 'illustration', 'duotone'])
      .default('photo')
      .describe('Editorial treatment requested from the Asset Resolver.'),
    orientation: z
      .enum(['landscape', 'portrait', 'square'])
      .default('landscape')
      .describe('Composition the resolved asset should support.'),
    /**
     * Also `min(1)`: an empty identity is not a shared identity, and letting `''` through
     * would make every keyless requirement collide in the resolver's identity cache.
     */
    identityKey: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe('Stable identity shared by requirements that must resolve to the same asset.'),
  })
  .strict();

export const assetRefSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready'), uri: z.string().min(1) }).strict(),
  z
    .object({
      status: z.literal('placeholder'),
      uri: z.string().min(1),
      pendingRequirementId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal('failed'),
      uri: z.string().min(1),
      requirementId: z.string().min(1),
      reason: z.string().min(1),
    })
    .strict(),
]);

export type AssetRequirement = z.infer<typeof assetRequirementSchema>;
export type AssetRef = z.infer<typeof assetRefSchema>;

/** The one prop name the resolver reads and the one key it writes. */
export const ASSET_REQUIREMENT_FIELD = 'assetRequirement' as const;

/**
 * What one scene's component receives. Keyed by the requirement field rather than merged
 * into `props`, so the manifest stays an authoring contract and never leaks a runtime
 * location to the Visual Planner.
 */
export type ResolvedSceneAssets = Readonly<{ assetRequirement?: AssetRef }>;

export const NO_RESOLVED_SCENE_ASSETS: ResolvedSceneAssets = Object.freeze({});
