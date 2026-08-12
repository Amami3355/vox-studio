import type React from 'react';
import { useVideoConfig } from 'remotion';
import { NO_RESOLVED_SCENE_ASSETS, type ResolvedSceneAssets } from '../core/assets';
import { ASSET_REQUIREMENT_FIELD } from '../core/assets';
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
 *
 * This is also where a capability that `requiresAssets` finds out whether the resolver
 * actually ran. The check belongs to the generic runtime, not to each component: it is
 * the runtime that owns the wiring, and putting the guard in one place keeps every scene
 * component a pure function of the inputs it is handed.
 */
export const SceneRenderer: React.FC<{
  capabilityId: string;
  props: Record<string, unknown>;
  /** Resolver output for *this* scene. The plan-level map is the compiler's shape. */
  assets?: ResolvedSceneAssets;
  events?: TimedEvent[];
  layout?: string;
  motionProfile?: MotionProfileId;
  safeArea?: SafeArea;
  theme?: Theme;
}> = ({
  capabilityId,
  props,
  assets = NO_RESOLVED_SCENE_ASSETS,
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

  if (capability.meta.requiresAssets && assets[ASSET_REQUIREMENT_FIELD] === undefined) {
    throw new Error(
      `MISSING_ASSET_REFERENCE: "${capabilityId}" requires a resolved asset for "${ASSET_REQUIREMENT_FIELD}", and none was supplied. Run the Asset Resolver over the scene before rendering it.`,
    );
  }

  const parsed = capability.schema.parse(props);
  const Component = capability.component;

  return (
    <ThemeProvider theme={theme}>
      <Component
        props={parsed as never}
        assets={assets}
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
