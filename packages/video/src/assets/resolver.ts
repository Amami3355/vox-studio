/**
 * The minimal Asset Resolver: identity cache, local library, placeholder fallback.
 *
 * Three paths and no fourth. Nothing here touches the network, the clock, the filesystem
 * or a credential, because the whole point of the increment is that a preview is
 * available immediately and identically on every machine.
 *
 * The rule that makes it deterministic is **identity first**. When a requirement carries
 * an `identityKey`, that key alone decides the outcome: the library is searched for an
 * entry declaring the same key, and the placeholder id is derived from the key rather
 * than from the wording of whichever requirement happened to arrive first. Falling back
 * to subject matching for a keyed requirement would reintroduce exactly the bug this
 * shape exists to prevent — two requirements sharing an identity resolving differently
 * depending on the order they were resolved in.
 */
import {
  ASSET_REQUIREMENT_FIELD,
  type AssetRef,
  type AssetRequirement,
  NO_RESOLVED_SCENE_ASSETS,
  type ResolvedSceneAssets,
  assetRefSchema,
  assetRequirementSchema,
} from '../core/assets';
import type { SceneInstance } from '../core/types';

export type AssetResolver = {
  resolve: (requirement: AssetRequirement) => AssetRef;
};

/**
 * A library entry may be `ready` or already `failed`, never `placeholder` — a
 * placeholder is what the resolver *produces* when the library has nothing, so an entry
 * claiming that status would be a library declaring its own absence.
 */
export type LocalAssetEntry = {
  requirement: AssetRequirement;
  ref: Exclude<AssetRef, { status: 'placeholder' }>;
};

export type LocalAssetVerification = { ok: true } | { ok: false; reason: string };

/**
 * Entries and their verifier are one value, not two options.
 *
 * A `ready` entry is a *claim* that local media exists and can be decoded; trusting it
 * unverified is how a broken file reaches the renderer as a black frame. Making `verify`
 * a required member of the library means a caller cannot supply entries and forget the
 * check, and — because no library at all is a perfectly good state — the resolver never
 * has to invent a "present but unverifiable" outcome that the domain does not have.
 */
export type LocalAssetLibrary = {
  entries: LocalAssetEntry[];
  verify: (
    ref: Extract<AssetRef, { status: 'ready' }>,
    requirement: AssetRequirement,
  ) => LocalAssetVerification;
};

export type AssetResolverOptions = {
  /** Accepted, Run/project-owned material. It has precedence over repository stand-ins. */
  projectLibrary?: LocalAssetLibrary;
  /** Canonical repository-controlled material. Kept as `library` for compatibility. */
  library?: LocalAssetLibrary;
};

/** Capability-neutral: any scene needing a picture degrades to the same plate. */
export const PLACEHOLDER_ASSET_URI = 'asset://placeholder/image';

export const createAssetResolver = ({
  projectLibrary,
  library,
}: AssetResolverOptions = {}): AssetResolver => {
  /**
   * Explicit resolver state, scoped to one project resolution. Not module-global and not
   * React state — a second resolver starts with a second, empty cache.
   */
  const identityCache = new Map<string, AssetRef>();

  return {
    resolve: (requirement) => {
      const identityKey = requirement.identityKey;

      if (identityKey === undefined) {
        return fromLibraries([projectLibrary, library], requirement, (candidate) =>
          findBySubject(candidate, requirement),
        );
      }

      const cached = identityCache.get(identityKey);
      if (cached) return cached;

      const resolved = fromLibraries([projectLibrary, library], requirement, (candidate) =>
        findByIdentity(candidate, identityKey),
      );
      identityCache.set(identityKey, resolved);
      return resolved;
    },
  };
};

const fromLibraries = (
  libraries: (LocalAssetLibrary | undefined)[],
  requirement: AssetRequirement,
  find: (library: LocalAssetLibrary | undefined) => LocalAssetEntry | undefined,
): AssetRef => {
  for (const library of libraries) {
    const entry = find(library);
    if (entry && library) return fromEntry(entry, requirement, library);
  }
  return placeholderFor(requirement);
};

const findByIdentity = (
  library: LocalAssetLibrary | undefined,
  identityKey: string,
): LocalAssetEntry | undefined =>
  library?.entries.find((entry) => entry.requirement.identityKey === identityKey);

const findBySubject = (
  library: LocalAssetLibrary | undefined,
  requirement: AssetRequirement,
): LocalAssetEntry | undefined =>
  library?.entries.find(
    (entry) =>
      entry.requirement.type === requirement.type &&
      normalize(entry.requirement.subject) === normalize(requirement.subject) &&
      entry.requirement.treatment === requirement.treatment &&
      entry.requirement.orientation === requirement.orientation,
  );

const fromEntry = (
  entry: LocalAssetEntry | undefined,
  requirement: AssetRequirement,
  library: LocalAssetLibrary | undefined,
): AssetRef => {
  if (!entry || !library) return placeholderFor(requirement);

  /**
   * Parsed rather than trusted even though the type says `ready | failed`: a library is
   * data, and the next one may well be loaded from JSON. The `placeholder` branch below
   * is unreachable through the type and reachable through a malformed entry.
   */
  const parsed = assetRefSchema.safeParse(entry.ref);
  if (!parsed.success || parsed.data.status === 'placeholder') {
    return failedFor(requirement, 'Local asset entry is malformed.');
  }
  if (parsed.data.status === 'failed') return parsed.data;

  const verification = library.verify(parsed.data, requirement);
  if (!verification.ok) return failedFor(requirement, verification.reason, parsed.data.uri);
  return parsed.data;
};

const placeholderFor = (requirement: AssetRequirement): AssetRef => ({
  status: 'placeholder',
  uri: PLACEHOLDER_ASSET_URI,
  pendingRequirementId: assetRequirementId(requirement),
});

const failedFor = (
  requirement: AssetRequirement,
  reason: string,
  uri = PLACEHOLDER_ASSET_URI,
): AssetRef => ({
  status: 'failed',
  uri,
  requirementId: assetRequirementId(requirement),
  reason,
});

/**
 * Resolves the assets of one SceneInstance without touching its props.
 *
 * Returns the scene's own resolved assets rather than a map keyed by scene id: the
 * caller already knows which scene it asked about, and the plan-level map is the
 * compiler's shape to build when the compiler exists.
 */
export const resolveSceneAssets = (
  scene: SceneInstance,
  resolver: AssetResolver,
): ResolvedSceneAssets => {
  const candidate = scene.props[ASSET_REQUIREMENT_FIELD];
  if (candidate === undefined) return NO_RESOLVED_SCENE_ASSETS;

  const requirement = assetRequirementSchema.parse(candidate);
  return { [ASSET_REQUIREMENT_FIELD]: resolver.resolve(requirement) };
};

const normalize = (value: string): string => value.trim().toLowerCase();

/**
 * The identifier a compile report will use to name what is still missing.
 *
 * Derived from the identity when there is one, so every requirement sharing that
 * identity names the same pending asset, and from the semantic tuple otherwise.
 */
export const assetRequirementId = (requirement: AssetRequirement): string => {
  const identity =
    requirement.identityKey === undefined
      ? [
          'semantic',
          requirement.type,
          normalize(requirement.subject),
          requirement.treatment,
          requirement.orientation,
        ].join('|')
      : `identity|${requirement.identityKey}`;

  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `req_${(hash >>> 0).toString(16).padStart(8, '0')}`;
};
