import type { CompileReport, SceneInstance, SceneMeta } from '../core/types';
/**
 * The four tools the Visual Planner is given. No MCP server in V1: the catalog is
 * internal, and a transport adds nothing while it stays internal.
 *
 * Two levels of reading. The agent first chooses on intent from a compact index that
 * stays in context permanently, then fills parameters from the full spec of the one
 * capability it picked.
 */
import { type CatalogEntry, buildCatalog } from './build';
import { type VideoPlan, validateScene, validateVideoPlan } from './validate';

export type CapabilityIndexEntry = Pick<
  SceneMeta,
  | 'id'
  | 'name'
  | 'family'
  | 'summary'
  | 'useWhen'
  | 'avoidWhen'
  | 'supportedCompositions'
  | 'requiresAssets'
  | 'recommendedDurationFrames'
>;

const catalog = buildCatalog();

const compact = (entry: CatalogEntry): CapabilityIndexEntry => ({
  id: entry.id,
  name: entry.name,
  family: entry.family,
  summary: entry.summary,
  useWhen: entry.useWhen,
  avoidWhen: entry.avoidWhen,
  supportedCompositions: entry.supportedCompositions,
  requiresAssets: entry.requiresAssets,
  recommendedDurationFrames: entry.recommendedDurationFrames,
});

/**
 * Returns the WHOLE compact index, ordered by lexical relevance to `intent`.
 *
 * Deliberately no filtering. With 8-12 capabilities the entire index costs a few
 * hundred tokens, so any cutoff would only add a failure mode — the right scene scored
 * out — to save context that does not need saving. Ordering still matters, because the
 * order a model reads options in biases which one it picks.
 */
export const searchScenes = (intent = ''): CapabilityIndexEntry[] => {
  const terms = tokenize(intent);
  return catalog.capabilities
    .map((entry, index) => ({ entry, index, score: score(entry, terms) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ entry }) => compact(entry));
};

/** Full spec for one capability: schema, soft constraints, actions, layouts, examples. */
export const getSceneSpec = (capabilityId: string): CatalogEntry => {
  const entry = catalog.capabilities.find((c) => c.id === capabilityId);
  if (!entry) {
    throw new Error(
      `Unknown capability "${capabilityId}". Known ids: ` +
        `${catalog.capabilities.map((c) => c.id).join(', ')}.`,
    );
  }
  return entry;
};

/** Validate one instance against its capability. No render involved. */
export const validateSceneTool = (instance: SceneInstance): CompileReport =>
  validateScene(instance);

/** Validate a whole plan: anchors, layouts, actions, soft limits, profile repetition. */
export const validateVideoPlanTool = (plan: VideoPlan): CompileReport => validateVideoPlan(plan);

export { validateScene, validateVideoPlan };
export type { VideoPlan };

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'on',
  'for',
  'and',
  'or',
  'with',
  'show',
  'display',
]);

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

const score = (entry: CatalogEntry, terms: string[]): number => {
  if (terms.length === 0) return 0;
  const haystack = [entry.id, entry.name, entry.family, entry.summary, ...entry.useWhen]
    .join(' ')
    .toLowerCase();
  const avoid = entry.avoidWhen.join(' ').toLowerCase();

  let total = 0;
  for (const term of terms) {
    if (haystack.includes(term)) total += 2;
    // A term appearing only in avoidWhen is evidence against this capability.
    else if (avoid.includes(term)) total -= 1;
  }
  return total;
};
