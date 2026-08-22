import type React from 'react';
import type { MotionProfile } from '../design/motion';
import { mix } from '../design/theme';
import { useSpace, useTheme, useTypeSize } from './ThemeContext';
import { useEntrance } from './useEntrance';

const CALLOUT_STYLE = {
  maxWidth: 520,
  bodyLineHeight: 1.32,
  ruleHeight: 2,
  labelSizeScale: 0.82,
  labelLineHeight: 1.2,
  gapScale: 0.5,
  bodyPaddingBlockScale: 0.5,
  bodyPaddingInlineScale: 0.75,
} as const;

/**
 * The primitive's measurable contract. A caller may reserve room for a Callout without
 * copying its private CSS numbers or teaching the primitive about that caller's layout.
 */
export const calloutLayoutMetrics = ({
  space,
  bodySize,
  labelSize,
}: {
  space: number;
  bodySize: number;
  labelSize: number;
}): {
  maxWidth: number;
  bodyLineHeight: number;
  labelFontSize: number;
  innerWidthInset: number;
  fixedHeightWithLabel: number;
} => {
  const gap = space * CALLOUT_STYLE.gapScale;
  const labelLineHeight = labelSize * CALLOUT_STYLE.labelSizeScale * CALLOUT_STYLE.labelLineHeight;
  const bodyPadding = space * CALLOUT_STYLE.bodyPaddingBlockScale * 2;
  return {
    maxWidth: CALLOUT_STYLE.maxWidth,
    bodyLineHeight: bodySize * CALLOUT_STYLE.bodyLineHeight,
    labelFontSize: labelSize * CALLOUT_STYLE.labelSizeScale,
    innerWidthInset: space * CALLOUT_STYLE.bodyPaddingInlineScale * 2,
    fixedHeightWithLabel: CALLOUT_STYLE.ruleHeight + labelLineHeight + gap * 2 + bodyPadding,
  };
};

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
        gap: pad * CALLOUT_STYLE.gapScale,
        opacity: Math.min(1, progress * 1.8),
        transform: `translateY(${(1 - progress) * 18}px)`,
        maxWidth: CALLOUT_STYLE.maxWidth,
      }}
    >
      <div
        style={{
          height: CALLOUT_STYLE.ruleHeight,
          width: `${Math.min(1, progress * 1.2) * 100}%`,
          minWidth: 40,
          background: color,
        }}
      />
      {label ? (
        <div
          style={{
            fontFamily: theme.type.mono,
            fontSize: labelSize * CALLOUT_STYLE.labelSizeScale,
            lineHeight: CALLOUT_STYLE.labelLineHeight,
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
          lineHeight: CALLOUT_STYLE.bodyLineHeight,
          color: theme.color.ink,
          textAlign: align,
          background: mix(theme.color.surface, theme.color.bg, 0.2),
          padding: `${pad * CALLOUT_STYLE.bodyPaddingBlockScale}px ${pad * CALLOUT_STYLE.bodyPaddingInlineScale}px`,
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
