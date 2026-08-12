import type React from 'react';
import { Composition } from 'remotion';
import './design/fonts';
import type { CompiledDocument } from './compile/document';
import { FPS, HEIGHT, WIDTH } from './design/theme';
import { CompiledVideo } from './runtime/CompiledVideo';
import { ExampleScene, compositionIdFor } from './runtime/ExampleScene';
import { registry } from './scenes/registry';

/**
 * A document with nothing in it, so the composition can be registered before anyone has
 * compiled a plan. The real one arrives as input props — which is possible at all only
 * because the compiled document is JSON.
 */
const EMPTY_DOCUMENT: CompiledDocument = {
  fps: FPS,
  durationInFrames: 1,
  beats: [],
  sections: [],
};

/**
 * One composition per example, generated from the registry.
 *
 * Not per layout × profile: that is 54 compositions for a single capability and an
 * unusable selector by the third one. Layout and profile are props, editable in the
 * Remotion props panel; the full matrix is the grid app's job.
 */
export const RemotionRoot: React.FC = () => (
  <>
    {/*
     * One composition for a whole compiled plan, sized from the document it is given.
     * This is where a section is actually watched — the examples above each play a single
     * scene, and §9.3's real problems only appear in sequence.
     */}
    <Composition
      id="compiled-document"
      component={CompiledVideo}
      durationInFrames={EMPTY_DOCUMENT.durationInFrames}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ document: EMPTY_DOCUMENT }}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, props.document.durationInFrames),
        fps: props.document.fps,
      })}
    />

    {registry.flatMap((capability) =>
      capability.examples.map((example) => (
        <Composition
          key={compositionIdFor(capability.meta.id, example.id)}
          id={compositionIdFor(capability.meta.id, example.id)}
          component={ExampleScene}
          durationInFrames={capability.meta.recommendedDurationFrames}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
          defaultProps={{
            capabilityId: capability.meta.id,
            exampleId: example.id,
            layout: null,
            motionProfile: null,
          }}
        />
      )),
    )}
  </>
);
