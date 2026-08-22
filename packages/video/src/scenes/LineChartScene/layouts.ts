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
  /**
   * The accent rule above the title: its drawn length and its thickness.
   *
   * The length lived inline in `Component.tsx` while the thickness lived here, which made
   * one mark's geometry two facts in two files. It is the same rule `bar_chart` draws, at
   * the same size, and the two are meant to look like one editorial device across the
   * catalog — a reader who changes one and not the other has changed only half a decision.
   */
  accentRuleWidth: 96,
  accentRuleHeight: 4,
  titleBottomSpace: 2,
} as const;

export type LineChartLayoutId = keyof typeof lineChartLayouts;
