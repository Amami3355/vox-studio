import type React from 'react';
import type { MotionProfile } from '../design/motion';
import { useEntrance } from './useEntrance';

export const ACCENT_RULE_WIDTH = 96;
export const ACCENT_RULE_HEIGHT = 4;

/** The shared editorial rule that anchors a data-scene title. */
export const AccentRule: React.FC<{
  accent: string;
  profile: MotionProfile;
  startFrame?: number;
}> = ({ accent, profile, startFrame = 0 }) => {
  const progress = useEntrance(startFrame, profile);
  return (
    <div
      style={{
        width: Math.round(ACCENT_RULE_WIDTH * Math.min(1, progress)),
        height: ACCENT_RULE_HEIGHT,
        flex: '0 0 auto',
        borderRadius: ACCENT_RULE_HEIGHT / 2,
        background: accent,
      }}
    />
  );
};
