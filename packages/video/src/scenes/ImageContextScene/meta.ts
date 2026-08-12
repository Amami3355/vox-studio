/**
 * Selection metadata. This is what the agent reads to *choose* the scene, before it
 * ever reads the schema.
 *
 * `avoidWhen` entries redirect explicitly. One line of redirection is worth three
 * paragraphs of description.
 *
 * On `occupiesRegions: ['full']` — it is the honest declaration, not a placeholder for a
 * finer one. `splitLeft` is a 7/5 division *of the whole frame*: there is no quadrant it
 * leaves empty, so claiming `left` or `right` would tell the compiler a corner is free
 * when a headline is sitting in it. What the scene *takes* when nobody contends and what
 * it can be *composed into* when somebody does are two different declarations, and only
 * the second one moved.
 *
 * On `supportedCompositions` — the halves are here because `splitLeft` has a composed
 * form. A half frame is portrait, and a 7/5 column split of a portrait box gives a copy
 * column narrower than its own type, so the layout stacks the plate over the copy instead;
 * see `layouts.ts`. That is a designed frame, which is the whole of ADR-0003 decision 1:
 * the compiler picks among alternatives someone drew, and a composition declared here is a
 * claim that one exists. `tests/render/safe-area.test.ts` is what stops it being only a
 * claim.
 *
 * Under ADR-0003 the pair decides the outcome. A persistent element in a corner this scene
 * can clear now keeps its place while the scene yields into a half — the rung ADR-0003
 * calls "recompose", which no `image_context` scene could reach while this list read
 * `['full']`. An element the halves cannot clear either is still hidden, and still warns.
 */
import type { SceneMeta } from '../../core/types';

export const imageContextMeta: SceneMeta = {
  id: 'image_context',
  name: 'ImageContextScene',
  family: 'context',
  summary: 'Editorial image paired with concise context copy for openings and transitions.',
  useWhen: [
    'establishing a documentary subject with one strong image',
    'providing visual context before or after a data scene',
    'pairing a photo or illustration with a concise editorial claim',
  ],
  avoidWhen: [
    'comparing numeric categories → bar_chart',
    'locating a place or route → map',
    'presenting a typography-only statement → typographic_statement',
    'making a character carry the explanation → character_explainer',
  ],
  supportsEvents: false,
  requiresAssets: true,
  occupiesRegions: ['full'],
  supportedCompositions: ['full', 'left', 'right'],
  minDurationFrames: 90,
  recommendedDurationFrames: 180,
};
