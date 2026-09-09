import type { SceneMeta } from '../../core/types';

/** The image occupies the allocated region, including when the compiler yields a half.
 * Foreground stays inset; background movement is clipped at the region boundary. */
export const imageContextMeta: SceneMeta = {
  id: 'image_context',
  name: 'ImageContextScene',
  family: 'context',
  summary:
    'Full-frame documentary image with concise, high-contrast editorial text overlaid for openings and transitions.',
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
    'preserving an entire diagram or explaining specific image details → image_detail',
  ],
  supportsEvents: true,
  requiresAssets: true,
  occupiesRegions: ['full'],
  supportedCompositions: ['full', 'left', 'right'],
  minDurationFrames: 90,
  recommendedDurationFrames: 180,
};
