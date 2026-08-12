/**
 * The compiler at its seam: plans and real beat timings in, a compiled document out.
 *
 * Everything asserted here is a fact about *composition* — where a scene starts, where a
 * character is, what the report says — and none of it needs a browser. That is the point
 * of the document being JSON.
 */
import { describe, expect, it } from 'vitest';
import type { VideoPlan } from '../src/catalog/validate';
import { compile } from '../src/compile';
import type { CompileReport, TimedBeat } from '../src/core/types';

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

/** Five seconds of speech over two beats, so the arithmetic is checkable by hand. */
const timedBeats: TimedBeat[] = [
  { id: 'b1', text: 'Rents have climbed for a decade.', fromMs: 0, toMs: 2000 },
  { id: 'b2', text: 'London is the extreme case.', fromMs: 2000, toMs: 5000 },
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

describe('compile', () => {
  it('turns spoken milliseconds into the frames a scene occupies', () => {
    const result = compile({ plan: onePlan, beats: timedBeats });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 5000ms at 30fps.
    expect(result.document.durationInFrames).toBe(150);
    expect(result.document.sections[0]?.scenes[0]).toMatchObject({
      id: 'scene1',
      capabilityId: 'bar_chart',
      from: 0,
      to: 150,
    });
  });

  it('lands each event on the frame its anchor names, relative to its scene', () => {
    const result = compile({ plan: onePlan, beats: timedBeats });
    if (!result.ok) throw new Error('expected the plan to compile');

    // b2 starts at 2000ms, which is frame 60, and the scene starts at frame 0.
    expect(result.document.sections[0]?.scenes[0]?.events).toEqual([
      { frame: 0, action: 'showBaseline' },
      { frame: 60, action: 'highlightBar', payload: { label: 'London' } },
    ]);
  });

  it('holds a persistent element over the scene that can yield, and drops it over the one that cannot', () => {
    const result = compile({ plan: continuityPlan, beats: timedBeats });
    if (!result.ok) throw new Error(`expected the plan to compile: ${format(result.report)}`);

    // Visible for b1 (frames 0–60) and absent for b2: absence *is* hiddenness.
    expect(result.document.sections[0]?.layoutStates).toEqual([
      { elementId: 'narrator', from: 0, to: 60, rect: { top: 70, right: 0, bottom: 0, left: 70 } },
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

  it('refuses a plan whose beats were never spoken', () => {
    const result = compile({ plan: onePlan, beats: [timedBeats[0] as TimedBeat] });

    expect(result.ok).toBe(false);
    expect(result.document).toBeNull();
    expect(result.report.errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_BEAT_TIMING', field: 'beats.b2' }),
    );
  });
});
