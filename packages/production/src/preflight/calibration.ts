import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { CompilerError } from '@vox/video';
import { type JsonValue, canonicalJson } from '../canonical-json';
import type { PreflightReport } from '../contracts/schemas';
import { INITIAL_DURATION_CALIBRATION } from './preflight';

export type DurationCalibration = {
  calibrationVersion: number;
  key: {
    provider: 'elevenlabs';
    voiceId: string;
    modelId: string;
    seed: number;
    language: 'en';
  };
  basis: 'authored_utf16_units';
  pointMsPerUnit: number;
  uncertaintyMargin: number;
  lowerMsPerUnit: number;
  upperMsPerUnit: number;
  evidence: {
    takeId: string;
    beatCount: number;
    authoredUtf16Units: number;
    observedRangeMsPerUnit: readonly [number, number];
  };
};

export type CalibrationObservation = {
  observedAt: string;
  takeId: string;
  disposition: 'holdout' | 'founding_evidence' | 'different_key';
  outOfRangeBeats: {
    beatId: string;
    authoredUtf16Units: number;
    actualMsPerUnit: number;
  }[];
  falseClearSceneIds: string[];
  falsified: boolean;
};

export type DurationCalibrationState =
  | { status: 'missing'; observations: CalibrationObservation[] }
  | {
      status: 'active';
      calibration: DurationCalibration;
      observations: CalibrationObservation[];
    }
  | {
      status: 'invalidated';
      calibration: DurationCalibration;
      observations: CalibrationObservation[];
      invalidatedBy: CalibrationObservation;
    };

export type VerifiedTakeObservation = {
  takeId: string;
  key: DurationCalibration['key'];
  beats: { id: string; text: string; fromMs: number; toMs: number }[];
  priorPreflight: PreflightReport;
  compileErrors: CompilerError[];
};

export const activeInitialCalibration = (): DurationCalibrationState => ({
  status: 'active',
  calibration: structuredClone(INITIAL_DURATION_CALIBRATION),
  observations: [],
});

const sameKey = (left: DurationCalibration['key'], right: DurationCalibration['key']): boolean =>
  canonicalJson(left as unknown as JsonValue) === canonicalJson(right as unknown as JsonValue);

export const auditVerifiedTake = (
  state: DurationCalibrationState,
  input: VerifiedTakeObservation,
  observedAt = new Date().toISOString(),
): { state: DurationCalibrationState; observation: CalibrationObservation } => {
  if (state.status === 'missing') throw new Error('CALIBRATION_MISSING');
  const calibration = state.calibration;
  let disposition: CalibrationObservation['disposition'] = 'holdout';
  if (!sameKey(calibration.key, input.key)) disposition = 'different_key';
  if (input.takeId === calibration.evidence.takeId) disposition = 'founding_evidence';

  const outOfRangeBeats =
    disposition === 'holdout'
      ? input.beats
          .filter((beat) => beat.text.length > 0)
          .map((beat) => ({
            beatId: beat.id,
            authoredUtf16Units: beat.text.length,
            actualMsPerUnit: Math.round(((beat.toMs - beat.fromMs) / beat.text.length) * 100) / 100,
          }))
          .filter(
            (beat) =>
              beat.actualMsPerUnit < calibration.lowerMsPerUnit ||
              beat.actualMsPerUnit > calibration.upperMsPerUnit,
          )
      : [];

  const clearSceneIds = new Set(
    input.priorPreflight.duration.status === 'available'
      ? input.priorPreflight.duration.scenes
          .filter((scene) => scene.minimum.assessment === 'margin_clear')
          .map((scene) => scene.sceneId)
      : [],
  );
  const falseClearSceneIds =
    disposition === 'holdout'
      ? [
          ...new Set(
            input.compileErrors
              .filter((error) => error.code === 'BELOW_MIN_DURATION' && error.sceneId)
              .map((error) => error.sceneId as string)
              .filter((sceneId) => clearSceneIds.has(sceneId)),
          ),
        ]
      : [];
  const observation: CalibrationObservation = {
    observedAt,
    takeId: input.takeId,
    disposition,
    outOfRangeBeats,
    falseClearSceneIds,
    falsified:
      disposition === 'holdout' && (outOfRangeBeats.length > 0 || falseClearSceneIds.length > 0),
  };
  const observations = [...state.observations, observation];
  if (state.status === 'invalidated') return { state: { ...state, observations }, observation };
  if (observation.falsified) {
    return {
      state: { status: 'invalidated', calibration, observations, invalidatedBy: observation },
      observation,
    };
  }
  return { state: { status: 'active', calibration, observations }, observation };
};

export class DurationCalibrationStore {
  constructor(private readonly path: string) {}

  async load(): Promise<DurationCalibrationState> {
    const bytes = await readFile(this.path, 'utf8').catch(() => null);
    return bytes
      ? (JSON.parse(bytes) as DurationCalibrationState)
      : { status: 'missing', observations: [] };
  }

  async save(state: DurationCalibrationState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = resolve(
      dirname(this.path),
      `.${resolve(this.path).split(/[\\/]/).at(-1)}.tmp`,
    );
    await writeFile(temporary, canonicalJson(state as unknown as JsonValue), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporary, this.path);
  }

  async audit(
    input: VerifiedTakeObservation,
    observedAt?: string,
  ): Promise<CalibrationObservation> {
    const result = auditVerifiedTake(await this.load(), input, observedAt);
    await this.save(result.state);
    return result.observation;
  }

  async installReviewed(calibration: DurationCalibration, reviewed: boolean): Promise<void> {
    if (!reviewed) throw new Error('RECALIBRATION_REQUIRES_REVIEW');
    const current = await this.load();
    if (
      current.status !== 'missing' &&
      calibration.calibrationVersion <= current.calibration.calibrationVersion
    ) {
      throw new Error('CALIBRATION_VERSION_NOT_MONOTONIC');
    }
    await this.save({ status: 'active', calibration, observations: current.observations });
  }
}
