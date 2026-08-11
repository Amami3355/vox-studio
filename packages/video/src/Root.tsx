import type React from 'react';
import { Composition } from 'remotion';
import './design/fonts';
import { FPS, HEIGHT, WIDTH } from './design/theme';
import { ExampleScene, compositionIdFor } from './runtime/ExampleScene';
import { registry } from './scenes/registry';

/**
 * One composition per example, generated from the registry.
 *
 * Not per layout × profile: that is 54 compositions for a single capability and an
 * unusable selector by the third one. Layout and profile are props, editable in the
 * Remotion props panel; the full matrix is the grid app's job.
 */
export const RemotionRoot: React.FC = () => (
  <>
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
