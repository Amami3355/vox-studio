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

/**
 * The name of the attribute `SlotFrame` publishes its box height under.
 *
 * The same move `ColumnProvider` makes for a column's width, one level up and into the DOM
 * rather than into a context: the box a scene was given is a fact only this component
 * computes, and `runtime/StressControl.tsx` has to know it to say whether a header has
 * taken more of the scene than a header may. It reads the attribute and derives the ceiling
 * itself, rather than being told the answer by the thing it is checking.
 */
export const SCENE_BOX_ATTRIBUTE = 'data-scene-height';

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

/**
 * The box a safe area leaves, in canvas px — SlotFrame's arithmetic, extracted so that it
 * has one home rather than two.
 *
 * A capability that publishes what a composed box can hold has made a claim about *this*
 * function, and `meta.ts` has required since the scaffold that such a claim be paid for by
 * drawing the frame. A test can only hold it to that if it can ask the same question the
 * component asks, from the same numbers. Duplicating the margin and the camera allowance
 * in a test would produce a check that agrees with itself and with nothing else.
 */
export const frameBoxFor = (
  safeArea: SafeArea,
  { margin, camera }: { margin: number; camera: { x: number; y: number } },
): FrameBox => {
  const top = margin + camera.y + (safeArea.top / 100) * HEIGHT;
  const right = margin + camera.x + (safeArea.right / 100) * WIDTH;
  const bottom = margin + camera.y + (safeArea.bottom / 100) * HEIGHT;
  const left = margin + camera.x + (safeArea.left / 100) * WIDTH;
  return { width: WIDTH - left - right, height: HEIGHT - top - bottom };
};

/** The density a box earns, on the same terms `SlotFrame` provides it to its children. */
export const densityFor = (box: FrameBox): number => {
  const areaRatio = (box.width * box.height) / (WIDTH * HEIGHT);
  return Math.max(DENSITY_FLOOR, Math.min(1, Math.sqrt(Math.max(areaRatio, 0.01))));
};

export const SlotFrame: React.FC<{
  safeArea: SafeArea;
  children: React.ReactNode;
  /**
   * False when the scene sets its own margin instead of the grid's — an image plate that
   * wants a tighter, more editorial inset than `grid.margin`.
   *
   * It buys the design margin only. The camera allowance below is not negotiable, because
   * it is not a design choice: it is the arithmetic that makes whatever margin was chosen
   * mean the same thing at every frame of the shot.
   */
  gridMargin?: boolean;
  /** Media fills the allocated region; foreground retains the normal safe margins.
   * Put CameraRig inside this layer to move the image without moving the typography. */
  bleed?: React.ReactNode;
}> = ({ safeArea, children, gridMargin = true, bleed }) => {
  const theme = useTheme();
  const margin = gridMargin ? theme.grid.margin : 0;

  /**
   * Whatever the camera will do at its most extreme frame, the margin survives it.
   *
   * Applied unconditionally. A scene used to be able to decline this along with the grid
   * margin, and one did: `image_context` asked for a tighter inset and silently lost the
   * allowance with it, so a 12% push-in ate the 46px it had left and cropped the caption
   * off the canvas. Declining the margin is a statement about design; declining the
   * allowance was only ever a way to be wrong. If a scene ever genuinely needs to bleed,
   * that is a region saying so — not a whole frame giving up its physics.
   */
  const bounds = useCameraBounds();
  const camera = cameraInset(bounds);

  const top = margin + camera.y + (safeArea.top / 100) * HEIGHT;
  const right = margin + camera.x + (safeArea.right / 100) * WIDTH;
  const bottom = margin + camera.y + (safeArea.bottom / 100) * HEIGHT;
  const left = margin + camera.x + (safeArea.left / 100) * WIDTH;

  const box = useMemo(() => frameBoxFor(safeArea, { margin, camera }), [safeArea, margin, camera]);

  const density = densityFor(box);

  return (
    <AbsoluteFill
      style={
        bleed
          ? {
              clipPath: `inset(${safeArea.top}% ${safeArea.right}% ${safeArea.bottom}% ${safeArea.left}%)`,
            }
          : undefined
      }
    >
      {bleed ? (
        <AbsoluteFill
          data-scene-bleed="media"
          style={{
            top: `${safeArea.top}%`,
            right: `${safeArea.right}%`,
            bottom: `${safeArea.bottom}%`,
            left: `${safeArea.left}%`,
            width: 'auto',
            height: 'auto',
            overflow: 'hidden',
          }}
        >
          {bleed}
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill
        {...{ [SCENE_BOX_ATTRIBUTE]: box.height }}
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
    </AbsoluteFill>
  );
};
