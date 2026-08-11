/**
 * SlotFrame is the only place a scene touches its safe area.
 *
 * The agent picks a slot. The compiler resolves competing occupations into a safe
 * area in percentages. The component receives that safe area and nothing else — it
 * never sees a slot, and the agent never sees a percentage.
 */
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import type { SafeArea } from '../core/types';
import { HEIGHT, WIDTH } from '../design/theme';
import { cameraInset, useCameraBounds } from './CameraRig';
import { DensityProvider, useTheme } from './ThemeContext';

/**
 * Below this share of the canvas the type scale starts shrinking, so a scene squeezed
 * into half the frame degrades instead of overflowing.
 */
const DENSITY_FLOOR = 0.72;

export const SlotFrame: React.FC<{
  safeArea: SafeArea;
  children: React.ReactNode;
  /** Set false for full-bleed content (an image plate) that must ignore the margin. */
  padded?: boolean;
}> = ({ safeArea, children, padded = true }) => {
  const theme = useTheme();
  const margin = padded ? theme.grid.margin : 0;

  // Whatever the camera will do at its most extreme frame, the margin survives it.
  const bounds = useCameraBounds();
  const camera = padded ? cameraInset(bounds) : { x: 0, y: 0 };

  const top = margin + camera.y + (safeArea.top / 100) * HEIGHT;
  const right = margin + camera.x + (safeArea.right / 100) * WIDTH;
  const bottom = margin + camera.y + (safeArea.bottom / 100) * HEIGHT;
  const left = margin + camera.x + (safeArea.left / 100) * WIDTH;

  const areaRatio = ((WIDTH - left - right) * (HEIGHT - top - bottom)) / (WIDTH * HEIGHT);
  const density = Math.max(DENSITY_FLOOR, Math.min(1, Math.sqrt(Math.max(areaRatio, 0.01))));

  return (
    <AbsoluteFill
      style={{
        paddingTop: top,
        paddingRight: right,
        paddingBottom: bottom,
        paddingLeft: left,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <DensityProvider value={density}>{children}</DensityProvider>
    </AbsoluteFill>
  );
};
