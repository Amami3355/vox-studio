import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { type MotionProfile, springConfig, staggerFrames } from '../design/motion';

/**
 * Entrance progress for one element, 0 → 1.
 *
 * `startFrame` is the frame the element was asked to appear, which for event-driven
 * content is the frame carried by the event, not the start of the scene.
 */
export const useEntrance = (startFrame: number, profile: MotionProfile): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < startFrame) return 0;
  return spring({
    frame: frame - startFrame,
    fps,
    config: springConfig(profile),
  });
};

/** Entrance progress for sibling `index`, staggered per the profile. `unison` → no offset. */
export const useStaggeredEntrance = (
  startFrame: number,
  index: number,
  profile: MotionProfile,
): number => useEntrance(startFrame + staggerFrames(profile) * index, profile);

/** Linear 0 → 1 over the scene, for continuous camera motion. */
export const useSceneProgress = (durationInFrames: number): number => {
  const frame = useCurrentFrame();
  if (durationInFrames <= 1) return 0;
  return Math.min(1, Math.max(0, frame / (durationInFrames - 1)));
};
