import type { LayoutDef } from '../../core/types';
export const imageDetailLayouts = {
  plate: {
    slots: ['headline', 'image', 'caption'],
    description:
      'An image occupies the remaining frame between optional title and caption, with annotations over its lower edge.',
  },
} as const satisfies Record<string, LayoutDef>;
