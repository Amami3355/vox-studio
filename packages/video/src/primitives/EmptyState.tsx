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
  /**
   * The tone the label is set in, and the ground its rule recedes into.
   *
   * Both default to the theme's own, which is the right answer for every scene that sits on
   * the film's backdrop. `typographic_statement` does not — it paints an emphasis role to
   * full bleed — and `inkMuted` on a saturated ground is not a degraded frame, it is an
   * illegible one. So the two colours the empty state needs are inputs when a scene has
   * moved the ground out from under it, and are still the theme's the rest of the time.
   */
  color?: string;
  ground?: string;
}> = ({ message = 'No data available', startFrame, profile, color, ground }) => {
  const theme = useTheme();
  const gap = useSpace(3);
  const tone = color ?? theme.color.inkMuted;
  const into = ground ?? theme.color.bg;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap,
        borderTop: `1px solid ${mix(tone, into, 0.75)}`,
        paddingTop: gap,
      }}
    >
      <AnimatedText
        startFrame={startFrame}
        profile={profile}
        font="body"
        step={1}
        color={tone}
        tracking={theme.type.tracking.wide}
        style={{ textTransform: 'uppercase' }}
      >
        {message}
      </AnimatedText>
    </div>
  );
};
