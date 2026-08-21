/**
 * Scene instances that exist to be *tested* and never to be imitated.
 *
 * `docs/adding-a-capability.md` §"Controls: the instances the agent never sees" holds the
 * rule that separates a control from a smuggled example, and the bar for adding one. Read
 * it there. What follows is only what the mechanism does.
 *
 * A control plays through the same pipeline an example does — `syntheticBeats`,
 * `resolveEventTimings`, `SceneRenderer`, the capability's own schema — so it exercises the
 * real code path, and it is registered as its own composition in `Root.tsx`. What it is not
 * is a member of `capability.examples`, so it never reaches the agent-facing catalog,
 * `pnpm catalog`, or the safe-area suite that sweeps the examples.
 *
 * `runtime/BackdropControl.tsx` is the same idea one level down, and the reason the word is
 * "control": it is a reference render the tests measure against rather than a frame the
 * catalog offers. This module is the general form — a control that is a whole scene.
 */
import type React from 'react';
import { useVideoConfig } from 'remotion';
import { resolveEventTimings, syntheticBeats } from '../core/anchors';
import type { SceneInstance } from '../core/types';
import type { MotionProfileId } from '../design/motion';
import { SceneRenderer } from './SceneRenderer';

export const sceneControls: SceneInstance[] = [
  /**
   * An empty label is the frame's standing element failing, not a stat being held back, so
   * the pending state must stand from frame 0 even when the plan drives the reveal. It once
   * did not: the label was suppressed for being empty and the empty state sat inside the
   * `revealed` gate, so a driven instance with no label drew a blank frame until `b2.start`.
   * None of the four examples crosses empty with driven, so nothing caught it. It is a
   * control rather than a fifth example because an empty label on a plan-driven scene is a
   * plan the agent should never write — publishing it to guard it would teach the defect.
   */
  {
    id: 'stat-empty-driven',
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
  /**
   * Both ceiling controls exist for `tests/render/occupies-regions.test.ts`, which checks
   * the one claim no other suite reads: that `occupiesRegions` is true of the pixels. The
   * claim is worst where the copy is longest, so every string sits at its schema ceiling —
   * in multi-word prose, because a one-token ceiling string exercises no wrapping and
   * wrapping is the whole question.
   *
   * Controls rather than examples: every prop here is past the recommended band
   * `constraints.ts` steers the agent under, so publishing the shape would teach copy the
   * catalog exists to discourage. The suite sweeps them across all six motion profiles
   * through the `motionProfile` override below.
   */
  {
    id: 'quote-ceiling',
    component: 'quote',
    layout: 'centered',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      // 40, 240, 60 and 60 characters — the schema's hard ceilings, exactly.
      eyebrow: 'The testimony, given under oath, in full',
      quote:
        "For younger households the hardest thing is not that rents are high, it is that they still climb year after year, far faster than anything else in a budget, and there's nobody left who can absorb the difference for them when the bill lands.",
      attribution: "Maria Alvarez, housing economist, and the tenants' organiser",
      role: 'Speaking before the housing select committee, in March 2026.',
    },
  },
  /**
   * The third ceiling control, and the one that was missing when it was needed.
   *
   * `occupies-regions.test.ts` swept two capabilities and said in its header why not this
   * one: *"that declaration predates any measurement and measuring it is its own work."* On
   * 2026-08-21 the unmeasured half came due — a render placed a character in `cornerTR`, the
   * one slot `['bottom', 'left']` freed, and the tallest bar's value label was drawn under
   * it with its ascenders cut. The compiler reported nothing, because rung a is exactly
   * right when a declaration is true.
   *
   * `standard` rather than the other two layouts, because it is the arrangement that
   * produced the clipped frame and the one that puts a value label highest. The declaration
   * the measurement produced frees no slot at all, so the layouts not swept here have no
   * corner left to overclaim — see the header of that suite.
   */
  {
    id: 'bar-chart-ceiling',
    component: 'bar_chart',
    layout: 'standard',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    events: [{ at: 'b1.start', action: 'revealAll' }],
    props: {
      // A 120-character title, twenty entries — the array's hard ceiling — an 8-character
      // unit, and prose rather than one long token, because a ceiling string that cannot
      // wrap exercises none of the wrapping.
      //
      // **The 40-character label, the tallest bar and the highlight are deliberately the
      // same row.** Only eight of these twenty reach the canvas, and `valueKind: 'share'`
      // drops the rest rather than bucketing them, so a ceiling label on a collapsed row is
      // a ceiling nothing draws. Worse, `Bar.tsx:292` prints a value only on the highlighted
      // bar while `gridlines` is on: a `highlight` naming a dropped row silences every value
      // label and recedes every bar, which is the *dimmest* chart this component can draw —
      // the opposite of what a worst-case ink control is for. Putting all three on London
      // puts the longest label and the highest value label in the same frame.
      title:
        "Share of a household's monthly income now spent on rent across every capital that the survey reached this reporting year",
      unit: 'per cent',
      valueKind: 'share',
      emphasis: 'negative',
      highlight: 'London, all thirty-two boroughs and City',
      data: [
        { label: 'Amsterdam and the metropolitan ring', value: 38 },
        { label: 'Athens with its coastal suburbs', value: 31 },
        { label: 'Belgrade and the Danube left bank', value: 24 },
        { label: 'Berlin and the outer eastern districts', value: 27 },
        { label: 'Bratislava beyond the old town wall', value: 26 },
        { label: 'Brussels and the nineteen communes', value: 35 },
        { label: 'Bucharest and the northern sector', value: 23 },
        { label: 'Budapest across both river banks', value: 25 },
        { label: 'Copenhagen and the bridge districts', value: 36 },
        { label: 'Dublin and the southern commuter belt', value: 42 },
        { label: 'Helsinki and the eastern island suburbs', value: 34 },
        { label: 'Lisbon and the far side of the water', value: 37 },
        { label: 'Ljubljana and the valley towns below', value: 22 },
        { label: 'London, all thirty-two boroughs and City', value: 47 },
        { label: 'Madrid and the eastern dormitory towns', value: 33 },
        { label: 'Oslo and the fjord settlements west', value: 39 },
        { label: 'Paris and the whole inner ring road', value: 41 },
        { label: 'Prague and the panel estates on the hill', value: 28 },
        { label: 'Reykjavik and the built-up area around', value: 44 },
        { label: 'Vienna and the districts over the canal', value: 29 },
      ],
    },
  },
  {
    id: 'stat-ceiling',
    component: 'stat_counter',
    layout: 'centered',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      // A signed seven-digit value, a 12-character unit, an 80-character label and a
      // 120-character sublabel — the schema's hard ceilings, exactly.
      value: -9999999,
      unit: 'per cent net',
      label: "Share of a household's monthly income now spent on rent and on heating, all told",
      sublabel:
        'Up from a third a decade ago, and still climbing in every region the survey reached this year, in cities and towns alike',
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
export const ControlScene: React.FC<{
  controlId: string;
  /**
   * Test-only override, mirroring `ExampleScene`'s: a sweep that needs one control under
   * every profile renders it six ways instead of registering six copies.
   */
  motionProfile?: MotionProfileId | null;
}> = ({ controlId, motionProfile }) => {
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
      motionProfile={motionProfile ?? control.motionProfile}
    />
  );
};
