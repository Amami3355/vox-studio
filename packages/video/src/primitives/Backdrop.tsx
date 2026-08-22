import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { mix } from '../design/theme';
import { useTheme } from './ThemeContext';

/**
 * The ground every scene sits on. A flat fill reads as a slide; a very low-contrast
 * radial lift reads as a lit set. Deterministic, no noise texture.
 *
 * `ground` is the one exception, and it is the exception the rule is written against. The
 * lift exists so that a scene does not read as a slide *laid on the film's own backdrop* —
 * it is the light in a room every shot shares. A chapter card is the frame where that room
 * changes: the ground is the theme's emphasis role taken to full bleed, and the brightness
 * change is the edit. Lit, a saturated full-canvas ground reads as a gradient, which is a
 * decoration; flat, it reads as a cut. So a scene that hands one in gets exactly the colour
 * it named, and every scene that does not is untouched.
 *
 * A colour and not a flag, because the colour still comes from `design/` — the caller
 * resolves a semantic role through `emphasisColor`, and this component has no more say over
 * the palette than it had before.
 */
export const Backdrop: React.FC<{ children?: React.ReactNode; ground?: string }> = ({
  children,
  ground,
}) => {
  const theme = useTheme();
  const lift = mix(theme.color.bg, theme.color.surface, 0.9);

  if (ground !== undefined) {
    return <AbsoluteFill style={{ backgroundColor: ground }}>{children}</AbsoluteFill>;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: theme.color.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 90% at 50% 0%, ${lift} 0%, ${theme.color.bg} 62%)`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};
