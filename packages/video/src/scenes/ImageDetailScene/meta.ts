import type { SceneMeta } from '../../core/types';
export const imageDetailMeta: SceneMeta = {
  id: 'image_detail',
  name: 'ImageDetailScene',
  family: 'context',
  summary:
    'A full-frame explanatory image with anchored reframing and one replaceable text overlay. The whole view preserves all image edges by default; only focus events move the image.',
  useWhen: [
    'letting an illustration carry the explanation',
    'moving from a whole subject to a prepared detail on a spoken word',
    'reusing one image for several views across narration',
  ],
  avoidWhen: [
    'establishing context with one strong image and a short message rather than explaining prepared details → image_context',
    'showing ordered stages without dates → process_steps',
    'articulating parts of a flattened image requires separate assets or a schematic process → process_steps',
  ],
  supportsEvents: true,
  requiresAssets: true,
  occupiesRegions: ['full'],
  supportedCompositions: ['full'],
  minDurationFrames: 60,
  recommendedDurationFrames: 150,
};
