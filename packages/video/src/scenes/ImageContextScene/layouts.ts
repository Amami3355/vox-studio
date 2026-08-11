import type { LayoutDef } from '../../core/types';

export const imageContextLayouts = {
  splitLeft: {
    slots: ['image', 'headline', 'caption'],
    description:
      'Editorial image on the left with a concise headline and optional caption on the right.',
  },
} as const satisfies Record<string, LayoutDef>;

/** Layout-owned geometry. Agents never author these proportions. */
export const splitLeftGeometry = {
  imageColumns: 7,
  copyColumns: 5,
} as const;

export type ImageContextLayoutId = keyof typeof imageContextLayouts;
