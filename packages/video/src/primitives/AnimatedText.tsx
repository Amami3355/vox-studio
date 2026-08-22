import type React from 'react';
import type { MotionProfile } from '../design/motion';
import { useColumnWidth } from './Column';
import { useFrameBox } from './SlotFrame';
import { useTheme, useTypeSize } from './ThemeContext';
import { MAX_HEADER_SHARE, TITLE_LINE_HEIGHT, TITLE_MAX_WIDTH, useTitleStep } from './titleFit';
import { useEntrance } from './useEntrance';

export type TextRole = 'display' | 'displayAlt' | 'body' | 'mono';

/**
 * The faces that count as display type, wherever the distinction has to be made.
 *
 * One list, because there are two readers and they must not drift: this component decides
 * whether a run publishes `data-display-role`, and `runtime/StressControl.tsx` decides
 * whether to measure it. A face in one and not the other is a run of display type that
 * marks itself and is never checked, or is checked and never marks itself.
 */
export const DISPLAY_ROLES = ['display', 'displayAlt'] as const satisfies readonly TextRole[];

/** Whether a role is one of them. The widening lives here rather than at each call site. */
export const isDisplay = (role: TextRole): boolean =>
  (DISPLAY_ROLES as readonly TextRole[]).includes(role);

/**
 * What a run of display type is *for*, which decides how much of its scene it may take.
 *
 * A `header` labels something else on the frame and has to leave room for it, so
 * `MAX_HEADER_SHARE` applies — a header may take half its scene and no more. A
 * `statement` **is** the scene: a pull-quote has nothing underneath it to crowd out, and
 * the only ceiling that means anything for it is the box it was given, which the safe-area
 * and clipping checks already measure.
 *
 * Published into the DOM as `data-display-role`, because the one place the distinction can
 * be *checked* is the browser — what a run of type actually cost is a browser fact, not a
 * pixel one and not something a still carries. `header` is the default and
 * is left unmarked: a run of display type nobody has classified is held to the stricter
 * rule, so forgetting to declare cannot buy a scene a larger budget.
 */
export type DisplayRole = 'header' | 'statement';

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
  /** Only meaningful for display type. See `DisplayRole`. */
  displayRole?: DisplayRole;
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
  displayRole,
  style,
}) => {
  const theme = useTheme();
  const size = useTypeSize(step);
  const progress = useEntrance(startFrame, profile);

  const rise = (1 - progress) * size * 0.42;

  return (
    <div style={{ overflow: 'hidden', paddingBottom: size * 0.14, maxWidth }}>
      <div
        data-display-role={isDisplay(font) ? (displayRole ?? 'header') : undefined}
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
  /**
   * Whether this run of display type labels the frame or *is* it. See `DisplayRole`.
   *
   * A header is the default, and it brings `MAX_HEADER_SHARE` with it: the fit steps down
   * the scale until the string wraps into a height its scene can carry, rather than only
   * until its widest word fits. A statement declines the ceiling — not the fit. The
   * width fit still runs, and the box still bounds it; what changes is that a pull-quote
   * is no longer asked to keep inside half the frame, which for a 240-character
   * quote — a quote that *is* the frame — is not a question worth asking.
   *
   * Named `displayRole` and not `role`: on a component that renders a `div`, `role` is the
   * ARIA attribute, and this is not one.
   */
  displayRole?: DisplayRole;
}> = ({ children, startFrame, profile, color, maxStep, displayRole = 'header' }) => {
  const theme = useTheme();
  /**
   * A header's budget is a share of the scene's own box, which is the thing it can eat.
   * The frame box and not the column: a headline down a 5/12 column still has the whole
   * scene underneath it, and it is the scene the rule is protecting.
   */
  const box = useFrameBox();
  const step = useTitleStep(
    children,
    useColumnWidth(),
    maxStep,
    displayRole === 'header' ? box.height * MAX_HEADER_SHARE : undefined,
  );

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
      lineHeight={TITLE_LINE_HEIGHT}
      displayRole={displayRole}
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
