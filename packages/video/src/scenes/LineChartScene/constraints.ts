import type { SoftConstraints } from '../../core/types';

export const lineChartConstraints: SoftConstraints = {
  points: {
    recommendedMin: 3,
    recommendedMax: 16,
    absoluteMax: 36,
    onExceed:
      'All observations and straight segments remain. Intermediate date labels and ordinary point markers thin deterministically; first, last, focused and annotated points stay labelled.',
    onEmpty: 'The title remains with a designed “No trend data available” empty state.',
  },
  series: {
    recommendedMax: 2,
    absoluteMax: 3,
    onExceed:
      'The third series remains fully plotted and identified in the legend, but the shot carries higher visual density.',
  },
  title: {
    recommendedMax: 48,
    onExceed: 'Title drops through the shared type-fitting ladder to preserve the plot.',
    onExceedCode: 'TITLE_DENSITY',
  },
};
