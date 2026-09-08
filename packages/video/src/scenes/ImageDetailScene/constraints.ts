import type { SoftConstraints } from '../../core/types';
export const imageDetailConstraints: SoftConstraints = {
  headline: {
    recommendedMax: 50,
    onExceed: 'The title fits down and leaves less space for the image.',
    onExceedCode: 'TITLE_DENSITY',
  },
  caption: { recommendedMax: 120, onExceed: 'More caption lines leave less height for the image.' },
};
