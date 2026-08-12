import type React from 'react';
import { Composition } from 'remotion';
import './design/fonts';
import type { CompiledDocument } from './compile/document';
import { FPS, HEIGHT, WIDTH } from './design/theme';
import { compileShippedPlan, shippedPlans } from './plans';
import { BACKDROP_CONTROL_ID, BackdropControl } from './runtime/BackdropControl';
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
     * One composition per shipped plan, compiled at load.
     *
     * This is where a section is actually watched. `compiled-document` below can play any
     * plan, but only if somebody hands it one as input props — which meant that in
     * practice nobody watched a section at all, and §9.3's real problems (brutal
     * transitions, a character that jumps, rhythmic uniformity) are the ones that appear
     * only in sequence. A registered composition is the difference between a capability
     * the tooling *has* and a thing a human does.
     *
     * Compiled here rather than committed as a document: the plan is the artifact and the
     * document is derived, so editing the JSON changes the video on the next reload with
     * nothing to regenerate. A plan that stops compiling throws on open, and
     * `tests/plans.test.ts` is what makes that a red test first.
     */}
    {shippedPlans.map((shipped) => {
      const document = compileShippedPlan(shipped);
      return (
        <Composition
          key={`section--${shipped.id}`}
          id={`section--${shipped.id}`}
          component={CompiledVideo}
          durationInFrames={document.durationInFrames}
          fps={document.fps}
          width={WIDTH}
          height={HEIGHT}
          defaultProps={{ document }}
        />
      );
    })}

    {/*
     * The generic one, kept: it is the composition `renderMedia` targets for a plan that
     * was compiled somewhere else, and it has to exist before anything has been compiled
     * at all.
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

    {/*
     * The reference frame the render contract tests measure against. One frame, because
     * `Backdrop` does not move; see `runtime/BackdropControl.tsx` for why an absolute
     * control says something two example renders compared to each other cannot.
     */}
    <Composition
      id={BACKDROP_CONTROL_ID}
      component={BackdropControl}
      durationInFrames={1}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
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
