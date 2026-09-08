import type { SoftConstraints } from '../../core/types';
export const processStepsConstraints: SoftConstraints = {
  headline: {
    recommendedMax: 50,
    onExceed: 'The process title fits down to remain within the frame.',
    onExceedCode: 'TITLE_DENSITY',
  },
  steps: {
    recommendedMax: 8,
    onEmpty: 'The title and an unavailable-process label remain; no stages are invented.',
    onExceed: 'Stage markers become smaller; only active-stage copy is displayed.',
  },
};
