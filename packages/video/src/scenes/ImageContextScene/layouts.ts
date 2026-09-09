import type { LayoutDef } from '../../core/types';

/** Placements share one temporal grammar: image, message, then an unobstructed hold.
 * Choose the text area opposite the subject. The camera only moves the image. */
export const imageContextLayouts = {
  bottomLeft: {
    slots: ['image', 'headline', 'caption'],
    description:
      'Full-frame image with a short message at bottom left. Choose for a subject on the right; request open space on the left.',
  },
  bottomRight: {
    slots: ['image', 'headline', 'caption'],
    description:
      'Full-frame image with a short message at bottom right. Choose for a subject on the left; request open space on the right.',
  },
  lowerThird: {
    slots: ['image', 'headline', 'caption'],
    description:
      'Full-frame image with a wider, shallow text band along the bottom. Keep the subject above the band; use for a broad establishing view.',
  },
  splitLeft: {
    slots: ['image', 'headline', 'caption'],
    description:
      'Compatibility name for saved plans. Now renders the full-frame image with bottom-right text; choose bottomRight for new scenes.',
  },
} as const satisfies Record<string, LayoutDef>;

export const imageContextGeometry = {
  columnShare: 0.58,
  bandShare: 0.86,
  narrowBelowAspect: 1.2,
  titleHeightShare: 0.36,
} as const;
