import type { SoftConstraints } from '../../core/types';
export const imageDetailConstraints: SoftConstraints = {
  headline: {
    recommendedMax: 50,
    onExceed: 'The title fits down and covers more of the image. Prefer a short introduction.',
    onExceedCode: 'TITLE_DENSITY',
  },
  caption: {
    recommendedMax: 120,
    onExceed: 'More caption lines cover more of the image. Keep only essential context.',
  },
};
