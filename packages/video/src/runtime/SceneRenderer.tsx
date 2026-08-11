import type React from 'react';
import { useVideoConfig } from 'remotion';
import type { SafeArea, TimedEvent } from '../core/types';
import { NO_SAFE_AREA } from '../core/types';
import { type MotionProfileId, getMotionProfile } from '../design/motion';
import { type Theme, defaultTheme } from '../design/theme';
import { ThemeProvider } from '../primitives/ThemeContext';
import { requireCapability } from '../scenes/registry';

/**
 * Renders one scene instance whose events are already resolved to frames.
 *
 * Props are parsed through the capability schema rather than trusted, so defaults are
 * applied and a bad plan fails loudly here instead of rendering something subtly wrong.
 */
export const SceneRenderer: React.FC<{
  capabilityId: string;
  props: Record<string, unknown>;
  events?: TimedEvent[];
  layout?: string;
  motionProfile?: MotionProfileId;
  safeArea?: SafeArea;
  theme?: Theme;
}> = ({
  capabilityId,
  props,
  events = [],
  layout,
  motionProfile = 'subtleDrift',
  safeArea = NO_SAFE_AREA,
  theme = defaultTheme,
}) => {
  const { durationInFrames } = useVideoConfig();
  const capability = requireCapability(capabilityId);

  const layoutId = layout ?? (Object.keys(capability.layouts)[0] as string);
  if (!capability.layouts[layoutId]) {
    throw new Error(
      `Unknown layout "${layoutId}" for capability "${capabilityId}". ` +
        `Available: ${Object.keys(capability.layouts).join(', ')}.`,
    );
  }

  const parsed = capability.schema.parse(props);
  const Component = capability.component;

  return (
    <ThemeProvider theme={theme}>
      <Component
        props={parsed as never}
        layout={layoutId}
        events={events}
        safeArea={safeArea}
        theme={theme}
        profile={getMotionProfile(motionProfile)}
        durationInFrames={durationInFrames}
      />
    </ThemeProvider>
  );
};
