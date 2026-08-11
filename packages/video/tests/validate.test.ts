import { describe, expect, it } from 'vitest';
import { getSceneSpec, searchScenes, validateScene, validateVideoPlan } from '../src/catalog/tools';
import type { SceneInstance } from '../src/core/types';
import { registry } from '../src/scenes/registry';

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
  const plan = {
    beats: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }],
    sections: [
      {
        id: 'sec1',
        scenes: [
          base({ id: 's1', spansBeats: ['b1'], events: [{ at: 'b1.start', action: 'revealAll' }] }),
          base({ id: 's2', spansBeats: ['b2'], events: [{ at: 'b2.start', action: 'revealAll' }] }),
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
    const broken = {
      ...plan,
      sections: [{ id: 'sec1', scenes: [base({ id: 's1', spansBeats: ['b7'], events: [] })] }],
    };
    expect(validateVideoPlan(broken).ok).toBe(false);
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
