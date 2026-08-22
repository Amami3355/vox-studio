import type React from 'react';
import type { MotionProfile } from '../design/motion';
import { mix } from '../design/theme';
import { useSpace, useTheme, useTypeSize } from './ThemeContext';
import { useEntrance } from './useEntrance';

/**
 * A short annotation pointing at something. Draws a rule rather than an arrow: at
 * documentary scale an arrowhead reads as a diagram, a rule reads as editorial.
 */
export const Callout: React.FC<{
  text: string;
  label?: string;
  startFrame: number;
  profile: MotionProfile;
  accent?: string;
  align?: 'left' | 'right';
}> = ({ text, label, startFrame, profile, accent, align = 'left' }) => {
  const theme = useTheme();
  const progress = useEntrance(startFrame, profile);
  const pad = useSpace(3);
  const size = useTypeSize(1);
  const labelSize = useTypeSize(0);
  const color = accent ?? theme.color.accentAlt;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'right' ? 'flex-end' : 'flex-start',
        gap: pad * 0.5,
        opacity: Math.min(1, progress * 1.8),
        transform: `translateY(${(1 - progress) * 18}px)`,
        maxWidth: 520,
      }}
    >
      <div
        style={{
          height: 2,
          width: `${Math.min(1, progress * 1.2) * 100}%`,
          minWidth: 40,
          background: color,
        }}
      />
      {label ? (
        <div
          style={{
            fontFamily: theme.type.mono,
            fontSize: labelSize * 0.82,
            color,
            letterSpacing: `${theme.type.tracking.wide * labelSize}px`,
            textTransform: 'uppercase',
            maxWidth: '100%',
          }}
        >
          {label}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: theme.type.body,
          fontSize: size,
          lineHeight: 1.32,
          color: theme.color.ink,
          textAlign: align,
          background: mix(theme.color.surface, theme.color.bg, 0.2),
          padding: `${pad * 0.5}px ${pad * 0.75}px`,
          borderRadius: theme.radius[2],
          // The annotation column clips while it is opening, and this text is agent-written.
          overflowWrap: 'break-word',
          /**
           * A callout never grows past the column it was given.
           *
           * `overflow-wrap: break-word` wraps a long token but leaves intrinsic sizing
           * alone — deliberately, per `AnimatedText` — so a flex item sized to fit-content
           * still asks for its max-content width and gets it. One unbreakable
           * ninety-character token therefore drew this plate straight off the canvas from
           * `timeline`'s annotation. Clamping the used width is the fix that changes
           * nothing for a callout that already fitted.
           */
          maxWidth: '100%',
        }}
      >
        {text}
      </div>
    </div>
  );
};
