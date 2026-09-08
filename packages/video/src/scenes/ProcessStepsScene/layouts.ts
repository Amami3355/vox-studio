import type { LayoutDef } from '../../core/types';
export const processStepsLayouts = {
  path: {
    slots: ['headline', 'path', 'stage'],
    description:
      'A connecting path above the active stage and its explanation. Other stages remain as markers, preserving readable copy even for long sequences.',
  },
} as const satisfies Record<string, LayoutDef>;
