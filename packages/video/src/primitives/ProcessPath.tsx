import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { contentProgressAt } from '../design/motion';
import { useTheme } from './ThemeContext';

/** A schematic relationship between stages. Geometry implies order, never physical measurements. */
export const ProcessPath: React.FC<{ count: number; active: number; startFrame: number }> = ({
  count,
  active,
  startFrame,
}) => {
  const theme = useTheme();
  const progress = contentProgressAt(useCurrentFrame(), startFrame);
  const x = (index: number) => (count <= 1 ? 500 : 40 + (index * 920) / (count - 1));
  const position = active <= 0 ? x(0) : x(active - 1) + (x(active) - x(active - 1)) * progress;
  const radius = Math.min(22, 300 / Math.max(1, count));
  return (
    <svg
      viewBox="0 0 1000 100"
      style={{ width: '100%', display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      {count > 1 ? (
        <>
          <path d="M40 50 H960" fill="none" stroke={theme.color.inkMuted} strokeWidth={2} />
          {active >= 0 ? (
            <path
              d={`M40 50 H${position}`}
              fill="none"
              stroke={theme.color.accent}
              strokeWidth={4}
            />
          ) : null}
        </>
      ) : null}
      {Array.from({ length: count }, (_, index) => (
        <circle
          key={x(index)}
          cx={x(index)}
          cy={50}
          r={radius}
          fill={index <= active ? theme.color.accent : theme.color.surface}
          stroke={theme.color.inkMuted}
          strokeWidth={2}
        />
      ))}
      {active >= 0 && count > 0 ? (
        <circle
          cx={position}
          cy={50}
          r={radius + 6}
          fill="none"
          stroke={theme.color.ink}
          strokeWidth={3}
        />
      ) : null}
    </svg>
  );
};
