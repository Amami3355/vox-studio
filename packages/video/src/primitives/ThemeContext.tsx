/**
 * Tokens reach components as a plain JS object through context — never as CSS custom
 * properties. Remotion interpolates in JavaScript: a spring needs `damping` as a
 * number, a stagger needs `space[3]` as a number, a receding bar needs two colours
 * mixed numerically. A value hidden inside a CSS variable is opaque to all of that.
 */
import type React from 'react';
import { createContext, useContext, useMemo } from 'react';
import { type Theme, defaultTheme } from '../design/theme';

const ThemeCtx = createContext<Theme>(defaultTheme);

export const ThemeProvider: React.FC<{ theme?: Theme; children: React.ReactNode }> = ({
  theme,
  children,
}) => {
  const value = theme ?? defaultTheme;
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
};

export const useTheme = (): Theme => useContext(ThemeCtx);

/**
 * Scale factor applied to type and spacing when a scene is squeezed by a safe area.
 * Provided by SlotFrame; 1 when the scene owns the full canvas.
 */
const DensityCtx = createContext<number>(1);

export const DensityProvider: React.FC<{ value: number; children: React.ReactNode }> = ({
  value,
  children,
}) => {
  const memo = useMemo(() => value, [value]);
  return <DensityCtx.Provider value={memo}>{children}</DensityCtx.Provider>;
};

export const useDensity = (): number => useContext(DensityCtx);

/** Read a step of the type scale, already adjusted for the current density. */
export const useTypeSize = (step: number): number => {
  const theme = useTheme();
  const density = useDensity();
  const i = Math.min(theme.type.scale.length - 1, Math.max(0, Math.round(step)));
  return Math.round((theme.type.scale[i] as number) * density);
};

/** Read a step of the spacing scale, already adjusted for the current density. */
export const useSpace = (step: number): number => {
  const theme = useTheme();
  const density = useDensity();
  const i = Math.min(theme.space.length - 1, Math.max(0, Math.round(step)));
  return Math.round((theme.space[i] as number) * density);
};
