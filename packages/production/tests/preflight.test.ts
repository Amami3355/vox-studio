import type { VideoPlan } from '@vox/video';
import { describe, expect, it } from 'vitest';
import { activeInitialCalibration } from '../src/preflight/calibration';
import {
  INITIAL_DURATION_CALIBRATION,
  PREFLIGHT_LIMITATION,
  buildPreflightReport,
} from '../src/preflight/preflight';

const planFor = (texts: string[]): VideoPlan => ({
  beats: texts.map((text, index) => ({ id: `b${index + 1}`, text })),
  sections: [
    {
      id: 'section',
      spansBeats: texts.map((_, index) => `b${index + 1}`),
      scenes: texts.map((_, index) => ({
        id: `scene-${index + 1}`,
        component: 'image_context',
        layout: 'splitLeft',
        spansBeats: [`b${index + 1}`],
        props: {
          headline: `Context ${index + 1}`,
          caption: '',
          assetRequirement: {
            type: 'image',
            subject: `Documentary context ${index + 1}`,
            treatment: 'photo',
            orientation: 'landscape',
          },
        },
      })),
    },
  ],
});

describe('advisory duration Preflight', () => {
  it('publishes the accepted calibration and never claims compile authority', () => {
    const report = buildPreflightReport(
      planFor([`${'x'.repeat(56)}.`]),
      activeInitialCalibration(),
    );

    expect(report.authority).toBe('advisory');
    expect(report.limitations).toEqual([PREFLIGHT_LIMITATION]);
    expect(report.duration.status).toBe('available');
    if (report.duration.status !== 'available') throw new Error('Expected available duration.');
    expect(report.duration.calibration).toMatchObject(INITIAL_DURATION_CALIBRATION);
    expect(report.duration.scenes[0]?.minimum.assessment).toBe('margin_clear');
    expect(JSON.stringify(report)).not.toContain('compiled');
  });

  it('counts authored UTF-16 units verbatim and excludes any Beat separator', () => {
    const text = 'A😀.';
    const report = buildPreflightReport(planFor([text]), activeInitialCalibration());
    if (report.duration.status !== 'available') throw new Error('Expected available duration.');
    const scene = report.duration.scenes[0];

    expect(text.length).toBe(4);
    expect(scene?.authoredUtf16Units).toBe(4);
    expect(scene?.estimate.pointMs).toBe(265);
  });

  it('uses cumulative rounded boundaries and classifies both thresholds independently', () => {
    const texts = [`${'x'.repeat(44)}.`, `${'x'.repeat(45)}.`, `${'x'.repeat(56)}.`];
    const report = buildPreflightReport(planFor(texts), activeInitialCalibration(), { fps: 30 });
    if (report.duration.status !== 'available') throw new Error('Expected available duration.');

    expect(report.duration.scenes.map((scene) => scene.minimum.assessment)).toEqual([
      'point_below',
      'margin_crosses',
      'margin_clear',
    ]);
    const cumulativeStart = Math.round((texts[0]!.length * 66.25 * 30) / 1000);
    const cumulativeEnd = Math.round(((texts[0]!.length + texts[1]!.length) * 66.25 * 30) / 1000);
    expect(report.duration.scenes[1]?.estimate.pointFrames).toBe(cumulativeEnd - cumulativeStart);
    expect(report.duration.summary.minimum).toEqual({
      point_below: 1,
      margin_crosses: 1,
      margin_clear: 1,
    });
    expect(report.duration.summary.recommended.point_below).toBeGreaterThan(0);
  });

  it('reports missing and invalidated calibration without suppressing plan-only findings', () => {
    const plan = planFor([`${'x'.repeat(56)}.`]);
    const missing = buildPreflightReport(plan, { status: 'missing', observations: [] });
    const invalidated = buildPreflightReport(plan, {
      status: 'invalidated',
      calibration: structuredClone(INITIAL_DURATION_CALIBRATION),
      observations: [],
      invalidatedBy: {
        observedAt: '2026-08-13T00:00:00.000Z',
        takeId: 'holdout',
        disposition: 'holdout',
        outOfRangeBeats: [],
        falseClearSceneIds: ['scene-1'],
        falsified: true,
      },
    });

    expect(missing.duration).toMatchObject({
      status: 'unavailable',
      reasonCode: 'CALIBRATION_MISSING',
      calibration: null,
      summary: null,
      scenes: null,
    });
    expect(invalidated.duration).toMatchObject({
      status: 'unavailable',
      reasonCode: 'CALIBRATION_INVALIDATED',
    });
    expect(missing.planChecks).toEqual(invalidated.planChecks);
  });

  it('does not borrow the English George calibration for another synthesis key', () => {
    const report = buildPreflightReport(
      planFor(['A complete sentence.']),
      activeInitialCalibration(),
      {
        calibrationKey: { ...INITIAL_DURATION_CALIBRATION.key, seed: 8 },
      },
    );

    expect(report.duration).toMatchObject({
      status: 'unavailable',
      reasonCode: 'CALIBRATION_MISSING',
    });
  });

  it('refuses to masquerade as Preflight when plan validation is red', () => {
    const plan = planFor(['Valid sentence.']);
    plan.sections[0]!.scenes[0]!.component = 'invented_capability';

    expect(() => buildPreflightReport(plan, activeInitialCalibration())).toThrow(
      'PREFLIGHT_REQUIRES_GREEN_VALIDATION',
    );
  });
});
