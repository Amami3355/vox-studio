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

/**
 * What the fixtures' narrator needs, semantically — never where it is. ADR-0005 removed
 * the `AssetRef` channel a plan used to have, so an element asks for a picture exactly as
 * a scene does and the repository library answers with the figure it holds.
 */
const narratorRequirement = {
  type: 'character',
  subject: 'Narrator figure, flat editorial silhouette',
  treatment: 'illustration',
  orientation: 'square',
  identityKey: 'narrator',
} as const;

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
          assetRequirement: narratorRequirement,
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
    assetRequirement: narratorRequirement,
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
    assetRequirement: narratorRequirement,
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

  /**
   * One state for the whole section, and that is the point: every scene the narrator
   * crosses now has a composition that clears the corner, so it neither moves nor is
   * dropped. `image_context` declaring only `full` is what used to end this run at b2.
   */
  it('holds a persistent element across a section whose scenes can all yield', () => {
    const result = compile({ plan: continuityPlan, beats: timedBeats });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    expect(result.document.sections[0]?.layoutStates).toEqual([
      { elementId: 'narrator', from: 0, to: 240, rect: { top: 70, right: 0, bottom: 0, left: 70 } },
    ]);
  });

  it('makes each yielding scene render into the composition it declared', () => {
    const result = compile({ plan: continuityPlan, beats: timedBeats });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    const [chart, context] = result.document.sections[0]?.scenes ?? [];

    // Both capabilities declare `left`, and `left` is the first entry that clears
    // `cornerBR` for either of them.
    expect(chart?.safeArea).toEqual({ top: 0, right: 50, bottom: 0, left: 0 });
    expect(context?.safeArea).toEqual({ top: 0, right: 50, bottom: 0, left: 0 });
  });

  /**
   * `SLOT_RELOCATED` covers two different repairs, and the report is a deliverable rather
   * than a log, so the message has to say which one happened. Asserted over two plans
   * because one plan can only demonstrate one of them per scene.
   */
  it('names which repair it made, since one code covers two of them', () => {
    const relocations = (plan: VideoPlan): string[] => {
      const result = compile({ plan, beats: timedBeats });
      return result.report.warnings
        .filter((warning) => warning.code === 'SLOT_RELOCATED')
        .map((warning) => warning.message);
    };

    expect(relocations(continuityPlan)).toEqual([
      '"narrator" contends with "chart", so the scene yields into "left".',
      '"narrator" contends with "context", so the scene yields into "left".',
    ]);
    expect(relocations(movingElementPlan)).toEqual([
      '"narrator" contends with "chart", so the element moves to "cornerTR", which it also uses in this section.',
      '"narrator" contends with "context", so the scene yields into "left".',
    ]);
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

  /**
   * A compile that quietly fell back to placeholders used to look exactly like one that
   * resolved everything, which is the difference between a preview and a deliverable.
   */
  it('says when a scene is rendering a placeholder rather than the picture it asked for', () => {
    const result = compile({
      plan: continuityPlan,
      beats: timedBeats,
      resolver: createAssetResolver(),
    });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    expect(result.report.warnings).toContainEqual(
      expect.objectContaining({
        code: 'ASSET_PLACEHOLDER',
        sceneId: 'context',
        field: 'props.assetRequirement',
        severity: 'quality',
      }),
    );
  });

  it('raises a failed asset above a pending one, because one of them is not going to arrive', () => {
    const result = compile({
      plan: continuityPlan,
      beats: timedBeats,
      resolver: {
        resolve: () => ({
          status: 'failed',
          uri: 'asset://placeholder/image',
          requirementId: 'req_deadbeef',
          reason: 'The local file could not be decoded.',
        }),
      },
    });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    expect(result.report.warnings).toContainEqual(
      expect.objectContaining({
        code: 'ASSET_PLACEHOLDER',
        sceneId: 'context',
        severity: 'important',
      }),
    );
    // The reason the resolver gave has to survive into the report, or it is lost.
    expect(
      result.report.warnings.find((warning) => warning.code === 'ASSET_PLACEHOLDER')?.message,
    ).toContain('could not be decoded');
  });

  it('says nothing about a scene whose asset resolved', () => {
    const result = compile({ plan: continuityPlan, beats: timedBeats });

    expect(result.report.warnings.filter((w) => w.code === 'ASSET_PLACEHOLDER')).toEqual([]);
  });

  /**
   * The document carries a *reference* where the plan carried a *requirement*, which is
   * ADR-0005's boundary in one assertion: the plan says what the narrator must show, the
   * resolver says where it is, and the runtime reads only the second. The plan could name
   * a location until this landed, and nothing checked what it named.
   */
  it('resolves what a persistent element looks like, so the runtime never reads the plan', () => {
    const result = compile({ plan: continuityPlan, beats: timedBeats });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    const element = result.document.sections[0]?.persistent[0];

    expect(element?.id).toBe('narrator');
    expect(element?.asset?.status).toBe('ready');
    expect(element?.asset?.uri).toMatch(/^data:image\/svg\+xml,/);
    expect(JSON.stringify(continuityPlan)).not.toContain('data:image');
  });

  /**
   * Decision 3 of ADR-0005, which the shared identity cache is what buys: an element and a
   * scene declaring the same `identityKey` are declaring they show the same thing. Two
   * resolvers, or a resolver per section, would let them disagree.
   */
  it('gives an element and a scene sharing an identity the same picture', () => {
    const shared = withPersistent([
      {
        id: 'narrator',
        element: 'character',
        assetRequirement: {
          ...narratorRequirement,
          type: 'image',
          subject: 'Dense apartment buildings in a European city at dusk',
          treatment: 'photo',
          orientation: 'landscape',
          identityKey: 'housing-city-context',
        },
        placements: [{ at: 'b1.start', slot: 'cornerBR' }],
      },
    ]);
    const result = compile({ plan: shared, beats: timedBeats });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    const section = result.document.sections[0];
    const scene = section?.scenes.find((one) => one.id === 'context');

    expect(section?.persistent[0]?.asset?.uri).toBe(scene?.assets.assetRequirement?.uri);
  });

  /**
   * The worklist of ADR-0005 decision 4 has to include elements, or a character with no
   * picture is the one thing the compiler never mentions.
   */
  it('puts an unresolved element on the placeholder worklist, naming the element', () => {
    const unknown = withPersistent([
      {
        id: 'narrator',
        element: 'character',
        assetRequirement: { ...narratorRequirement, identityKey: 'nobody-has-drawn-this' },
        placements: [{ at: 'b1.start', slot: 'cornerBR' }],
      },
    ]);
    const result = compile({ plan: unknown, beats: timedBeats });

    expect(
      result.report.warnings.find((warning) => warning.code === 'ASSET_PLACEHOLDER'),
    ).toMatchObject({
      code: 'ASSET_PLACEHOLDER',
      severity: 'quality',
      sectionId: 'sec1',
      field: 'persistent[narrator].assetRequirement',
    });
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
    // …and the element spends the whole scene in the one slot that clears it, which the
    // next scene then yields around rather than moving it a second time.
    expect(result.document.sections[0]?.layoutStates).toEqual([
      { elementId: 'narrator', from: 0, to: 240, rect: { top: 0, right: 0, bottom: 70, left: 70 } },
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

  /**
   * A scene's duration does not exist until milliseconds are frames, so this is the first
   * gate the plan alone could never answer — and the reason it stayed open long enough for
   * the fixtures to sit under it.
   */
  it('refuses a scene too short for the animation its capability is built around', () => {
    const hurried: TimedBeat[] = [
      { id: 'b1', text: 'Rents have climbed for a decade.', fromMs: 0, toMs: 1000 },
      { id: 'b2', text: 'London is the extreme case.', fromMs: 1000, toMs: 6000 },
    ];

    const result = compile({ plan: continuityPlan, beats: hurried });

    expect(result.ok).toBe(false);
    expect(result.document).toBeNull();
    // 1000ms is 30 frames, where `bar_chart` declares a minimum of 90.
    expect(result.report.errors).toContainEqual(
      expect.objectContaining({ code: 'BELOW_MIN_DURATION', sceneId: 'chart' }),
    );
  });

  it('warns about a scene that plays, but plays hurried', () => {
    const result = compile({ plan: continuityPlan, beats: timedBeats });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    // 90 frames clears `bar_chart`'s minimum of 90 and misses its recommended 210.
    expect(result.report.warnings).toContainEqual(
      expect.objectContaining({ code: 'SCENE_BELOW_RECOMMENDED_DURATION', sceneId: 'chart' }),
    );
  });

  it('refuses a plan whose beats were never spoken', () => {
    const result = compile({ plan: onePlan, beats: [timedBeats[0] as TimedBeat] });

    expect(result.ok).toBe(false);
    expect(result.document).toBeNull();
    expect(result.report.errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_BEAT_TIMING', field: 'beats.b2' }),
    );
  });

  /**
   * The timings are the one input the compiler cannot derive and cannot check against
   * anything but the plan. Every case here produced a document before: a `NaN` window, a
   * scene playing backwards, a black gap between two scenes, or pictures cut against
   * words the voice no longer says.
   */
  describe('refuses timings that are not a projection of the plan', () => {
    const spoken = (overrides: Partial<TimedBeat>[]): TimedBeat[] =>
      timedBeats.map((beat, index) => ({ ...beat, ...overrides[index] }));

    it.each([
      ['a window that runs backwards', spoken([{ fromMs: 3000, toMs: 0 }])],
      ['a window of no length at all', spoken([{ toMs: 0 }])],
      ['a boundary that is not a number', spoken([{ toMs: Number.NaN }])],
      ['a beat that starts before zero', spoken([{ fromMs: -100 }])],
      ['a gap the video would play as black', spoken([{}, { fromMs: 3500 }])],
      ['an overlap', spoken([{}, { fromMs: 2500 }])],
      ['text the voice no longer says', spoken([{ text: 'Rents have fallen for a decade.' }])],
      ['beats in an order the plan does not have', [...timedBeats].reverse()],
      [
        'a timing for a beat the plan does not define',
        [...timedBeats, { id: 'b3', text: 'And then?', fromMs: 8000, toMs: 9000 }],
      ],
    ])('%s', (_, beats) => {
      const result = compile({ plan: onePlan, beats });

      expect(result.ok).toBe(false);
      expect(result.document).toBeNull();
      expect(result.report.errors).toContainEqual(
        expect.objectContaining({ code: 'INVALID_TIMING_INPUT' }),
      );
    });

    it('refuses an fps that cannot produce a frame', () => {
      const result = compile({ plan: onePlan, beats: timedBeats, fps: 0 });

      expect(result.ok).toBe(false);
      expect(result.report.errors).toContainEqual(
        expect.objectContaining({ code: 'INVALID_TIMING_INPUT', field: 'fps' }),
      );
    });
  });
});
