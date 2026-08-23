/**
 * Selection metadata. This is what the agent reads to *choose* the scene, before it ever
 * reads the schema, so write it for a reader who does not know the catalog.
 *
 * The distinction every entry below polices: the character must *materially carry* the
 * explanation. A person who merely appears in contextual imagery is `image_context`, and
 * a claim that gains nothing from a figure is `typographic_statement` — choosing this
 * scene because a person is visible somewhere is the misuse the `avoidWhen` lines exist
 * to prevent.
 */
import type { SceneMeta } from '../../core/types';

export const characterExplainerMeta: SceneMeta = {
  id: 'character_explainer',
  name: 'CharacterExplainerScene',
  family: 'character',
  summary:
    'One resolved character cutout that materially carries an explanation, given restrained graphic motion and paired with concise copy.',
  useWhen: [
    'letting one recognisable figure or mascot visibly carry an explanation',
    'personifying a concept through a guide who holds the frame while the copy explains it',
    'giving a narrated emphasis a brief, repeatable visual reaction on the figure',
  ],
  avoidWhen: [
    'a person who only appears as documentary context → image_context',
    'attributing exact spoken words to a person → quote',
    'a claim that gains nothing from a character → typographic_statement',
    'comparing numeric categories → bar_chart',
    'uninterrupted character continuity across unrelated scene kinds → persistent_element',
  ],
  supportsEvents: true,
  requiresAssets: true,
  /**
   * The honest declaration for a split that leaves no quadrant empty: the copy column
   * occupies the other side of the frame, so claiming `left` or `right` would tell the
   * compiler a half is free when a headline is sitting in it.
   */
  occupiesRegions: ['full'],
  /**
   * Full-frame only, and deliberately so. A half frame is portrait, and this layout's
   * side-by-side proportion is a claim about a wide box: shrunk into half the canvas it
   * would not be a designed arrangement but an inferred one, which is exactly what
   * ADR-0003 decision 1 refuses. A `left` or `right` entry may appear here only after
   * that composed form has been drawn, inspected and given a real readable arrangement —
   * never by shrinking this one.
   */
  supportedCompositions: ['full'],
  minDurationFrames: 90,
  recommendedDurationFrames: 180,
};
