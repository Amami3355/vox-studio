import { describe, expect, it } from 'vitest';
import {
  type VideoPlan,
  getSceneSpec,
  searchScenes,
  validateScene,
  validateVideoPlan,
} from '../src/catalog/tools';
import type { PersistentElement, Placement, SceneInstance } from '../src/core/types';
import { barChartSchema } from '../src/scenes/BarChartScene';
import { registry } from '../src/scenes/registry';

/** The three-beat plan most partition tests vary one section of. */
const withScenes = (scenes: SceneInstance[]): VideoPlan => ({
  beats: [
    { id: 'b1', text: 'Rents rose faster than wages.' },
    { id: 'b2', text: 'London is the extreme case.' },
    { id: 'b3', text: 'And the gap is still widening.' },
  ],
  sections: [{ id: 'sec1', spansBeats: ['b1', 'b2', 'b3'], scenes }],
});

const base = (overrides: Partial<SceneInstance> = {}): SceneInstance => ({
  id: 'scene_1',
  component: 'bar_chart',
  layout: 'standard',
  motionProfile: 'energetic',
  spansBeats: ['b1', 'b2'],
  props: {
    title: 'Share of income spent on rent',
    unit: '%',
    data: [
      { label: 'Paris', value: 33 },
      { label: 'London', value: 47 },
    ],
  },
  events: [{ at: 'b1.start', action: 'revealAll' }],
  ...overrides,
});

describe('validateScene — hard constraints fail loudly', () => {
  it('accepts a well-formed instance', () => {
    const report = validateScene(base());
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('rejects an unknown capability and lists the valid ids', () => {
    const report = validateScene(base({ component: 'pie_chart' }));
    expect(report.ok).toBe(false);
    expect(report.errors[0]?.code).toBe('UNKNOWN_CAPABILITY');
    expect(report.errors[0]?.expected).toContain('bar_chart');
  });

  it('rejects an unknown layout', () => {
    const report = validateScene(base({ layout: 'radial' }));
    expect(report.errors.some((e) => e.code === 'UNKNOWN_LAYOUT')).toBe(true);
  });

  it('rejects an action outside the vocabulary — the silent-death case', () => {
    const report = validateScene(
      base({ events: [{ at: 'b1.start', action: 'emphasizeBar', payload: { label: 'Paris' } }] }),
    );
    const error = report.errors.find((e) => e.code === 'UNKNOWN_ACTION');
    expect(error).toBeDefined();
    expect(error?.expected).toContain('highlightBar');
  });

  it('rejects a malformed payload', () => {
    const report = validateScene(
      base({ events: [{ at: 'b1.start', action: 'highlightBar', payload: {} }] }),
    );
    expect(report.errors.some((e) => e.code === 'INVALID_PAYLOAD')).toBe(true);
  });

  it('rejects an anchor pointing outside the beats the scene covers', () => {
    const report = validateScene(base({ events: [{ at: 'b9.start', action: 'revealAll' }] }));
    expect(report.errors.some((e) => e.code === 'UNKNOWN_ANCHOR')).toBe(true);
  });

  it('rejects a frame written where an anchor belongs', () => {
    const report = validateScene(base({ events: [{ at: '312', action: 'revealAll' }] }));
    expect(report.errors.some((e) => e.code === 'UNKNOWN_ANCHOR')).toBe(true);
  });

  it('rejects data beyond the hard maximum', () => {
    const data = Array.from({ length: 21 }, (_, i) => ({ label: `L${i}`, value: i }));
    const report = validateScene(base({ props: { title: 'Too many', data } }));
    expect(report.errors.some((e) => e.code === 'INVALID_PROPS')).toBe(true);
  });

  it('rejects a highlight that matches no label', () => {
    const report = validateScene(
      base({ props: { title: 'Rent', data: [{ label: 'Paris', value: 3 }], highlight: 'Lisbon' } }),
    );
    const error = report.errors.find((e) => e.field === 'highlight');
    expect(error?.expected).toEqual(['Paris']);
  });

  it('rejects an event pointing at a label that is not in data', () => {
    const report = validateScene(
      base({ events: [{ at: 'b1.start', action: 'highlightBar', payload: { label: 'Oslo' } }] }),
    );
    expect(report.errors.some((e) => e.code === 'INVALID_PAYLOAD')).toBe(true);
  });
});

describe('validateScene — soft constraints degrade with a warning', () => {
  it('warns but accepts beyond the recommended count', () => {
    const data = Array.from({ length: 14 }, (_, i) => ({ label: `L${i}`, value: 14 - i }));
    const report = validateScene(base({ props: { title: 'Ranking', data } }));
    expect(report.ok).toBe(true);
    expect(report.warnings.some((w) => w.code === 'SOFT_LIMIT_EXCEEDED')).toBe(true);
  });

  it('warns on a long title without rejecting it', () => {
    const report = validateScene(
      base({ props: { title: 'x'.repeat(90), data: [{ label: 'Paris', value: 3 }] } }),
    );
    expect(report.ok).toBe(true);
    expect(report.warnings.some((w) => w.code === 'TITLE_DENSITY')).toBe(true);
  });

  /**
   * A percentage series that has not said what its values are is one composition away from
   * drawing a sum of shares — the 2026-08-21 render's `OTHERS 60`. The warning fires on
   * silence rather than on the aggregation, because by the time the aggregation happens
   * the plan is already written and the render is already wrong.
   */
  it('warns when a percentage series has not said whether its values are shares', () => {
    const props = { title: 'Rent', unit: '%', data: [{ label: 'Paris', value: 33 }] };
    const report = validateScene(base({ props }));
    expect(report.ok).toBe(true);
    expect(report.warnings.some((w) => w.code === 'VALUE_KIND_UNSTATED')).toBe(true);
  });

  it('says nothing when the series has stated what its values are', () => {
    for (const valueKind of ['share', 'amount'] as const) {
      const props = { title: 'Rent', unit: '%', valueKind, data: [{ label: 'Paris', value: 33 }] };
      const report = validateScene(base({ props }));
      expect(report.warnings.some((w) => w.code === 'VALUE_KIND_UNSTATED')).toBe(false);
    }
  });

  it('says nothing about a series that is not a percentage', () => {
    const props = { title: 'Homes', unit: 'k', data: [{ label: 'Paris', value: 33 }] };
    const report = validateScene(base({ props }));
    expect(report.warnings.some((w) => w.code === 'VALUE_KIND_UNSTATED')).toBe(false);
  });

  it('treats an empty series as a legitimate degraded state, not an error', () => {
    const report = validateScene(base({ props: { title: 'No figures', data: [] }, events: [] }));
    expect(report.ok).toBe(true);
    expect(report.warnings.some((w) => w.severity === 'info')).toBe(true);
  });
});

describe('validateVideoPlan', () => {
  const plan: VideoPlan = {
    beats: [
      { id: 'b1', text: 'Rents rose faster than wages.' },
      { id: 'b2', text: 'London is the extreme case.' },
      { id: 'b3', text: 'And the gap is still widening.' },
    ],
    sections: [
      {
        id: 'sec1',
        spansBeats: ['b1', 'b2', 'b3'],
        scenes: [
          base({ id: 's1', spansBeats: ['b1'], events: [{ at: 'b1.start', action: 'revealAll' }] }),
          base({
            id: 's2',
            spansBeats: ['b2', 'b3'],
            events: [{ at: 'b2.start', action: 'revealAll' }],
          }),
        ],
      },
    ],
  };

  it('accepts a coherent plan', () => {
    expect(validateVideoPlan(plan).ok).toBe(true);
  });

  it('warns when consecutive scenes reuse the same motion profile', () => {
    const report = validateVideoPlan(plan);
    expect(report.warnings.some((w) => w.code === 'MOTION_PROFILE_REPETITION')).toBe(true);
  });

  it('rejects a scene spanning a beat the plan does not define', () => {
    const report = validateVideoPlan(
      withScenes([base({ id: 's1', spansBeats: ['b7'], events: [] })]),
    );
    expect(report.errors.some((e) => e.code === 'UNKNOWN_ANCHOR')).toBe(true);
  });
});

/**
 * A word anchor is checkable from the plan alone, and this is the reason that matters.
 *
 * Whether "London" is a word of b2 is a fact about the beat text the agent just wrote — no
 * audio, no credential, no recording. So the `validate` tool of `catalog/tools.ts` answers
 * it in the cold pass, before a single second of quota is spent, and the agent repairs it
 * unaided under §8.1. The compiler holds the same line against a *take* rather than a
 * plan; `checkTimings` proves the two agree by proving a take's words are the tokenisation
 * of its text, which is what makes one check the consequence of the other rather than a
 * second source of truth.
 */
describe('validateVideoPlan — word anchors, checked without a take', () => {
  const withEvent = (at: string): VideoPlan => ({
    beats: [
      { id: 'b1', text: 'Rents rose faster than wages.' },
      { id: 'b2', text: 'In London, rent takes half of a median income, and rent keeps rising.' },
    ],
    sections: [
      {
        id: 'sec1',
        spansBeats: ['b1', 'b2'],
        scenes: [
          base({ id: 's1', spansBeats: ['b1'], events: [] }),
          base({ id: 's2', spansBeats: ['b2'], events: [{ at, action: 'revealAll' }] }),
        ],
      },
    ],
  });

  it('accepts a word the beat actually speaks', () => {
    expect(validateVideoPlan(withEvent('b2.word:London')).ok).toBe(true);
  });

  it('rejects a word the beat does not speak, listing the ones it does', () => {
    const report = validateVideoPlan(withEvent('b2.word:Berlin'));
    const unknown = report.errors.find((e) => e.code === 'UNKNOWN_ANCHOR');

    expect(unknown).toBeDefined();
    /** `expected` rather than the prose, as every other correctable error in this file. */
    expect(unknown?.expected).toContain('median');
    expect(unknown?.expected).not.toContain('London,');
  });

  /** "rent" is in b2 twice. Picking one silently is the defect, not the repair. */
  it('rejects a word the beat speaks twice', () => {
    const report = validateVideoPlan(withEvent('b2.word:rent'));

    expect(report.errors.some((e) => e.code === 'AMBIGUOUS_ANCHOR')).toBe(true);
  });

  /** The same word in another beat is not ambiguous, and not in scope either. */
  it('rejects a word that is in the plan but not in the beat named', () => {
    const report = validateVideoPlan(withEvent('b2.word:wages'));

    expect(report.errors.some((e) => e.code === 'UNKNOWN_ANCHOR')).toBe(true);
  });

  it('rejects a word on the scene pseudo-beat, which has no text', () => {
    const report = validateVideoPlan(withEvent('scene.word:London'));

    expect(report.errors.some((e) => e.code === 'UNKNOWN_ANCHOR')).toBe(true);
  });

  /** Placements are held to the same rule as events, as they are for every other check. */
  it('holds a persistent element placement to the same rule', () => {
    const plan = withEvent('b2.start');
    const section = plan.sections[0] as (typeof plan.sections)[number];
    section.persistent = [
      {
        id: 'narrator',
        element: 'character',
        assetRequirement: {
          type: 'character',
          subject: 'Narrator figure',
          treatment: 'illustration',
          orientation: 'square',
          identityKey: 'narrator',
        },
        placements: [{ at: 'b2.word:Berlin', slot: 'cornerBR' }],
      },
    ];

    expect(validateVideoPlan(plan).errors.some((e) => e.code === 'UNKNOWN_ANCHOR')).toBe(true);
  });
});

/**
 * A declared deictic field, held to the anchor it declares.
 *
 * `deicticFields` said which payload fields name something spoken, and then nothing read it
 * outside one test over one shipped plan. So a `highlightBar` whose payload says "London"
 * could be anchored `b2.start`, or onto a word in another beat entirely, and validate and
 * compile — reproducing by hand the exact defect the word vocabulary was built to remove.
 * A declaration nothing enforces is documentation, and rule 2 says the manifest is what the
 * agent learns from: publishing a rule the compiler does not apply teaches it wrongly.
 *
 * The seam is the *plan*, not the instance, and that is forced rather than chosen. An
 * instance with no take cannot use a word anchor at all — `syntheticBeats` has no words by
 * ADR-0002 — and every catalog example is exactly that. Holding `validateScene` to landing
 * would make a pointing action impossible to *illustrate*, so the catalog could not teach
 * the gesture it was enforcing. A plan is the thing that gets a take, so a plan is the
 * thing held to the rule.
 */
describe('validateVideoPlan — an action lands on the word it points at', () => {
  const pointing = (at: string, label = 'London'): VideoPlan => ({
    beats: [
      { id: 'b1', text: 'Rents rose faster than wages.' },
      { id: 'b2', text: 'London is the extreme case, and New York is close behind.' },
    ],
    sections: [
      {
        id: 'sec1',
        spansBeats: ['b1', 'b2'],
        scenes: [
          base({ id: 's1', spansBeats: ['b1'], events: [] }),
          base({
            id: 's2',
            spansBeats: ['b2'],
            props: {
              title: 'Share of income spent on rent',
              unit: '%',
              data: [
                { label: 'London', value: 47 },
                { label: 'New York', value: 44 },
              ],
            },
            events: [{ at, action: 'highlightBar', payload: { label } }],
          }),
        ],
      },
    ],
  });

  it('accepts the gesture anchored to the word it names', () => {
    expect(validateVideoPlan(pointing('b2.word:London')).ok).toBe(true);
  });

  it('rejects the gesture anchored to a boundary, which lands on no word at all', () => {
    const report = validateVideoPlan(pointing('b2.start'));
    const error = report.errors.find((e) => e.code === 'DEICTIC_ANCHOR_REQUIRED');

    expect(error).toBeDefined();
    expect(error?.field).toBe('events[0].at');
    expect(error?.expected).toContain('b2.word:London');
  });

  it('rejects the gesture anchored to a word that is not the one it points at', () => {
    const report = validateVideoPlan(pointing('b2.word:extreme'));

    expect(report.errors.some((e) => e.code === 'DEICTIC_ANCHOR_REQUIRED')).toBe(true);
  });

  /**
   * The sub-question nobody had answered: a deictic value that is more than one word.
   *
   * "New York" cannot be a word anchor — the form names one token by construction, and that
   * is deliberate, since a phrase has no single onset. Landing on *any* token of the phrase
   * is the rule, because the narrator is saying the phrase across all of them and which one
   * the picture cuts on is an editorial choice the plan is entitled to make.
   */
  it('accepts a multi-word value anchored to any token of the phrase', () => {
    expect(validateVideoPlan(pointing('b2.word:New', 'New York')).ok).toBe(true);
    expect(validateVideoPlan(pointing('b2.word:York', 'New York')).ok).toBe(true);
  });

  it('rejects a multi-word value anchored outside the phrase', () => {
    const report = validateVideoPlan(pointing('b2.word:extreme', 'New York'));

    expect(report.errors.some((e) => e.code === 'DEICTIC_ANCHOR_REQUIRED')).toBe(true);
  });

  /**
   * The falsification that makes the rest of this suite mean anything.
   *
   * `annotate` names a bar in its payload exactly as `highlightBar` does, and declares no
   * deictic field — its note's timing follows the sentence that justifies it, which may be a
   * beat away. If this fires, the check is reading "the payload mentions a word" rather than
   * the declaration, which is the distinction `deicticFields` exists to draw.
   */
  it('leaves an action that declares no deictic field to its own timing', () => {
    const plan = pointing('b2.start');
    const scene = plan.sections[0]?.scenes[1] as SceneInstance;
    scene.events = [
      {
        at: 'b1.start',
        action: 'annotate',
        payload: { label: 'London', text: 'the extreme case' },
      },
    ];

    expect(validateVideoPlan(plan).errors.some((e) => e.code === 'DEICTIC_ANCHOR_REQUIRED')).toBe(
      false,
    );
  });

  /**
   * The same rule, asked of the second capability to declare a deictic field.
   *
   * `image_context` reaches the gate by a different route: its `emphasize` payload carries
   * free copy the agent invents, where `highlightBar` carries a label that must already be
   * in `data`. So the referential check that would otherwise catch a nonsense value does
   * not exist here, and the landing rule is the only thing standing between a stamped word
   * and a frame where it is not being spoken. Written against a plan whose beat text really
   * contains the word, so a pass means the anchor landed and not that the word was absent.
   */
  const stamping = (at: string, text = 'squeeze'): VideoPlan => ({
    beats: [
      { id: 'b1', text: 'Rents rose faster than wages.' },
      { id: 'b2', text: 'The squeeze is reshaping how cities live.' },
    ],
    sections: [
      {
        id: 'sec1',
        spansBeats: ['b1', 'b2'],
        scenes: [
          base({ id: 's1', spansBeats: ['b1'], events: [] }),
          {
            id: 's2',
            component: 'image_context',
            layout: 'splitLeft',
            motionProfile: 'cinematic',
            spansBeats: ['b2'],
            props: {
              headline: 'The rent squeeze is reshaping city life',
              caption: '',
              assetRequirement: {
                type: 'image',
                subject: 'Dense apartment buildings at dusk',
                treatment: 'photo',
                orientation: 'landscape',
              },
            },
            events: [{ at, action: 'emphasize', payload: { text } }],
          },
        ],
      },
    ],
  });

  it('accepts an emphasis anchored to the word it stamps', () => {
    expect(validateVideoPlan(stamping('b2.word:squeeze')).ok).toBe(true);
  });

  it('rejects an emphasis anchored to a boundary, which stamps a word nobody is saying', () => {
    const report = validateVideoPlan(stamping('b2.start'));
    const error = report.errors.find((e) => e.code === 'DEICTIC_ANCHOR_REQUIRED');

    expect(error).toBeDefined();
    expect(error?.expected).toContain('b2.word:squeeze');
  });

  it('rejects an emphasis anchored to a different word in the same beat', () => {
    const report = validateVideoPlan(stamping('b2.word:cities'));

    expect(report.errors.some((e) => e.code === 'DEICTIC_ANCHOR_REQUIRED')).toBe(true);
  });

  /**
   * The stamp with nothing to be stamped onto.
   *
   * Written against the *anchor landing* suite on purpose: both these plans satisfy the
   * deictic rule completely, which is what makes the failure interesting. An emphasis can
   * land exactly on the word the narrator says and still render nothing, because the plate
   * it is drawn on has not arrived. Only `imageContextChecks` sees that.
   */
  const withReveal = (revealAt: string, emphasisFirst: boolean): VideoPlan => {
    const plan = stamping('b2.word:squeeze');
    const scene = plan.sections[0]?.scenes[1] as SceneInstance;
    const reveal = { at: revealAt, action: 'revealImage' };
    const emphasis = { at: 'b2.word:squeeze', action: 'emphasize', payload: { text: 'squeeze' } };
    scene.events = emphasisFirst ? [emphasis, reveal] : [reveal, emphasis];
    return plan;
  };

  it('rejects an emphasis written before the reveal that puts its plate on the frame', () => {
    const report = validateVideoPlan(withReveal('b2.end', true));
    const error = report.errors.find((e) => e.code === 'EVENT_BEFORE_ELEMENT_REVEALED');

    expect(error).toBeDefined();
    expect(error?.expected).toContain('b2.end');
  });

  it('accepts an emphasis written after its reveal', () => {
    expect(validateVideoPlan(withReveal('b2.start', false)).ok).toBe(true);
  });

  /**
   * The falsification for this pair. With no `revealImage` at all the plate opens with the
   * scene, so there is no held frame and nothing to report — if this fires, the check is
   * reading "the scene has an emphasis" rather than "the emphasis precedes its plate".
   */
  it('leaves an emphasis alone when the scene never holds its image back', () => {
    const report = validateVideoPlan(stamping('b2.word:squeeze'));

    expect(report.errors.some((e) => e.code === 'EVENT_BEFORE_ELEMENT_REVEALED')).toBe(false);
  });
});

describe('validateVideoPlan — the beat partition over scenes', () => {
  it('rejects a scene whose beats are not contiguous', () => {
    const report = validateVideoPlan(
      withScenes([
        base({ id: 's1', spansBeats: ['b1', 'b3'], events: [] }),
        base({ id: 's2', spansBeats: ['b2'], events: [] }),
      ]),
    );
    expect(report.errors.some((e) => e.code === 'BEAT_NOT_CONTIGUOUS')).toBe(true);
  });

  it('rejects two scenes claiming the same beat', () => {
    const report = validateVideoPlan(
      withScenes([
        base({ id: 's1', spansBeats: ['b1', 'b2'], events: [] }),
        base({ id: 's2', spansBeats: ['b2', 'b3'], events: [] }),
      ]),
    );
    const error = report.errors.find((e) => e.code === 'BEAT_DOUBLE_BOOKED');
    expect(error?.message).toContain('b2');
  });

  it('rejects a beat of the section that no scene covers', () => {
    const report = validateVideoPlan(
      withScenes([base({ id: 's1', spansBeats: ['b1', 'b2'], events: [] })]),
    );
    const error = report.errors.find((e) => e.code === 'BEAT_UNCOVERED');
    expect(error?.message).toContain('b3');
  });

  it('rejects an empty span rather than treating it as a scene of no duration', () => {
    const report = validateVideoPlan(withScenes([base({ id: 's1', spansBeats: [], events: [] })]));
    expect(report.errors.some((e) => e.code === 'EMPTY_BEAT_SPAN')).toBe(true);
  });

  it('rejects scenes that partition the beats perfectly but arrive out of order', () => {
    const report = validateVideoPlan(
      withScenes([
        base({ id: 's_last', spansBeats: ['b3'], events: [] }),
        base({ id: 's_first', spansBeats: ['b1', 'b2'], events: [] }),
      ]),
    );
    expect(report.errors.some((e) => e.code === 'BEAT_NOT_CONTIGUOUS')).toBe(true);
  });

  it('blames one scene, not two, when a single scene names the same beat twice', () => {
    const report = validateVideoPlan(
      withScenes([
        base({ id: 's1', spansBeats: ['b1', 'b1'], events: [] }),
        base({ id: 's2', spansBeats: ['b2', 'b3'], events: [] }),
      ]),
    );
    expect(report.errors.some((e) => e.code === 'BEAT_DOUBLE_BOOKED')).toBe(false);
    expect(report.errors.some((e) => e.code === 'BEAT_NOT_CONTIGUOUS')).toBe(true);
  });

  it('does not launder a beat the section claims but the plan never defines', () => {
    const report = validateVideoPlan({
      beats: [{ id: 'b1', text: 'Rents rose faster than wages.' }],
      sections: [
        {
          id: 'sec1',
          spansBeats: ['b1', 'bX'],
          scenes: [base({ id: 's1', spansBeats: ['b1', 'bX'], events: [] })],
        },
      ],
    });
    const scoped = report.errors.filter((e) => e.code === 'UNKNOWN_ANCHOR');
    expect(scoped.some((e) => e.sceneId === 's1')).toBe(true);
  });

  it('names the section on every error it raises over scenes', () => {
    const report = validateVideoPlan(
      withScenes([base({ id: 's1', spansBeats: ['b1', 'b3'], events: [] })]),
    );
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors.every((e) => e.sectionId === 'sec1')).toBe(true);
  });
});

describe('validateVideoPlan — the beat partition over sections', () => {
  const twoBeats = [
    { id: 'b1', text: 'Rents rose faster than wages.' },
    { id: 'b2', text: 'London is the extreme case.' },
  ];
  const sceneOver = (id: string, beats: string[]) => base({ id, spansBeats: beats, events: [] });

  it('rejects a beat that no section covers, even when every section is internally sound', () => {
    const report = validateVideoPlan({
      beats: twoBeats,
      sections: [{ id: 'sec1', spansBeats: ['b1'], scenes: [sceneOver('s1', ['b1'])] }],
    });
    const error = report.errors.find((e) => e.code === 'BEAT_UNCOVERED');
    expect(error?.message).toContain('b2');
  });

  it('omits sectionId when the failure is the partition of sections itself', () => {
    const report = validateVideoPlan({
      beats: twoBeats,
      sections: [{ id: 'sec1', spansBeats: ['b1'], scenes: [sceneOver('s1', ['b1'])] }],
    });
    const error = report.errors.find((e) => e.code === 'BEAT_UNCOVERED');
    expect(error?.sectionId).toBeUndefined();
  });

  it('omits sectionId on every section-level code, not only the uncovered one', () => {
    const report = validateVideoPlan({
      beats: [...twoBeats, { id: 'b3', text: 'And the gap is still widening.' }],
      sections: [
        { id: 'sec1', spansBeats: ['b1', 'b3'], scenes: [sceneOver('s1', ['b1', 'b3'])] },
        { id: 'sec2', spansBeats: ['b2'], scenes: [sceneOver('s2', ['b2'])] },
      ],
    });
    const error = report.errors.find((e) => e.code === 'BEAT_NOT_CONTIGUOUS' && !e.sceneId);
    expect(error).toBeDefined();
    expect(error?.sectionId).toBeUndefined();
    expect(error?.message).toContain('sec1');
  });

  it('rejects sections that partition the beats perfectly but arrive out of order', () => {
    const report = validateVideoPlan({
      beats: twoBeats,
      sections: [
        { id: 'secB', spansBeats: ['b2'], scenes: [sceneOver('s2', ['b2'])] },
        { id: 'secA', spansBeats: ['b1'], scenes: [sceneOver('s1', ['b1'])] },
      ],
    });
    expect(report.errors.some((e) => e.code === 'BEAT_NOT_CONTIGUOUS')).toBe(true);
  });

  it('rejects two sections sharing a beat', () => {
    const report = validateVideoPlan({
      beats: twoBeats,
      sections: [
        { id: 'sec1', spansBeats: ['b1', 'b2'], scenes: [sceneOver('s1', ['b1', 'b2'])] },
        { id: 'sec2', spansBeats: ['b2'], scenes: [sceneOver('s2', ['b2'])] },
      ],
    });
    expect(report.errors.some((e) => e.code === 'BEAT_DOUBLE_BOOKED')).toBe(true);
  });

  it('rejects a scene spanning a beat its own section does not cover', () => {
    const report = validateVideoPlan({
      beats: twoBeats,
      sections: [
        { id: 'sec1', spansBeats: ['b1'], scenes: [sceneOver('s1', ['b1', 'b2'])] },
        { id: 'sec2', spansBeats: ['b2'], scenes: [sceneOver('s2', ['b2'])] },
      ],
    });
    expect(report.errors.some((e) => e.code === 'UNKNOWN_ANCHOR')).toBe(true);
  });
});

describe('validateVideoPlan — a scene may not cut a sentence in half', () => {
  it('rejects a scene whose last beat leaves the sentence open', () => {
    const report = validateVideoPlan({
      beats: [
        { id: 'b1', text: 'The reason is' },
        { id: 'b2', text: 'a design flaw.' },
      ],
      sections: [
        {
          id: 'sec1',
          spansBeats: ['b1', 'b2'],
          scenes: [
            base({ id: 's1', spansBeats: ['b1'], events: [] }),
            base({ id: 's2', spansBeats: ['b2'], events: [] }),
          ],
        },
      ],
    });
    const error = report.errors.find((e) => e.code === 'SCENE_CUTS_MID_SENTENCE');
    expect(error?.sceneId).toBe('s1');
  });

  it('accepts two beats splitting a sentence inside one scene, where there is no cut', () => {
    const report = validateVideoPlan({
      beats: [
        { id: 'b1', text: 'The reason is' },
        { id: 'b2', text: 'a design flaw.' },
      ],
      sections: [
        {
          id: 'sec1',
          spansBeats: ['b1', 'b2'],
          scenes: [base({ id: 's1', spansBeats: ['b1', 'b2'], events: [] })],
        },
      ],
    });
    expect(report.errors.some((e) => e.code === 'SCENE_CUTS_MID_SENTENCE')).toBe(false);
  });

  it('accepts a sentence closed inside a quotation mark', () => {
    const report = validateVideoPlan({
      beats: [{ id: 'b1', text: '“Nobody saw it coming.”' }],
      sections: [
        {
          id: 'sec1',
          spansBeats: ['b1'],
          scenes: [base({ id: 's1', spansBeats: ['b1'], events: [] })],
        },
      ],
    });
    expect(report.errors.some((e) => e.code === 'SCENE_CUTS_MID_SENTENCE')).toBe(false);
  });
});

describe('validateVideoPlan — placements of persistent elements', () => {
  const planWith = (placements: { at: string; slot: string }[]): VideoPlan => ({
    beats: [{ id: 'b1', text: 'Rents rose faster than wages.' }],
    sections: [
      {
        id: 'sec1',
        spansBeats: ['b1'],
        persistent: [{ id: 'char1', element: 'character', placements: placements as Placement[] }],
        scenes: [base({ id: 's1', spansBeats: ['b1'], events: [] })],
      },
    ],
  });

  it('accepts a placement on an anchor of a beat the section covers', () => {
    expect(validateVideoPlan(planWith([{ at: 'b1.start', slot: 'cornerBR' }])).ok).toBe(true);
  });

  it('rejects a placement into a slot that does not exist', () => {
    const report = validateVideoPlan(planWith([{ at: 'b1.start', slot: 'cornerXY' }]));
    const error = report.errors.find((e) => e.code === 'UNKNOWN_SLOT');
    expect(error?.expected).toContain('cornerBR');
  });

  it('rejects a placement anchored outside the section', () => {
    const report = validateVideoPlan(planWith([{ at: 'b9.start', slot: 'left' }]));
    expect(report.errors.some((e) => e.code === 'UNKNOWN_ANCHOR')).toBe(true);
  });

  it('rejects a frame written where a placement anchor belongs', () => {
    const report = validateVideoPlan(planWith([{ at: '240', slot: 'left' }]));
    expect(report.errors.some((e) => e.code === 'UNKNOWN_ANCHOR')).toBe(true);
  });

  it('reports rather than crashes when an element omits its placements entirely', () => {
    const plan = planWith([]);
    // Only TypeScript stops an agent's JSON from arriving in this shape.
    const [section] = plan.sections;
    if (section) section.persistent = [{ id: 'char1', element: 'character' } as PersistentElement];
    const report = validateVideoPlan(plan);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.code === 'MALFORMED_PLAN')).toBe(true);
  });
});

/**
 * The structural gate. Every case here is JSON an agent can emit and TypeScript cannot
 * stop, so each one is written as the malformed value it really is and cast at the edge.
 */
describe('validateVideoPlan — the structural gate', () => {
  const malformed = (plan: unknown) => validateVideoPlan(plan as VideoPlan);
  const sound = (id: string, beats: string[]) => base({ id, spansBeats: beats, events: [] });

  it('reports rather than crashes when a beat text is null', () => {
    const report = malformed({
      beats: [{ id: 'b1', text: null }],
      sections: [{ id: 'sec1', spansBeats: ['b1'], scenes: [sound('s1', ['b1'])] }],
    });
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.code === 'MALFORMED_PLAN')).toBe(true);
  });

  it('refuses a beat with no text rather than skipping the sentence rule in silence', () => {
    const report = malformed({
      beats: [{ id: 'b1' }],
      sections: [{ id: 'sec1', spansBeats: ['b1'], scenes: [sound('s1', ['b1'])] }],
    });
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.code === 'MALFORMED_PLAN')).toBe(true);
  });

  it('refuses an empty beat text, which would carry no voice-over', () => {
    const report = malformed({
      beats: [{ id: 'b1', text: '' }],
      sections: [{ id: 'sec1', spansBeats: ['b1'], scenes: [sound('s1', ['b1'])] }],
    });
    expect(report.errors.some((e) => e.code === 'MALFORMED_PLAN')).toBe(true);
  });

  it('refuses duplicate beat ids, which would collapse two beats into one unit of time', () => {
    const report = malformed({
      beats: [
        { id: 'b1', text: 'First half' },
        { id: 'b1', text: 'second half.' },
      ],
      sections: [{ id: 'sec1', spansBeats: ['b1'], scenes: [sound('s1', ['b1'])] }],
    });
    const error = report.errors.find((e) => e.code === 'DUPLICATE_ID');
    expect(error?.message).toContain('b1');
  });

  it('refuses two scenes sharing an id, which would hide a double-booked beat', () => {
    const report = malformed({
      beats: [
        { id: 'b1', text: 'One.' },
        { id: 'b2', text: 'Two.' },
      ],
      sections: [
        {
          id: 'sec1',
          spansBeats: ['b1', 'b2'],
          scenes: [sound('dup', ['b1']), sound('dup', ['b1', 'b2'])],
        },
      ],
    });
    expect(report.errors.some((e) => e.code === 'DUPLICATE_ID')).toBe(true);
  });

  it('refuses two sections sharing an id', () => {
    const report = malformed({
      beats: [
        { id: 'b1', text: 'One.' },
        { id: 'b2', text: 'Two.' },
      ],
      sections: [
        { id: 'dup', spansBeats: ['b1'], scenes: [sound('s1', ['b1'])] },
        { id: 'dup', spansBeats: ['b2'], scenes: [sound('s2', ['b2'])] },
      ],
    });
    expect(report.errors.some((e) => e.code === 'DUPLICATE_ID')).toBe(true);
  });

  it('refuses two persistent elements sharing an id inside one section', () => {
    const report = malformed({
      beats: [{ id: 'b1', text: 'One.' }],
      sections: [
        {
          id: 'sec1',
          spansBeats: ['b1'],
          persistent: [
            { id: 'char1', element: 'character', placements: [{ at: 'b1.start', slot: 'left' }] },
            { id: 'char1', element: 'character', placements: [{ at: 'b1.end', slot: 'right' }] },
          ],
          scenes: [sound('s1', ['b1'])],
        },
      ],
    });
    expect(report.errors.some((e) => e.code === 'DUPLICATE_ID')).toBe(true);
  });

  it('refuses a beat named "scene", which the anchor grammar reserves', () => {
    const report = malformed({
      beats: [{ id: 'scene', text: 'One.' }],
      sections: [{ id: 'sec1', spansBeats: ['scene'], scenes: [sound('s1', ['scene'])] }],
    });
    expect(report.errors.some((e) => e.code === 'MALFORMED_PLAN')).toBe(true);
  });

  it('stops at the gate instead of running semantic checks over a malformed plan', () => {
    const report = malformed({
      beats: [{ id: 'b1', text: null }],
      sections: [{ id: 'sec1', spansBeats: ['b1'], scenes: [sound('s1', ['b9'])] }],
    });
    expect(report.errors.every((e) => e.code === 'MALFORMED_PLAN')).toBe(true);
  });

  it('still lets a well-formed plan through untouched', () => {
    expect(validateVideoPlan(withScenes([sound('s1', ['b1', 'b2']), sound('s2', ['b3'])])).ok).toBe(
      true,
    );
  });
});

/**
 * The value axis is a choice the agent makes, and this is the decision worth pinning:
 * which way it falls when the agent says nothing. Every plan written before the field
 * existed omits it, so a default of `false` would silently strip the axis off work that
 * was already reviewed with one. The rendered result is a frame and a human's job; that
 * the omission means "keep the axis" is arithmetic and belongs here.
 */
describe('the value axis is optional', () => {
  it('defaults to on, so a plan that never mentions it keeps its axis', () => {
    const parsed = barChartSchema.parse({
      title: 'Share of income spent on rent',
      data: [{ label: 'London', value: 47 }],
    });

    expect(parsed.gridlines).toBe(true);
  });

  it('accepts an axis the agent turned off', () => {
    const report = validateScene(base({ props: { ...base().props, gridlines: false } }));

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('rejects anything that is not a yes or a no', () => {
    const report = validateScene(base({ props: { ...base().props, gridlines: 'off' } }));

    expect(report.ok).toBe(false);
    expect(report.errors[0]?.code).toBe('INVALID_PROPS');
    expect(report.errors[0]?.field).toBe('gridlines');
  });
});

describe('tools', () => {
  it('searchScenes returns the whole index, never a filtered subset', () => {
    expect(searchScenes('completely unrelated query')).toHaveLength(registry.length);
    expect(searchScenes('')).toHaveLength(registry.length);
  });

  it('ranks a matching capability first', () => {
    expect(searchScenes('compare rent between cities')[0]?.id).toBe('bar_chart');
  });

  it('ranks continuous calendar trends as line_chart', () => {
    expect(searchScenes('trend changing over calendar time')[0]?.id).toBe('line_chart');
  });

  it('getSceneSpec exposes schema, constraints, actions, layouts and examples', () => {
    const spec = getSceneSpec('bar_chart');
    expect(spec.propsSchema).toBeTruthy();
    expect(spec.softConstraints.data?.recommendedMax).toBe(8);
    expect(spec.actions.map((a) => a.id)).toContain('highlightBar');
    expect(spec.layouts.map((l) => l.id)).toContain('withCallout');
    expect(spec.examples.length).toBeGreaterThanOrEqual(3);
  });

  it('publishes the complete line_chart authoring contract', () => {
    const spec = getSceneSpec('line_chart');
    expect(spec.propsSchema.properties).toHaveProperty('points');
    expect(spec.propsSchema.properties).toHaveProperty('series');
    expect(spec.actions.map((action) => action.id)).toEqual([
      'revealTrend',
      'focusSeries',
      'focusPoint',
      'annotatePoint',
    ]);
    expect(spec.layouts.map((layout) => layout.id)).toEqual(['standard']);
    expect(spec.examples).toHaveLength(5);
  });

  it('getSceneSpec fails loudly on an unknown id', () => {
    expect(() => getSceneSpec('nope')).toThrow(/Known ids/);
  });
});
