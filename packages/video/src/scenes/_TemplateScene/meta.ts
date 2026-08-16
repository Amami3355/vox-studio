/**
 * TEMPLATE — copy this folder, do not register this scene.
 *
 * Selection metadata. This is what the agent reads to *choose* the scene, before it ever
 * reads the schema, so write it for a reader who does not know the catalog.
 *
 * `avoidWhen` entries must redirect explicitly and must contain `→`; the catalog contract
 * enforces the arrow. One line of redirection is worth three paragraphs of description.
 *
 * `occupiesRegions` is what the scene *takes* when nobody contends. `supportedCompositions`
 * is what it can be *composed into* when somebody does. They are two different declarations
 * and they move independently — see ADR-0003. Declaring a composition is a claim that a
 * designed frame exists for it, which `tests/render/safe-area.test.ts` is what stops being
 * only a claim.
 */
import type { SceneMeta } from '../../core/types';

export const templateSceneMeta: SceneMeta = {
  // TODO snake_case, and it is the agent-facing name. It never changes after release.
  id: 'template_scene',
  // TODO the exported React component's name, PascalCase. Match the folder name.
  name: 'TemplateScene',
  // TODO one of: data | context | character | typography | geo | diagram.
  family: 'typography',
  summary: 'TODO one sentence an agent can choose on, without reading the schema.',
  useWhen: [
    // TODO at least one. Editorial intent, never mechanics.
    'stating a single claim with nothing else on the frame',
  ],
  avoidWhen: [
    // TODO at least one, each redirecting with `→` to the capability that fits better.
    'comparing numeric categories → bar_chart',
    'pairing a claim with a photograph → image_context',
  ],
  // TODO false unless `actions.ts` is a non-empty vocabulary the component actually reads.
  supportsEvents: true,
  // TODO true only if the schema carries an `assetRequirement`.
  requiresAssets: false,
  // TODO what the scene TAKES when nobody contends. `['full']` is the honest answer for
  // anything that leaves no quadrant empty, even a split one.
  occupiesRegions: ['full'],
  // TODO what the scene can be COMPOSED INTO when somebody does contend. Every entry is a
  // claim that a designed frame exists for it, and a render test has to hold that claim.
  supportedCompositions: ['full'],
  // TODO the floor below which this scene is unreadable, and the length it is drawn for.
  // Both are yours to measure; these two numbers are placeholders, not defaults.
  minDurationFrames: 60,
  recommendedDurationFrames: 150,
};
