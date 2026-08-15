import type React from 'react';
import type { MotionProfile } from '../design/motion';
import { useSpace, useTheme, useTypeSize } from './ThemeContext';
import { useEntrance } from './useEntrance';

/**
 * A spoken word or short phrase, punched onto the frame at the moment it is said.
 *
 * Distinct from `Callout`, and deliberately not a variant of it. A callout *explains*: it
 * draws a rule, sets its note in body type, and asks to be read alongside the thing it
 * annotates. A stamp *is* the thing — it repeats a word the narrator is saying at the
 * frame they say it, so it has to arrive at display scale or it reads as a caption of the
 * picture rather than as the picture's emphasis. Both were tried; the first pass reused
 * `Callout` and the result read as a small label in a corner.
 *
 * A solid ink plate rather than a translucent one, because this sits over an image whose
 * content the scene cannot know. Contrast that survives any photograph is worth more here
 * than the image showing through, and a plate the eye reads as deliberate is the whole
 * difference between an emphasis and a subtitle.
 */
export const Stamp: React.FC<{
  text: string;
  startFrame: number;
  profile: MotionProfile;
  step?: number;
}> = ({ text, startFrame, profile, step = 3 }) => {
  const theme = useTheme();
  const progress = useEntrance(startFrame, profile);
  const size = useTypeSize(step);
  const padX = useSpace(3);
  const padY = useSpace(2);

  /**
   * Settles *down* onto the frame rather than rising into it. A stamp that drifts upward
   * reads as the same entrance every other element in the scene uses; coming down the last
   * few pixels and over-scaling very slightly on the way is what makes it land.
   */
  const overshoot = 1 + (1 - progress) * 0.06;

  return (
    <div
      style={{
        display: 'inline-block',
        maxWidth: '100%',
        opacity: Math.min(1, progress * 2.2),
        transform: `translateY(${(1 - progress) * -14}px) scale(${overshoot})`,
        transformOrigin: 'left top',
      }}
    >
      <div
        style={{
          fontFamily: theme.type.display,
          fontSize: size,
          fontWeight: theme.type.weight.bold,
          letterSpacing: `${theme.type.tracking.tight * size}px`,
          lineHeight: 1.1,
          color: theme.color.bg,
          backgroundColor: theme.color.ink,
          padding: `${padY}px ${padX}px`,
          borderRadius: theme.radius[2],
          // The plate clips inside the scene's reveal, and the text is agent-written.
          minWidth: 0,
          overflowWrap: 'break-word',
        }}
      >
        {text}
      </div>
    </div>
  );
};
