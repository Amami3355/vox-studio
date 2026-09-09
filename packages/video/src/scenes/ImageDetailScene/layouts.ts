import type { LayoutDef } from '../../core/types';
export const imageDetailLayouts = {
  plate: {
    slots: ['headline', 'image', 'caption'],
    description:
      'Full-frame image with one stable lower-left explanation. Optional introductory title and caption share that overlay; annotations replace both, and clearing leaves only the image. Reserve the lower-left for copy or leave copy empty.',
  },
} as const satisfies Record<string, LayoutDef>;

export const imageDetailGeometry = { copyWidthShare: 0.82, titleHeightShare: 0.25 } as const;
