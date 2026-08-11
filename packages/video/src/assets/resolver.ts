import {
  ASSET_REQUIREMENT_FIELD,
  type AssetRef,
  type AssetRequirement,
  NO_RESOLVED_ASSETS,
  type ResolvedAssets,
  assetRefSchema,
  assetRequirementSchema,
} from '../core/assets';
import type { SceneInstance } from '../core/types';

export type AssetResolver = {
  resolve: (requirement: AssetRequirement) => AssetRef;
};

export type LocalAssetEntry = {
  requirement: AssetRequirement;
  ref: Exclude<AssetRef, { status: 'placeholder' }>;
};

export type AssetResolverOptions = {
  localAssets?: LocalAssetEntry[];
  verifyLocalAsset?: (
    ref: Extract<AssetRef, { status: 'ready' }>,
    requirement: AssetRequirement,
  ) => { ok: true } | { ok: false; reason: string };
};

const PLACEHOLDER_URI = 'asset://placeholder/image-context';

export const createAssetResolver = ({
  localAssets = [],
  verifyLocalAsset,
}: AssetResolverOptions = {}): AssetResolver => {
  const identityCache = new Map<string, AssetRef>();

  return {
    resolve: (requirement) => {
      const identityKey = requirement.identityKey?.trim();
      const cached = identityKey ? identityCache.get(identityKey) : undefined;
      if (cached) return cached;

      const local = localAssets.find((entry) => sameRequirement(entry.requirement, requirement));
      const resolved = resolveLocalEntry(local, requirement, verifyLocalAsset);

      if (identityKey) identityCache.set(identityKey, resolved);
      return resolved;
    },
  };
};

const resolveLocalEntry = (
  local: LocalAssetEntry | undefined,
  requirement: AssetRequirement,
  verifyLocalAsset: AssetResolverOptions['verifyLocalAsset'],
): AssetRef => {
  if (!local) return placeholderFor(requirement);

  const parsed = assetRefSchema.safeParse(local.ref);
  if (!parsed.success || parsed.data.status === 'placeholder') {
    return failedFor(requirement, 'Local asset entry is malformed.');
  }
  if (parsed.data.status === 'failed') return parsed.data;
  if (!verifyLocalAsset) {
    return failedFor(
      requirement,
      'Local ready asset was not verified before resolution.',
      parsed.data.uri,
    );
  }

  const verification = verifyLocalAsset(parsed.data, requirement);
  if (!verification.ok) return failedFor(requirement, verification.reason, parsed.data.uri);
  return parsed.data;
};

const placeholderFor = (requirement: AssetRequirement): AssetRef => ({
  status: 'placeholder',
  uri: PLACEHOLDER_URI,
  pendingRequirementId: requirementId(requirement),
});

const failedFor = (
  requirement: AssetRequirement,
  reason: string,
  uri = PLACEHOLDER_URI,
): AssetRef => ({
  status: 'failed',
  uri,
  requirementId: requirementId(requirement),
  reason,
});

export const resolveSceneAssets = (
  scene: SceneInstance,
  resolver: AssetResolver,
): ResolvedAssets => {
  const candidate = scene.props.assetRequirement;
  if (candidate === undefined) return NO_RESOLVED_ASSETS;

  const requirement = assetRequirementSchema.parse(candidate);
  return {
    [scene.id]: {
      [ASSET_REQUIREMENT_FIELD]: resolver.resolve(requirement),
    },
  };
};

const sameRequirement = (left: AssetRequirement, right: AssetRequirement): boolean =>
  left.type === right.type &&
  normalize(left.subject) === normalize(right.subject) &&
  left.treatment === right.treatment &&
  left.orientation === right.orientation;

const normalize = (value: string): string => value.trim().toLowerCase();

const requirementId = (requirement: AssetRequirement): string => {
  const identity = [
    requirement.type,
    normalize(requirement.subject),
    requirement.treatment,
    requirement.orientation,
    requirement.identityKey ?? '',
  ].join('|');

  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `req_${(hash >>> 0).toString(16).padStart(8, '0')}`;
};
