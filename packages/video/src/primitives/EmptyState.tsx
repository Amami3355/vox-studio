import type React from 'react';
import type { MotionProfile } from '../design/motion';
import { mix } from '../design/theme';
import { AnimatedText } from './AnimatedText';
import { useSpace, useTheme } from './ThemeContext';

/**
 * Shown when a scene has nothing to plot. An empty data array is a legitimate state,
 * not a failure: it degrades to a typographic frame, never to a black screen.
 */
export const EmptyState: React.FC<{
  message?: string;
  startFrame: number;
  profile: MotionProfile;
}> = ({ message = 'No data available', startFrame, profile }) => {
  const theme = useTheme();
  const gap = useSpace(3);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap,
        borderTop: `1px solid ${mix(theme.color.inkMuted, theme.color.bg, 0.75)}`,
        paddingTop: gap,
      }}
    >
      <AnimatedText
        startFrame={startFrame}
        profile={profile}
        font="body"
        step={1}
        color={theme.color.inkMuted}
        tracking={theme.type.tracking.wide}
        style={{ textTransform: 'uppercase' }}
      >
        {message}
      </AnimatedText>
    </div>
  );
};
