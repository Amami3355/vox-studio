import type React from 'react';
import type { MotionProfile } from '../design/motion';
import { useColumnWidth } from './Column';
import { useTheme, useTypeSize } from './ThemeContext';
import { TITLE_MAX_WIDTH, useTitleStep } from './titleFit';
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
          /**
           * The last resort under the clip, and the reason no string can ever be cut.
           *
           * `overflow: hidden` above is what makes the entrance read as a rise, and it
           * cuts anything wider than the box as a side effect. A word that cannot fit
           * should break, which is ordinary editorial typography; being sliced mid-glyph
           * is not. `break-word` and not `anywhere` — it breaks only when a word genuinely
           * does not fit, and leaves intrinsic sizing alone, so no existing layout moves.
           *
           * For display type this sits *below* `useTitleStep`: a headline shrinks down the
           * scale first, and only breaks if it is still too wide at the floor.
           */
          overflowWrap: 'break-word',
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/**
 * A headline, sized to fit the column it is in.
 *
 * The fit is not optional and not the caller's job. A scene declares its columns with
 * `ColumnProvider` — or declares nothing, and gets the whole frame box — and the title
 * reads that and steps down the scale until its widest word fits. Passing the fitted step
 * in from outside used to work and was the wrong shape: it made correctness something each
 * new capability had to remember, and the one that forgot would clip silently.
 */
export const SceneTitle: React.FC<{
  children: string;
  startFrame: number;
  profile: MotionProfile;
  color?: string;
  /**
   * A ceiling on the step, for a scene whose *box* has the stronger claim — a composed
   * frame where the same 68 characters that take two lines across 1497px take five down a
   * 537px column, and five lines of display type is a header that has eaten its own scene.
   *
   * A ceiling and never the answer: the fit still applies underneath it. Raising it cannot
   * make a title overflow, and omitting it cannot make one clip.
   */
  maxStep?: number;
}> = ({ children, startFrame, profile, color, maxStep }) => {
  const theme = useTheme();
  const step = useTitleStep(children, useColumnWidth(), maxStep);

  return (
    <AnimatedText
      startFrame={startFrame}
      profile={profile}
      font="display"
      step={step}
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
