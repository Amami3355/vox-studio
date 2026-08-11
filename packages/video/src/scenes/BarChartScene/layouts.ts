/**
 * Internal composition variants.
 *
 * A composite scene is one component with several internal layouts and typed slots —
 * never a component that contains other scenes. Free nesting would make the safe-area
 * computation recursive and the studio's unit of editing ambiguous.
 *
 * Internal slots accept typed primitives (text, value, annotation, asset), not scenes.
 */
import type { LayoutDef } from '../../core/types';

export const barChartLayouts = {
  standard: {
    slots: ['title', 'chart'],
    description: 'Vertical columns under a headline. The default reading order.',
  },
  horizontal: {
    slots: ['title', 'chart'],
    description:
      'Horizontal bars with labels on the left. Use for long category names or for a ranking.',
  },
  withCallout: {
    slots: ['title', 'chart', 'annotation'],
    description:
      'Chart on the left, a reserved annotation column on the right. Use when the scene ' +
      'carries an `annotate` event.',
  },
} as const satisfies Record<string, LayoutDef>;

export type BarChartLayoutId = keyof typeof barChartLayouts;

export const barChartLayoutIds = Object.keys(barChartLayouts) as BarChartLayoutId[];
