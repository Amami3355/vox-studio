/**
 * The compiler at its seam: plans and real beat timings in, a compiled document out.
 *
 * Everything asserted here is a fact about *composition* — where a scene starts, where a
 * character is, what the report says — and none of it needs a browser. That is the point
 * of the document being JSON.
 */
import { describe, expect, it } from 'vitest';
import { createAssetResolver } from '../src/assets/resolver';
import type { VideoPlan, VideoPlanSection } from '../src/catalog/validate';
import { type CompiledDocument, compile } from '../src/compile';
import { type Rect, slotRect } from '../src/core/slots';
import { type CompileReport, NO_SAFE_AREA, type TimedBeat } from '../src/core/types';
import { requireCapability } from '../src/scenes/registry';

const format = (report: CompileReport) =>
  report.errors.map((error) => `${error.code} ${error.message}`).join(' · ');

const barChartProps = {
  title: 'Share of income spent on rent',
  unit: '%',
  data: [
    { label: 'Berlin', value: 27 },
    { label: 'London', value: 47 },
  ],
};

/**
 * Eight seconds of speech over two beats, so the arithmetic is checkable by hand — and
 * long enough that every scene below clears the `minDurationFrames` its capability
 * declares. A fixture under that minimum would be a plan the compiler must refuse.
 */
const timedBeats: TimedBeat[] = [
  { id: 'b1', text: 'Rents have climbed for a decade.', fromMs: 0, toMs: 3000 },
  { id: 'b2', text: 'London is the extreme case.', fromMs: 3000, toMs: 8000 },
];

const onePlan: VideoPlan = {
  beats: timedBeats.map(({ id, text }) => ({ id, text })),
  sections: [
    {
      id: 'sec1',
      spansBeats: ['b1', 'b2'],
      scenes: [
        {
          id: 'scene1',
          component: 'bar_chart',
          layout: 'standard',
          motionProfile: 'energetic',
          spansBeats: ['b1', 'b2'],
          props: barChartProps,
          events: [
            { at: 'b1.start', action: 'showBaseline' },
            { at: 'b2.start', action: 'highlightBar', payload: { label: 'London' } },
          ],
        },
      ],
    },
  ],
};

/**
 * The continuity case, and the reason ADR-0003 exists: one narrator held across a scene
 * that can yield and a scene that cannot.
 */
const continuityPlan: VideoPlan = {
  beats: timedBeats.map(({ id, text }) => ({ id, text })),
  sections: [
    {
      id: 'sec1',
      spansBeats: ['b1', 'b2'],
      persistent: [
        {
          id: 'narrator',
          element: 'character',
          asset: { status: 'ready', uri: 'asset://test/narrator' },
          placements: [{ at: 'b1.start', slot: 'cornerBR' }],
        },
      ],
      scenes: [
        {
          id: 'chart',
          component: 'bar_chart',
          layout: 'standard',
          motionProfile: 'energetic',
          spansBeats: ['b1'],
          props: barChartProps,
        },
        {
          id: 'context',
          component: 'image_context',
          layout: 'splitLeft',
          motionProfile: 'cinematic',
          spansBeats: ['b2'],
          props: {
            headline: 'The rent squeeze is reshaping city life',
            assetRequirement: {
              type: 'image',
              subject: 'Dense apartment buildings in a European city at dusk',
              treatment: 'photo',
              orientation: 'landscape',
              identityKey: 'housing-city-context',
            },
          },
        },
      ],
    },
  ],
};

/** The same two scenes, with the persistent layer swapped for the case under test. */
const withPersistent = (persistent: VideoPlanSection['persistent']): VideoPlan => ({
  ...continuityPlan,
  sections: [{ ...(continuityPlan.sections[0] as VideoPlanSection), persistent }],
});

/**
 * One element, two placements *inside* the chart scene. `left` clears `cornerBR` and
 * `right` clears `cornerBL`, so neither composition clears the element's whole crossing.
 */
const movingElementPlan = withPersistent([
  {
    id: 'narrator',
    element: 'character',
    asset: { status: 'ready', uri: 'asset://test/narrator' },
    placements: [
      { at: 'b1.start', slot: 'cornerBR' },
      { at: 'b1.mid', slot: 'cornerBL' },
      { at: 'b2.start', slot: 'cornerTR' },
    ],
  },
]);

/** Two elements over one scene, each cleared by a composition that traps the other. */
const twoElementPlan = withPersistent([
  {
    id: 'narrator',
    element: 'character',
    asset: { status: 'ready', uri: 'asset://test/narrator' },
    placements: [
      { at: 'b1.start', slot: 'cornerBR' },
      { at: 'b2.start', slot: 'cornerTR' },
    ],
  },
  {
    id: 'badge',
    element: 'label',
    placements: [{ at: 'b1.start', slot: 'cornerBL' }],
  },
]);

const rectsOverlap = (a: Rect, b: Rect): boolean =>
  Math.max(a.left, b.left) < 100 - Math.max(a.right, b.right) &&
  Math.max(a.top, b.top) < 100 - Math.max(a.bottom, b.bottom);

/**
 * The property the whole of ADR-0003 exists to hold: nothing a scene renders into is
 * still occupied by a persistent element while that scene plays.
 *
 * A scene's effective composition is its `safeArea` when it yielded, and the regions its
 * capability declares otherwise — `NO_SAFE_AREA` means "kept what it declared", not "fills
 * the frame", and reading it as the latter would make every unyielding scene a collision.
 */
const collisions = (document: CompiledDocument): string[] =>
  document.sections.flatMap((section) =>
    section.scenes.flatMap((scene) => {
      const yielded = JSON.stringify(scene.safeArea) !== JSON.stringify(NO_SAFE_AREA);
      const occupied = yielded
        ? [scene.safeArea]
        : requireCapability(scene.capabilityId).meta.occupiesRegions.map(slotRect);

      return section.layoutStates
        .filter((state) => state.from < scene.to && state.to > scene.from)
        .filter((state) => occupied.some((region) => rectsOverlap(region, state.rect)))
        .map((state) => `${state.elementId} overlaps "${scene.id}" at ${state.from}–${state.to}`);
    }),
  );

describe('compile', () => {
  it('turns spoken milliseconds into the frames a scene occupies', () => {
    const result = compile({ plan: onePlan, beats: timedBeats });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 8000ms at 30fps.
    expect(result.document.durationInFrames).toBe(240);
    expect(result.document.sections[0]?.scenes[0]).toMatchObject({
      id: 'scene1',
      capabilityId: 'bar_chart',
      from: 0,
      to: 240,
    });
  });

  it('lands each event on the frame its anchor names, relative to its scene', () => {
    const result = compile({ plan: onePlan, beats: timedBeats });
    if (!result.ok) throw new Error('expected the plan to compile');

    // b2 starts at 3000ms, which is frame 90, and the scene starts at frame 0.
    expect(result.document.sections[0]?.scenes[0]?.events).toEqual([
      { frame: 0, action: 'showBaseline' },
      { frame: 90, action: 'highlightBar', payload: { label: 'London' } },
    ]);
  });

  it('holds a persistent element over the scene that can yield, and drops it over the one that cannot', () => {
    const result = compile({ plan: continuityPlan, beats: timedBeats });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    // Visible for b1 (frames 0–90) and absent for b2: absence *is* hiddenness.
    expect(result.document.sections[0]?.layoutStates).toEqual([
      { elementId: 'narrator', from: 0, to: 90, rect: { top: 70, right: 0, bottom: 0, left: 70 } },
    ]);
  });

  it('makes the yielding scene render into the composition it declared', () => {
    const result = compile({ plan: continuityPlan, beats: timedBeats });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    const [chart, context] = result.document.sections[0]?.scenes ?? [];

    // `bar_chart` supports `left`, which clears the narrator's corner.
    expect(chart?.safeArea).toEqual({ top: 0, right: 50, bottom: 0, left: 0 });
    // `image_context` supports only `full`, so it never shrinks; the narrator went instead.
    expect(context?.safeArea).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('reports both repairs, so neither is silent', () => {
    const result = compile({ plan: continuityPlan, beats: timedBeats });

    expect(result.report.warnings).toContainEqual(
      expect.objectContaining({ code: 'SLOT_RELOCATED', sceneId: 'chart' }),
    );
    expect(result.report.warnings).toContainEqual(
      expect.objectContaining({ code: 'PERSISTENT_ELEMENT_HIDDEN', sceneId: 'context' }),
    );
  });

  it('resolves layout and motion profile, so the runtime never has to choose one', () => {
    const bare: VideoPlan = {
      ...onePlan,
      sections: [
        {
          ...(onePlan.sections[0] as VideoPlanSection),
          scenes: [
            {
              id: 'scene1',
              component: 'bar_chart',
              spansBeats: ['b1', 'b2'],
              props: barChartProps,
            },
          ],
        },
      ],
    };

    const result = compile({ plan: bare, beats: timedBeats });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    expect(result.document.sections[0]?.scenes[0]).toMatchObject({
      layout: 'standard',
      motionProfile: 'subtleDrift',
      props: barChartProps,
    });
  });

  it('resolves each scene’s assets onto the runtime channel, never into its props', () => {
    const result = compile({ plan: continuityPlan, beats: timedBeats });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    const context = result.document.sections[0]?.scenes[1];

    expect(context?.assets.assetRequirement).toMatchObject({ status: 'ready' });
    expect(context?.props).not.toHaveProperty('assetRequirement.status');
  });

  it('falls back to a placeholder when the library answers nothing', () => {
    const result = compile({
      plan: continuityPlan,
      beats: timedBeats,
      resolver: createAssetResolver(),
    });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    expect(result.document.sections[0]?.scenes[1]?.assets.assetRequirement).toMatchObject({
      status: 'placeholder',
    });
  });

  it('carries what a persistent element looks like, so the runtime never reads the plan', () => {
    const result = compile({ plan: continuityPlan, beats: timedBeats });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    expect(result.document.sections[0]?.persistent).toEqual([
      {
        id: 'narrator',
        element: 'character',
        asset: { status: 'ready', uri: 'asset://test/narrator' },
      },
    ]);
  });

  /**
   * The scene has one composition for its whole duration, so an element that moves inside
   * it has to be cleared as one crossing. Resolving the two placements separately picked
   * `left` for the first and `right` for the second, kept the first, and left the element
   * standing in the half the scene had just been composed into.
   */
  it('resolves an element that moves inside a scene as one crossing', () => {
    const result = compile({ plan: movingElementPlan, beats: timedBeats });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    const [chart] = result.document.sections[0]?.scenes ?? [];

    // No composition clears both corners, so the scene keeps the one it declared…
    expect(chart?.safeArea).toEqual(NO_SAFE_AREA);
    // …and the element spends the whole scene in the one slot that clears it.
    expect(result.document.sections[0]?.layoutStates).toEqual([
      { elementId: 'narrator', from: 0, to: 90, rect: { top: 0, right: 0, bottom: 70, left: 70 } },
    ]);
  });

  it('resolves every element crossing a scene against the same composition', () => {
    const result = compile({ plan: twoElementPlan, beats: timedBeats });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    const [chart] = result.document.sections[0]?.scenes ?? [];

    // `left` would clear the narrator and trap the badge; `right`, the reverse.
    expect(chart?.safeArea).toEqual(NO_SAFE_AREA);
    expect(result.document.sections[0]?.layoutStates).toEqual([
      { elementId: 'narrator', from: 0, to: 90, rect: { top: 0, right: 0, bottom: 70, left: 70 } },
    ]);
    expect(result.report.warnings).toContainEqual(
      expect.objectContaining({ code: 'PERSISTENT_ELEMENT_HIDDEN', sceneId: 'chart' }),
    );
  });

  it.each([
    ['one element held across two scenes', continuityPlan],
    ['an element that moves inside a scene', movingElementPlan],
    ['two elements over one scene', twoElementPlan],
  ])('never renders a scene into a rectangle an element still occupies (%s)', (_, plan) => {
    const result = compile({ plan, beats: timedBeats });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    expect(collisions(result.document)).toEqual([]);
  });

  it('refuses a plan whose beats were never spoken', () => {
    const result = compile({ plan: onePlan, beats: [timedBeats[0] as TimedBeat] });

    expect(result.ok).toBe(false);
    expect(result.document).toBeNull();
    expect(result.report.errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_BEAT_TIMING', field: 'beats.b2' }),
    );
  });
});
