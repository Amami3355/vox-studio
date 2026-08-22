import type { LayoutDef } from '../../core/types';

export const lineChartLayouts = {
  standard: {
    slots: ['title', 'legend', 'plot', 'annotation'],
    description:
      'A title and optional legend above one proportional UTC plot. Point annotations stay inside the plot.',
  },
} as const satisfies Record<string, LayoutDef>;

export const lineChartGeometry = {
  titleMaxStep: 4,
  accentRuleHeight: 4,
  titleBottomSpace: 2,
} as const;

export type LineChartLayoutId = keyof typeof lineChartLayouts;
