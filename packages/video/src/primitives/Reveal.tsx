import type React from 'react';
import type { MotionProfile } from '../design/motion';
import { useEntrance } from './useEntrance';

export type RevealDirection = 'up' | 'down' | 'left' | 'right';

/** Generic clipped reveal. Wraps anything that should be wiped in rather than faded. */
export const Reveal: React.FC<{
  children: React.ReactNode;
  startFrame: number;
  profile: MotionProfile;
  direction?: RevealDirection;
  distance?: number;
  style?: React.CSSProperties;
}> = ({ children, startFrame, profile, direction = 'up', distance = 32, style }) => {
  const progress = useEntrance(startFrame, profile);
  const hidden = 1 - progress;

  const inset =
    direction === 'up'
      ? `${hidden * 100}% 0% 0% 0%`
      : direction === 'down'
        ? `0% 0% ${hidden * 100}% 0%`
        : direction === 'left'
          ? `0% ${hidden * 100}% 0% 0%`
          : `0% 0% 0% ${hidden * 100}%`;

  const axis = direction === 'up' || direction === 'down' ? 'Y' : 'X';
  const sign = direction === 'up' || direction === 'left' ? 1 : -1;

  return (
    <div
      style={{
        clipPath: `inset(${inset})`,
        transform: `translate${axis}(${hidden * distance * sign}px)`,
        opacity: Math.min(1, progress * 2),
        ...style,
      }}
    >
      {children}
    </div>
  );
};
