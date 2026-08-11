import { describe, expect, it } from 'vitest';
import {
  type VideoPlan,
  getSceneSpec,
  searchScenes,
  validateScene,
  validateVideoPlan,
} from '../src/catalog/tools';
import type { PersistentElement, Placement, SceneInstance } from '../src/core/types';
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
    expect(() => validateVideoPlan(plan)).not.toThrow();
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

  it('getSceneSpec exposes schema, constraints, actions, layouts and examples', () => {
    const spec = getSceneSpec('bar_chart');
    expect(spec.propsSchema).toBeTruthy();
    expect(spec.softConstraints.data?.recommendedMax).toBe(8);
    expect(spec.actions.map((a) => a.id)).toContain('highlightBar');
    expect(spec.layouts.map((l) => l.id)).toContain('withCallout');
    expect(spec.examples.length).toBeGreaterThanOrEqual(3);
  });

  it('getSceneSpec fails loudly on an unknown id', () => {
    expect(() => getSceneSpec('nope')).toThrow(/Known ids/);
  });
});
