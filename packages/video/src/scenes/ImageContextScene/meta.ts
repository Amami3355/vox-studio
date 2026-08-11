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
