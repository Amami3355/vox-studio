import type React from 'react';
import { useVideoConfig } from 'remotion';
import { resolveEventTimings, syntheticBeats } from '../core/anchors';
import type { MotionProfileId } from '../design/motion';
import { requireCapability } from '../scenes/registry';
import { SceneRenderer } from './SceneRenderer';

export type ExampleSceneProps = {
  capabilityId: string;
  exampleId: string;
  /** Overrides so layout and motion profile stay editable in the Remotion props panel. */
  layout?: string | null;
  motionProfile?: MotionProfileId | null;
};

/**
 * Plays one catalog example.
 *
 * The example carries semantic anchors; there is no beat compiler yet, so beats are
 * synthesised by splitting the composition evenly across `spansBeats`. When forced
 * alignment lands, only that call changes.
 */
export const ExampleScene: React.FC<ExampleSceneProps> = ({
  capabilityId,
  exampleId,
  layout,
  motionProfile,
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

  const beats = syntheticBeats(example.spansBeats ?? ['b1'], durationInFrames);
  const events = resolveEventTimings(example.events ?? [], beats, {
    from: 0,
    to: durationInFrames,
  });

  return (
    <SceneRenderer
      capabilityId={capabilityId}
      props={example.props}
      events={events}
      layout={layout ?? example.layout}
      motionProfile={motionProfile ?? example.motionProfile ?? 'subtleDrift'}
    />
  );
};

/** Remotion composition ids allow letters, digits and dashes only. */
export const compositionIdFor = (capabilityId: string, exampleId: string): string =>
  `${capabilityId}--${exampleId}`.replace(/[^a-zA-Z0-9-]/g, '-');
