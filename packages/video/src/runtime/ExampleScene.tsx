import type React from 'react';
import { useMemo } from 'react';
import { useVideoConfig } from 'remotion';
import { repositoryAssetLibrary } from '../assets/library';
import { createAssetResolver, resolveSceneAssets } from '../assets/resolver';
import { resolveEventTimings, syntheticBeats } from '../core/anchors';
import type { ResolvedSceneAssets } from '../core/assets';
import type { SafeArea } from '../core/types';
import type { MotionProfileId } from '../design/motion';
import { type ThemeId, themes } from '../design/theme';
import { requireCapability } from '../scenes/registry';
import { SceneRenderer } from './SceneRenderer';

export type ExampleSceneProps = {
  capabilityId: string;
  exampleId: string;
  /** Overrides so layout and motion profile stay editable in the Remotion props panel. */
  layout?: string | null;
  motionProfile?: MotionProfileId | null;
  /** Runtime/test override. Never published in the agent-facing catalog examples. */
  assets?: ResolvedSceneAssets;
  /**
   * The composition the compiler would have chosen, as the rectangle the component sees.
   *
   * An example plays outside any section, so nothing ever contends with it and the honest
   * default is the whole canvas. This override exists so a declared composition can be
   * looked at — in the studio, or by the contract test — without inventing a plan and a
   * persistent element to provoke it. Like `assets`, it is runtime-only: an example that
   * carried a safe area would be publishing percentages to an agent that speaks slots.
   */
  safeArea?: SafeArea;
  /**
   * Which palette to draw the example in. Runtime-only, like `assets` and `safeArea`: a
   * published example that named a theme would be teaching the agent a vocabulary it does
   * not author — the theme belongs to the production, not to the scene.
   *
   * Named by id rather than passed as a `Theme` so the Remotion props panel and the studio
   * can offer it as a list of the palettes that exist.
   */
  themeId?: ThemeId | null;
};

/**
 * Plays one catalog example.
 *
 * The example carries semantic anchors; there is no beat compiler yet, so beats are
 * synthesised by splitting the composition evenly across `spansBeats`. When the TTS
 * timepoints of ADR-0002 land, only that call changes.
 */
export const ExampleScene: React.FC<ExampleSceneProps> = ({
  capabilityId,
  exampleId,
  layout,
  motionProfile,
  assets,
  safeArea,
  themeId,
}) => {
  const { durationInFrames } = useVideoConfig();
  const capability = requireCapability(capabilityId);
  const example = capability.examples.find((e) => e.id === exampleId);

  if (!example) {
    throw new Error(
      `Unknown example "${exampleId}" for "${capabilityId}". ` +
        `Available: ${capability.examples.map((e) => e.id).join(', ')}.`,
    );
  }

  const beats = syntheticBeats(example.spansBeats, durationInFrames);
  const events = resolveEventTimings(example.events ?? [], beats, {
    from: 0,
    to: durationInFrames,
  });

  /**
   * One resolution scope per example, memoised so Remotion's per-frame re-render does
   * not rebuild the resolver 180 times. The scope is deliberately local rather than a
   * module-level singleton: a shared identity cache surviving between compositions would
   * be exactly the process-global rendering state the resolver is specified to avoid.
   */
  const resolved = useMemo(
    () => resolveSceneAssets(example, createAssetResolver({ library: repositoryAssetLibrary })),
    [example],
  );

  return (
    <SceneRenderer
      capabilityId={capabilityId}
      props={example.props}
      assets={assets ?? resolved}
      events={events}
      layout={layout ?? example.layout}
      motionProfile={motionProfile ?? example.motionProfile ?? 'subtleDrift'}
      {...(safeArea ? { safeArea } : {})}
      {...(themeId && themes[themeId] ? { theme: themes[themeId] } : {})}
    />
  );
};
