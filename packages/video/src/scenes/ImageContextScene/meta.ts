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
 * when a headline is sitting in it. Coexistence with a persistent element is bought
 * through `safeArea` — the compiler shrinks the frame, the layout reflows — and not by
 * pretending the scene occupies less than it does. `supportedCompositions: ['full']`
 * follows: with one layout, being composed *into* a half is a capability this scene does
 * not yet have. Both facts are inputs to the `PERSISTENT_ELEMENT_HIDDEN` rule the
 * compiler increment has to decide; neither is a defect to paper over here.
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
  supportedCompositions: ['full'],
  minDurationFrames: 90,
  recommendedDurationFrames: 180,
};
