import type { SoftConstraints } from '../../core/types';

export const imageContextConstraints: SoftConstraints = {
  headline: {
    recommendedMin: 1,
    recommendedMax: 40,
    onEmpty: 'The asset subject becomes the only visible context label.',
    onExceed: 'The headline drops one step of the type scale.',
  },
  caption: {
    recommendedMax: 120,
    onExceed: 'Shorten the caption to preserve an image-led composition.',
  },
};
