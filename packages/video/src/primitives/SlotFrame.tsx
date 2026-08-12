/**
 * SlotFrame is the only place a scene touches its safe area.
 *
 * The agent picks a slot. The compiler resolves competing occupations into a safe
 * area in percentages. The component receives that safe area and nothing else — it
 * never sees a slot, and the agent never sees a percentage.
 */
import type React from 'react';
import { createContext, useContext, useMemo } from 'react';
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

/** The box a scene was actually given, in canvas px. */
export type FrameBox = { width: number; height: number };

const FrameBoxCtx = createContext<FrameBox>({ width: WIDTH, height: HEIGHT });

/**
 * The shape of the box, for a layout that has more than one arrangement.
 *
 * Shrinking type is the right degradation for a scene that is merely tighter; it is the
 * wrong one for a scene handed half the frame, where a column split becomes two columns
 * too narrow for their own words. Such a layout needs to be *drawn differently*, and to
 * do that it has to know what it got.
 *
 * A shape, never a region: the width and the height, with no way back to the slot they
 * came from. The component still cannot name `left`, and the scene still cannot derive
 * this itself — the margin and the camera allowance are SlotFrame's arithmetic.
 */
export const useFrameBox = (): FrameBox => useContext(FrameBoxCtx);

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

  const box = useMemo(
    () => ({ width: WIDTH - left - right, height: HEIGHT - top - bottom }),
    [left, right, top, bottom],
  );

  const areaRatio = (box.width * box.height) / (WIDTH * HEIGHT);
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
      <FrameBoxCtx.Provider value={box}>
        <DensityProvider value={density}>{children}</DensityProvider>
      </FrameBoxCtx.Provider>
    </AbsoluteFill>
  );
};
