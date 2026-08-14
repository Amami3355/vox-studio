import type React from 'react';
import type { MotionProfile } from '../design/motion';
import { useTheme, useTypeSize } from './ThemeContext';
import { TITLE_MAX_WIDTH, titleStep } from './titleFit';
import { useEntrance } from './useEntrance';

export type TextRole = 'display' | 'body' | 'mono';

/**
 * Text with a motivated entrance: a clipped rise, never a bare fade. The clip is what
 * makes it read as typography being set rather than a layer turning on.
 */
export const AnimatedText: React.FC<{
  children: React.ReactNode;
  startFrame: number;
  profile: MotionProfile;
  font?: TextRole;
  /** Index into the theme type scale. */
  step?: number;
  weight?: number;
  color?: string;
  tracking?: number;
  lineHeight?: number;
  maxWidth?: number | string;
  style?: React.CSSProperties;
}> = ({
  children,
  startFrame,
  profile,
  font = 'body',
  step = 2,
  weight,
  color,
  tracking,
  lineHeight = 1.08,
  maxWidth,
  style,
}) => {
  const theme = useTheme();
  const size = useTypeSize(step);
  const progress = useEntrance(startFrame, profile);

  const rise = (1 - progress) * size * 0.42;

  return (
    <div style={{ overflow: 'hidden', paddingBottom: size * 0.14, maxWidth }}>
      <div
        style={{
          fontFamily: theme.type[font],
          fontSize: size,
          fontWeight: weight ?? theme.type.weight.regular,
          color: color ?? theme.color.ink,
          letterSpacing: `${(tracking ?? theme.type.tracking.normal) * size}px`,
          lineHeight,
          transform: `translateY(${rise}px)`,
          opacity: Math.min(1, progress * 1.6),
          fontVariantNumeric: 'tabular-nums',
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export const SceneTitle: React.FC<{
  children: string;
  startFrame: number;
  profile: MotionProfile;
  color?: string;
  /**
   * Override the step the string would have chosen, for a scene whose *box* has the
   * stronger claim. `titleStep` reads length only, which is the whole story on the full
   * canvas and half of it in a composed frame: the same 68 characters that take two lines
   * across 1497px take five down a 537px column, and five lines of display type is a
   * header that has eaten its own scene.
   */
  step?: number;
}> = ({ children, startFrame, profile, color, step }) => {
  const theme = useTheme();
  return (
    <AnimatedText
      startFrame={startFrame}
      profile={profile}
      font="display"
      step={step ?? titleStep(children.length)}
      weight={theme.type.weight.bold}
      tracking={theme.type.tracking.tight}
      color={color}
      maxWidth={`${TITLE_MAX_WIDTH * 100}%`}
      lineHeight={1.02}
    >
      {children}
    </AnimatedText>
  );
};

/** Small uppercase label above a title. Carries family or section context. */
export const Eyebrow: React.FC<{
  children: React.ReactNode;
  startFrame: number;
  profile: MotionProfile;
  color?: string;
}> = ({ children, startFrame, profile, color }) => {
  const theme = useTheme();
  return (
    <AnimatedText
      startFrame={startFrame}
      profile={profile}
      font="body"
      step={0}
      weight={theme.type.weight.medium}
      tracking={theme.type.tracking.wide}
      color={color ?? theme.color.accent}
      style={{ textTransform: 'uppercase' }}
    >
      {children}
    </AnimatedText>
  );
};
