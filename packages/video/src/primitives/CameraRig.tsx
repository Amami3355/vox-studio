/**
 * The only component allowed to move the camera. A scene never writes a transform.
 *
 * Every camera type over-scales slightly before translating, so a drift can never
 * expose the edge of the frame.
 *
 * The subtlety: scaling the frame also scales the safe margins away. A 12% push-in on a
 * 96px margin leaves roughly one pixel of it, and the title ends up touching the edge —
 * which fails the "nothing touches the edges" criterion at exactly the moment the shot
 * is meant to look most deliberate. So the rig publishes the worst-case transform it
 * will ever apply, and SlotFrame inflates its padding to match. The usable area is
 * therefore constant for the whole shot: no reflow mid-scene, and the cost of a big
 * push-in is visible as a tighter frame rather than as a crop.
 */
import type React from 'react';
import { createContext, useContext } from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import type { CameraSpec, MotionProfile } from '../design/motion';
import { HEIGHT, WIDTH } from '../design/theme';
import { useSceneProgress } from './useEntrance';

export type CameraBounds = {
  /** Largest scale factor reached at any frame of the scene. */
  maxScale: number;
  /** Largest translation, in canvas px, before scaling. */
  maxTranslateX: number;
  maxTranslateY: number;
};

const STILL: CameraBounds = { maxScale: 1, maxTranslateX: 0, maxTranslateY: 0 };

const CameraBoundsCtx = createContext<CameraBounds>(STILL);

export const useCameraBounds = (): CameraBounds => useContext(CameraBoundsCtx);

/** Extra inset, per side, needed for the safe margin to survive the camera. */
export const cameraInset = (bounds: CameraBounds): { x: number; y: number } => ({
  x: ((bounds.maxScale - 1) * WIDTH) / 2 + bounds.maxTranslateX * bounds.maxScale,
  y: ((bounds.maxScale - 1) * HEIGHT) / 2 + bounds.maxTranslateY * bounds.maxScale,
});

export const cameraBounds = (camera: CameraSpec): CameraBounds => {
  switch (camera.type) {
    case 'drift':
      return {
        maxScale: 1 + camera.amount,
        maxTranslateX: camera.amount * 35,
        maxTranslateY: camera.amount * 20,
      };
    case 'pushIn':
      return { maxScale: 1 + camera.amount, maxTranslateX: 0, maxTranslateY: 0 };
    case 'panDrift':
      return { maxScale: 1 + camera.amount, maxTranslateX: camera.amount * 60, maxTranslateY: 0 };
    default:
      return STILL;
  }
};

type Transform = { scale: number; x: number; y: number };

const transformAt = (camera: CameraSpec, progress: number): Transform => {
  switch (camera.type) {
    case 'drift': {
      const a = camera.amount;
      return {
        scale: 1 + a,
        x: interpolate(progress, [0, 1], [-a * 35, a * 35]),
        y: interpolate(progress, [0, 1], [a * 20, -a * 20]),
      };
    }
    case 'pushIn': {
      const a = camera.amount;
      return {
        scale: interpolate(progress, [0, 1], [1, 1 + a], {
          easing: Easing.bezier(0.22, 1, 0.36, 1),
        }),
        x: 0,
        y: 0,
      };
    }
    case 'panDrift': {
      const a = camera.amount;
      const ease = Easing.bezier(0.4, 0, 0.2, 1);
      // Pans laterally while easing out of the initial over-scale: a wide shot settling.
      return {
        scale: interpolate(progress, [0, 1], [1 + a, 1 + a * 0.4], { easing: ease }),
        x: interpolate(progress, [0, 1], [-a * 60, a * 60], { easing: ease }),
        y: 0,
      };
    }
    default:
      return { scale: 1, x: 0, y: 0 };
  }
};

export const CameraRig: React.FC<{
  profile: MotionProfile;
  durationInFrames: number;
  children: React.ReactNode;
}> = ({ profile, durationInFrames, children }) => {
  const progress = useSceneProgress(durationInFrames);
  const { camera } = profile;
  const bounds = cameraBounds(camera);

  if (camera.type === 'none') {
    return (
      <CameraBoundsCtx.Provider value={STILL}>
        <AbsoluteFill>{children}</AbsoluteFill>
      </CameraBoundsCtx.Provider>
    );
  }

  const { scale, x, y } = transformAt(camera, progress);

  return (
    <CameraBoundsCtx.Provider value={bounds}>
      <AbsoluteFill
        style={{
          transform: `scale(${scale}) translate(${x}px, ${y}px)`,
          transformOrigin: 'center center',
          willChange: 'transform',
        }}
      >
        {children}
      </AbsoluteFill>
    </CameraBoundsCtx.Provider>
  );
};
