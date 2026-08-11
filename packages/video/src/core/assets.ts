import { z } from 'zod';

export const assetRequirementSchema = z
  .object({
    type: z
      .enum(['image', 'character', 'map', 'document'])
      .describe('Semantic kind of visual material required by the scene.'),
    subject: z
      .string()
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
    identityKey: z
      .string()
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
export const ASSET_REQUIREMENT_FIELD = 'assetRequirement' as const;
export type AssetRequirementField = typeof ASSET_REQUIREMENT_FIELD;
export type ResolvedSceneAssets = Readonly<Partial<Record<AssetRequirementField, AssetRef>>>;
export type ResolvedAssets = Readonly<Record<string, ResolvedSceneAssets>>;

export const NO_RESOLVED_SCENE_ASSETS: ResolvedSceneAssets = Object.freeze({});
export const NO_RESOLVED_ASSETS: ResolvedAssets = Object.freeze({});
