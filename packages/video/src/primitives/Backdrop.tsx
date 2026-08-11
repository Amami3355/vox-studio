import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { mix } from '../design/theme';
import { useTheme } from './ThemeContext';

/**
 * The ground every scene sits on. A flat fill reads as a slide; a very low-contrast
 * radial lift reads as a lit set. Deterministic, no noise texture.
 */
export const Backdrop: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const theme = useTheme();
  const lift = mix(theme.color.bg, theme.color.surface, 0.9);

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
