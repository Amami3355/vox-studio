import type React from 'react';
import { useVideoConfig } from 'remotion';
import { resolveEventTimings, syntheticBeats } from '../core/anchors';
import type { SceneInstance } from '../core/types';
import { requireCapability } from '../scenes/registry';
import { SceneRenderer } from './SceneRenderer';

/**
 * A scene instance that exists to be *tested* and never to be imitated.
 *
 * The examples in a capability's `examples.ts` are normative: the agent copies them far
 * more faithfully than it reads a description, so every shape published there is a shape
 * the agent is being taught to author. That makes the example set the wrong place to keep
 * a regression guard. Some bugs live in shapes an agent should never write — and pinning
 * one down by publishing it teaches the defect in order to test it.
 *
 * A control is the way out. It plays through the same pipeline an example does —
 * `syntheticBeats`, `resolveEventTimings`, `SceneRenderer`, the capability's own schema —
 * so it exercises the real code path, and it is registered as its own composition in
 * `Root.tsx`. What it is not is a member of `capability.examples`, so it never reaches the
 * agent-facing catalog, `pnpm catalog`, or the safe-area suite that sweeps the examples.
 *
 * `runtime/BackdropControl.tsx` is the same idea one level down, and the reason the word
 * is "control": it is a reference render the tests measure against rather than a frame the
 * catalog offers. This module is the general form — a control that is a whole scene.
 *
 * The bar for adding one is high, and deliberately so. A shape worth rendering is usually
 * a shape worth teaching, and that one belongs in `examples.ts`. A control is for the
 * remainder: a frame that must not regress and must not be copied.
 */
export type SceneControl = SceneInstance & {
  /** Why this shape is tested here rather than published as an example. */
  why: string;
};

export const sceneControls: SceneControl[] = [
  {
    id: 'stat-empty-driven',
    why:
      "An empty label is the frame's standing element failing, not a stat being held back, so " +
      'the pending state must stand from frame 0 even when the plan drives the reveal. It once ' +
      'did not: the label was suppressed for being empty and the empty state sat inside the ' +
      '`revealed` gate, so a driven instance with no label drew a blank frame until `b2.start`. ' +
      'None of the four examples crosses empty with driven, so nothing caught it. It is a ' +
      'control rather than a fifth example because an empty label on a plan-driven scene is a ' +
      'plan the agent should never write — publishing it to guard it would teach the defect.',
    component: 'stat_counter',
    layout: 'centered',
    motionProfile: 'editorialStatic',
    /**
     * `example-stat-empty`'s props with `example-stat-driven`'s beats and events, so the
     * control differs from each on exactly one axis and the assertion isolates one thing.
     */
    spansBeats: ['b1', 'b2'],
    events: [{ at: 'b2.start', action: 'revealStat' }],
    props: {
      value: 0,
      unit: '',
      label: '',
      sublabel: '',
      emphasis: 'neutral',
    },
  },
];

/**
 * Plays one control.
 *
 * Deliberately a near-copy of `ExampleScene`'s body rather than a shared helper. The two
 * resolve the same way today, but they answer to different owners: `ExampleScene` follows
 * the catalog and grew `assets`, `safeArea` and `themeId` overrides doing so, while a
 * control is only ever driven by a test. Folding them together would make every future
 * catalog affordance a thing the controls also carry.
 */
export const ControlScene: React.FC<{ controlId: string }> = ({ controlId }) => {
  const { durationInFrames } = useVideoConfig();
  const control = sceneControls.find((c) => c.id === controlId);

  if (!control) {
    throw new Error(
      `Unknown control "${controlId}". ` +
        `Available: ${sceneControls.map((c) => c.id).join(', ')}.`,
    );
  }

  const beats = syntheticBeats(control.spansBeats, durationInFrames);
  const events = resolveEventTimings(control.events ?? [], beats, {
    from: 0,
    to: durationInFrames,
  });

  /**
   * No asset resolution. A control names its own props, and a capability that
   * `requiresAssets` would fail loudly in `SceneRenderer` rather than render something
   * half-built — which is the right answer until a control actually needs an asset.
   */
  return (
    <SceneRenderer
      capabilityId={control.component}
      props={control.props}
      events={events}
      layout={control.layout}
      motionProfile={control.motionProfile ?? 'subtleDrift'}
    />
  );
};

/** Namespaced like `BACKDROP_CONTROL_ID`, so controls sort together in the studio. */
export const controlIdFor = (controlId: string): string =>
  `control--${controlId}`.replace(/[^a-zA-Z0-9-]/g, '-');

/** The length a control runs, taken from its capability exactly as an example's is. */
export const controlDurationFrames = (control: SceneControl): number =>
  requireCapability(control.component).meta.recommendedDurationFrames;
