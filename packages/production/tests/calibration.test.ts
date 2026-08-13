import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompilerError, VideoPlan } from '@vox/video';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DurationCalibrationStore,
  type VerifiedTakeObservation,
  activeInitialCalibration,
  auditVerifiedTake,
} from '../src/preflight/calibration';
import { INITIAL_DURATION_CALIBRATION, buildPreflightReport } from '../src/preflight/preflight';

const plan: VideoPlan = {
  beats: [{ id: 'b1', text: `${'x'.repeat(56)}.` }],
  sections: [
    {
      id: 'section',
      spansBeats: ['b1'],
      scenes: [
        {
          id: 'scene-1',
          component: 'image_context',
          spansBeats: ['b1'],
          props: {
            headline: 'Calibration holdout',
            caption: '',
            assetRequirement: {
              type: 'image',
              subject: 'Calibration slate',
              treatment: 'photo',
              orientation: 'landscape',
            },
          },
        },
      ],
    },
  ],
};

const input = (
  milliseconds: number,
  compileErrors: CompilerError[] = [],
): VerifiedTakeObservation => ({
  takeId: 'holdout000001',
  key: structuredClone(INITIAL_DURATION_CALIBRATION.key),
  beats: [{ id: 'b1', text: plan.beats[0]!.text, fromMs: 0, toMs: milliseconds }],
  priorPreflight: buildPreflightReport(plan, activeInitialCalibration()),
  compileErrors,
});

let temporaryRoot: string | null = null;
afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = null;
});

describe('duration-calibration falsification', () => {
  it('keeps an in-policy holdout active', () => {
    const result = auditVerifiedTake(
      activeInitialCalibration(),
      input(plan.beats[0]!.text.length * 66),
    );

    expect(result.observation.falsified).toBe(false);
    expect(result.state.status).toBe('active');
  });

  it('invalidates immediately when a Beat falls outside the policy interval', () => {
    const result = auditVerifiedTake(
      activeInitialCalibration(),
      input(plan.beats[0]!.text.length * 90),
    );

    expect(result.observation.outOfRangeBeats).toHaveLength(1);
    expect(result.observation.falsified).toBe(true);
    expect(result.state.status).toBe('invalidated');
    expect(buildPreflightReport(plan, result.state).duration).toMatchObject({
      status: 'unavailable',
      reasonCode: 'CALIBRATION_INVALIDATED',
    });
  });

  it('invalidates a minimum assessment falsified by authoritative compilation', () => {
    const result = auditVerifiedTake(
      activeInitialCalibration(),
      input(plan.beats[0]!.text.length * 66, [
        {
          code: 'BELOW_MIN_DURATION',
          sectionId: 'section',
          sceneId: 'scene-1',
          field: 'spansBeats',
          message: 'Authoritative Take is below the hard minimum.',
        },
      ]),
    );

    expect(result.observation.falseClearSceneIds).toEqual(['scene-1']);
    expect(result.state.status).toBe('invalidated');
  });

  it('does not treat founding evidence or another key as a holdout', () => {
    const founding = input(plan.beats[0]!.text.length * 100);
    founding.takeId = INITIAL_DURATION_CALIBRATION.evidence.takeId;
    const foundingResult = auditVerifiedTake(activeInitialCalibration(), founding);
    const other = input(plan.beats[0]!.text.length * 100);
    other.key = { ...other.key, seed: 8 };
    const otherResult = auditVerifiedTake(activeInitialCalibration(), other);

    expect(foundingResult.observation.disposition).toBe('founding_evidence');
    expect(foundingResult.observation.falsified).toBe(false);
    expect(otherResult.observation.disposition).toBe('different_key');
    expect(otherResult.observation.falsified).toBe(false);
  });

  it('persists falsification and accepts only reviewed monotonic recalibration', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'vox-calibration-'));
    const store = new DurationCalibrationStore(join(temporaryRoot, 'duration.json'));
    await store.save(activeInitialCalibration());
    await store.audit(input(plan.beats[0]!.text.length * 90), '2026-08-13T10:00:00.000Z');
    expect((await store.load()).status).toBe('invalidated');

    const versionTwo = { ...structuredClone(INITIAL_DURATION_CALIBRATION), calibrationVersion: 2 };
    await expect(store.installReviewed(versionTwo, false)).rejects.toThrow(
      'RECALIBRATION_REQUIRES_REVIEW',
    );
    await store.installReviewed(versionTwo, true);
    const reloaded = await store.load();
    expect(reloaded.status).toBe('active');
    if (reloaded.status === 'active') expect(reloaded.calibration.calibrationVersion).toBe(2);
    await expect(store.installReviewed(versionTwo, true)).rejects.toThrow(
      'CALIBRATION_VERSION_NOT_MONOTONIC',
    );
  });
});
