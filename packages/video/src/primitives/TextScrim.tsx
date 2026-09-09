import type React from 'react';
import { imageOverlay } from '../design/theme';
import { useSpace, useTheme } from './ThemeContext';

/** Contrast plateau behind the content box, feathered only outside it.
 * Geometry follows wrapped text. A white source is still darkened by minimumOpacity. */
export const TextScrim: React.FC<{
  width: number;
  align: 'left' | 'right';
  children: React.ReactNode;
}> = ({ width, align, children }) => {
  const feather = useSpace(6);
  const reach = useSpace(7);
  // Reading margins are canvas pixels; feather spacing scales with density. Extend
  // the anchored side beyond that margin so the scrim cannot end before the frame edge.
  const edge = useTheme().grid.margin + feather;
  const { scrimRgb, minimumOpacity, edgeOpacity } = imageOverlay;
  const outward = align === 'right' ? 'left' : 'right';
  return (
    <div style={{ position: 'relative', width, flexShrink: 0 }}>
      <div
        data-scene-bleed="scrim"
        style={{
          position: 'absolute',
          top: -feather,
          bottom: -feather,
          left: align === 'right' ? -reach : -edge,
          right: align === 'right' ? -edge : -reach,
          background: `linear-gradient(to ${outward}, rgba(${scrimRgb}, ${edgeOpacity}) 0%, rgba(${scrimRgb}, ${minimumOpacity}) calc(100% - ${reach}px), rgba(${scrimRgb}, 0) 100%)`,
          maskImage: `linear-gradient(to bottom, transparent, black ${feather}px, black calc(100% - ${feather}px), transparent)`,
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
};
