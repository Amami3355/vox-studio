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
import {
  type CompileReport,
  NO_SAFE_AREA,
  type SceneInstance,
  type TimedBeat,
} from '../src/core/types';
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
  {
    id: 'b1',
    text: 'Rents have climbed for a decade.',
    fromMs: 0,
    toMs: 3000,
    words: at(0, 500, ['Rents', 'have', 'climbed', 'for', 'a', 'decade']),
  },
  {
    id: 'b2',
    text: 'London is the extreme case.',
    fromMs: 3000,
    toMs: 8000,
    words: at(3000, 1000, ['London', 'is', 'the', 'extreme', 'case']),
  },
];

/**
 * Word onsets written out rather than derived, at round intervals a reader can do in their
 * head. Real ones come from a recorded alignment and are nobody's round numbers; these
 * exist so the arithmetic of a word anchor is checkable by hand — "London" at 3000ms is
 * frame 90 at 30fps, and that is the whole assertion.
 */
function at(first: number, every: number, words: string[]): TimedBeat['words'] {
  return words.map((text, i) => ({ text, fromMs: first + i * every }));
}

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
          /**
           * `annotate` rather than `highlightBar`, because this fixture is about boundary
           * anchors and the timing failures around them — it needs an action carrying a
           * payload, not a pointing gesture. `highlightBar` declares `deicticFields` and is
           * therefore owed a word anchor, which every take-shape case below deliberately
           * withholds. `annotate` names the same bar and claims nothing about when.
           */
          events: [
            { at: 'b1.start', action: 'showBaseline' },
            {
              at: 'b2.start',
              action: 'annotate',
              payload: { label: 'London', text: 'the extreme case' },
            },
          ],
        },
      ],
    },
  ],
};

/**
 * The same plan, anchored on a word instead of a boundary — "London" is spoken once in b2.
 *
 * A separate fixture rather than an edit to `onePlan`, because the difference between the
 * two is the whole subject: a boundary anchor resolves against any take, and a word anchor
 * resolves only against one that was recorded.
 */
const wordAnchorPlan: VideoPlan = {
  ...onePlan,
  sections: [
    {
      ...(onePlan.sections[0] as VideoPlanSection),
      scenes: [
        {
          ...((onePlan.sections[0] as VideoPlanSection).scenes[0] as SceneInstance),
          events: [
            { at: 'b1.start', action: 'showBaseline' },
            { at: 'b2.word:London', action: 'highlightBar', payload: { label: 'London' } },
          ],
        },
      ],
    },
  ],
};

/** The same question asked of a persistent element, which resolves anchors on the same path. */
const wordAnchorPlacementPlan: VideoPlan = {
  ...onePlan,
  sections: [
    {
      ...(onePlan.sections[0] as VideoPlanSection),
      persistent: [
        {
          id: 'narrator',
          element: 'character',
          assetRequirement: narratorRequirement,
          placements: [{ at: 'b1.word:climbed', slot: 'cornerBR' }],
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
      { at: 'b1.end-long', slot: 'cornerBL' },
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
      { frame: 90, action: 'annotate', payload: { label: 'London', text: 'the extreme case' } },
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
      { ...(timedBeats[0] as TimedBeat), toMs: 1000, words: [] },
      { ...(timedBeats[1] as TimedBeat), fromMs: 1000, toMs: 6000, words: [] },
    ];

    const result = compile({ plan: continuityPlan, beats: hurried });

    expect(result.ok).toBe(false);
    expect(result.document).toBeNull();
    // 1000ms is 30 frames, where `bar_chart` declares a minimum of 90.
    expect(result.report.errors).toContainEqual(
      expect.objectContaining({ code: 'BELOW_MIN_DURATION', sceneId: 'chart' }),
    );
  });

  /**
   * ADR-0011. The second gate the plan alone could never answer, and for the same reason as
   * the first: two anchors have no order between them until a take says when their words
   * were spoken. `b1.start` before `b2.start` is arithmetic; `b2.word:London` before
   * `b2.word:extreme` is a fact about a recording.
   */
  describe('holds a scene to the order its events are written in', () => {
    const note = { label: 'London', text: 'the extreme case' };

    const withEvents = (events: SceneInstance['events']): VideoPlan => ({
      ...onePlan,
      sections: [
        {
          ...(onePlan.sections[0] as VideoPlanSection),
          scenes: [{ ...(onePlan.sections[0]?.scenes[0] as SceneInstance), events }],
        },
      ],
    });

    it('refuses a plan whose events compile out of the order they are written in', () => {
      const result = compile({
        plan: withEvents([
          { at: 'b2.start', action: 'showBaseline' },
          { at: 'b1.start', action: 'annotate', payload: note },
        ]),
        beats: timedBeats,
      });

      expect(result.ok).toBe(false);
      expect(result.document).toBeNull();
      expect(result.report.errors).toContainEqual(
        expect.objectContaining({
          code: 'EVENTS_OUT_OF_ORDER',
          sceneId: 'scene1',
          field: 'events[1].at',
        }),
      );
    });

    /**
     * The `at or after` half of the rule, and the reason it is not `strictly after`: two
     * events on one moment is ordinary authoring, and `resolveEvents` folds such a pair in
     * written order because `Array.prototype.sort` is stable. A strict rule would refuse
     * this plan, which was never wrong.
     */
    it('accepts two events that land on the same frame', () => {
      const result = compile({
        plan: withEvents([
          { at: 'b1.start', action: 'showBaseline' },
          { at: 'b1.start', action: 'annotate', payload: note },
        ]),
        beats: timedBeats,
      });

      if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);
      expect(result.report.errors).toEqual([]);
    });

    /**
     * Both frames in the message, not only the breach. Two word anchors are the case
     * ADR-0010 kept the word form for, and an author staring at two words needs to be told
     * which of them the take put first — the rejection is the only place that is known.
     */
    it('names both frames when two word anchors overtake', () => {
      const result = compile({
        plan: withEvents([
          { at: 'b2.word:extreme', action: 'showBaseline' },
          { at: 'b2.word:London', action: 'annotate', payload: note },
        ]),
        beats: timedBeats,
      });

      expect(result.ok).toBe(false);
      const error = result.report.errors.find((e) => e.code === 'EVENTS_OUT_OF_ORDER');
      // "extreme" is 6000ms and frame 180; "London" is 3000ms and frame 90.
      expect(error?.message).toContain('frame 180');
      expect(error?.message).toContain('frame 90');
      expect(error?.message).toContain('90 frames earlier');
    });
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
        [...timedBeats, { id: 'b3', text: 'And then?', fromMs: 8000, toMs: 9000, words: [] }],
      ],
    ])('%s', (_, beats) => {
      const result = compile({ plan: onePlan, beats });

      expect(result.ok).toBe(false);
      expect(result.document).toBeNull();
      expect(result.report.errors).toContainEqual(
        expect.objectContaining({ code: 'INVALID_TIMING_INPUT' }),
      );
    });

    /**
     * The words are a projection of the beat's own text, exactly as the beat is a
     * projection of the plan — and for the same reason ADR-0002's amendment gave.
     *
     * A take arriving as JSON has none of the guarantees its type makes, and a word list
     * is a far easier thing to get subtly wrong than a boundary: an extra word, a word
     * belonging to the neighbouring beat, an onset outside the window. Every one of those
     * produces an anchor that resolves to a plausible frame and cuts the picture against
     * the wrong word — which is the entire defect this vocabulary exists to repair, and it
     * would be undetectable in the render.
     *
     * An empty list is not a defect. A take that was never folded from a recorded
     * alignment genuinely has no word timings, and says so; the anchor is where that
     * becomes an error, because that is where someone asked for one.
     */
    it.each([
      ['a word the beat does not contain', spoken([{ words: at(0, 500, ['Rents', 'fell']) }])],
      [
        'words the beat contains in the wrong order',
        spoken([{ words: at(0, 500, ['have', 'Rents']) }]),
      ],
      [
        'a word list missing one the text has',
        spoken([{ words: at(0, 500, ['Rents', 'climbed']) }]),
      ],
      ['an onset before the beat is spoken', spoken([{ words: [{ text: 'Rents', fromMs: -1 }] }])],
      [
        // b1 ends at 3000ms; six words 900ms apart put the last of them at 4500.
        'an onset after the beat has ended',
        spoken([{ words: at(0, 900, ['Rents', 'have', 'climbed', 'for', 'a', 'decade']) }]),
      ],
      [
        'onsets that run backwards',
        spoken([
          {
            words: [
              { text: 'Rents', fromMs: 900 },
              { text: 'have', fromMs: 100 },
            ],
          },
        ]),
      ],
    ])('refuses %s', (_, beats) => {
      const result = compile({ plan: onePlan, beats });

      expect(result.ok).toBe(false);
      expect(result.document).toBeNull();
      expect(result.report.errors).toContainEqual(
        expect.objectContaining({ code: 'INVALID_TIMING_INPUT' }),
      );
    });

    it('accepts a take that simply has no word timings', () => {
      const result = compile({ plan: onePlan, beats: spoken([{ words: [] }, { words: [] }]) });

      expect(result.ok).toBe(true);
    });

    /**
     * The shape of `words` itself, which is the one field of a take nothing checked.
     *
     * This module's premise is that a take arriving as JSON "has none of the guarantees its
     * TypeScript type makes", and every case above is that premise applied to a boundary or
     * a text. Applied to `words` it had a hole: a take written before the field existed has
     * no `words` key at all, and reading `.length` off it replaced the whole CompileReport
     * with a TypeError. A legacy take is the ordinary way this arrives, and §8.1 needs the
     * report for exactly the plan it cannot compile.
     */
    it.each([
      ['a take from before the field existed', undefined],
      ['a null word list', null],
      ['a word list that is not a list', { 0: { text: 'Rents', fromMs: 0 } }],
      ['a word that is not an object', ['Rents']],
      ['a word with no text', [{ fromMs: 0 }]],
      ['a word with no onset', [{ text: 'Rents' }]],
      ['a word whose onset is not a number', [{ text: 'Rents', fromMs: '0' }]],
    ])('refuses %s', (_, words) => {
      const beats = timedBeats.map((beat, index) =>
        index === 0 ? { ...beat, words } : beat,
      ) as unknown as TimedBeat[];

      const result = compile({ plan: onePlan, beats });

      expect(result.ok).toBe(false);
      expect(result.document).toBeNull();
      expect(result.report.errors).toContainEqual(
        expect.objectContaining({ code: 'INVALID_TIMING_INPUT', field: 'beats.b1.words' }),
      );
    });

    /**
     * The door ADR-0002 left open on purpose, and the one thing on the other side of it.
     *
     * "Empty is legal at the take and loud at the anchor" is the recorded decision, and it
     * is the right one — a synthetic take that fabricated onsets from a duration would
     * produce numbers indistinguishable from measured ones. But *loud* was supposed to mean
     * a report. It meant an `UnresolvableWordError` thrown clean out of `compile`, past a
     * signature that promises a `CompileResult` and past §8.1's promise that a plan the
     * compiler refuses comes back with a reason an agent can act on.
     *
     * `checkWordAnchors` cannot answer this: it reads the plan, and whether the *take* was
     * recorded is not a fact about the plan. This is the take gate's half of one question.
     */
    it('refuses a word anchor when the take recorded no words', () => {
      const result = compile({
        plan: wordAnchorPlan,
        beats: spoken([{ words: [] }, { words: [] }]),
      });

      expect(result.ok).toBe(false);
      expect(result.document).toBeNull();
      expect(result.report.errors).toContainEqual(
        expect.objectContaining({ code: 'INVALID_TIMING_INPUT', field: 'beats.b2.words' }),
      );
    });

    /** A placement resolves anchors through the same door, so it goes through the same gate. */
    it('refuses a word anchor in a placement when the take recorded no words', () => {
      const result = compile({
        plan: wordAnchorPlacementPlan,
        beats: spoken([{ words: [] }, { words: [] }]),
      });

      expect(result.ok).toBe(false);
      expect(result.document).toBeNull();
      expect(result.report.errors).toContainEqual(
        expect.objectContaining({ code: 'INVALID_TIMING_INPUT', field: 'beats.b1.words' }),
      );
    });

    /** The control: the same plan against the take that *was* recorded still compiles. */
    it('accepts a word anchor when the take recorded the words', () => {
      const result = compile({ plan: wordAnchorPlan, beats: timedBeats });

      expect(result.ok).toBe(true);
    });

    /**
     * "Recorded" is a property of a take, not of a beat within one.
     *
     * A fold either ran over an alignment or it did not, and it produces words for every
     * beat or for none — CONTEXT.md defines an empty list as "this take was never recorded",
     * which is a sentence about the take. A take carrying words on b1 and none on b2 is
     * therefore not a legal state that happens to be unusual; it is a fold that half
     * completed, a hand-edited artifact, or two takes spliced together. Each of those makes
     * the words that *are* present untrustworthy, because whatever produced the gap was
     * operating on the beats that have onsets too.
     *
     * Left alone it is quiet in the worst way: b1's anchors resolve to plausible frames and
     * b2's are the only ones that complain.
     */
    it('refuses a take that recorded words for some beats and not others', () => {
      const result = compile({ plan: onePlan, beats: spoken([{}, { words: [] }]) });

      expect(result.ok).toBe(false);
      expect(result.document).toBeNull();
      expect(result.report.errors).toContainEqual(
        expect.objectContaining({ code: 'INVALID_TIMING_INPUT', field: 'beats.b2.words' }),
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
