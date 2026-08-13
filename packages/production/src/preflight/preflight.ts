import {
  COMPILER_CHECKS,
  type CompilerError,
  type CompilerWarning,
  FPS,
  type VideoPlan,
  requireCapability,
  validateVideoPlan,
} from '@vox/video';
import { type PreflightReport, preflightReportSchema } from '../contracts/schemas';
import type { DurationCalibration, DurationCalibrationState } from './calibration';

export const PREFLIGHT_LIMITATION =
  'Duration estimates are advisory and derived from authored text; no Take was used. Preflight cannot determine actual Beat or Word timings or whether compilation will emit BELOW_MIN_DURATION or SCENE_BELOW_RECOMMENDED_DURATION. Only compilation against a verified Take is authoritative.';

export const INITIAL_DURATION_CALIBRATION = {
  calibrationVersion: 1,
  key: {
    provider: 'elevenlabs',
    voiceId: 'JBFqnCBsd6RMkjVDRZzb',
    modelId: 'eleven_v3',
    seed: 7,
    language: 'en',
  },
  basis: 'authored_utf16_units',
  pointMsPerUnit: 66.25,
  uncertaintyMargin: 0.2,
  lowerMsPerUnit: 53,
  upperMsPerUnit: 79.5,
  evidence: {
    takeId: '0a663181b592',
    beatCount: 4,
    authoredUtf16Units: 419,
    observedRangeMsPerUnit: [61.6, 71.1],
  },
} as const;

type Assessment = 'point_below' | 'margin_crosses' | 'margin_clear';

const round2 = (value: number): number => Math.round(value * 100) / 100;
const toFrame = (milliseconds: number, fps: number): number =>
  Math.round((milliseconds * fps) / 1000);

const assessment = (lowerFrames: number, pointFrames: number, threshold: number): Assessment => {
  if (pointFrames < threshold) return 'point_below';
  if (lowerFrames < threshold) return 'margin_crosses';
  return 'margin_clear';
};

const emptyCounts = (): Record<Assessment, number> => ({
  point_below: 0,
  margin_crosses: 0,
  margin_clear: 0,
});

const findingOf = (finding: CompilerError | CompilerWarning) => {
  if (finding.code in COMPILER_CHECKS.errors) {
    const check = COMPILER_CHECKS.errors[finding.code as keyof typeof COMPILER_CHECKS.errors];
    return {
      code: finding.code,
      regime: 'error' as const,
      severity: null,
      sectionId: finding.sectionId ?? null,
      sceneId: finding.sceneId ?? null,
      field: finding.field ?? null,
      message: finding.message,
      repair: check.repair,
    };
  }
  const warning = finding as CompilerWarning;
  const check = COMPILER_CHECKS.warnings[warning.code];
  return {
    code: warning.code,
    regime: 'warning' as const,
    severity: warning.severity,
    sectionId: warning.sectionId ?? null,
    sceneId: warning.sceneId ?? null,
    field: warning.field ?? null,
    message: warning.message,
    repair: check.repair,
  };
};

const unavailableDuration = (
  reasonCode: 'CALIBRATION_MISSING' | 'CALIBRATION_INVALIDATED',
): PreflightReport['duration'] => ({
  status: 'unavailable',
  reasonCode,
  calibration: null,
  summary: null,
  scenes: null,
});

export const buildPreflightReport = (
  plan: VideoPlan,
  calibrationState: DurationCalibrationState,
  options: {
    fps?: number;
    calibrationKey?: DurationCalibration['key'];
  } = {},
): PreflightReport => {
  const fps = options.fps ?? FPS;
  const calibrationKey = options.calibrationKey ?? INITIAL_DURATION_CALIBRATION.key;
  if (!Number.isFinite(fps) || fps <= 0)
    throw new TypeError('Preflight fps must be positive and finite.');
  const validation = validateVideoPlan(plan);
  if (!validation.ok) {
    throw new Error('PREFLIGHT_REQUIRES_GREEN_VALIDATION');
  }
  const findings = [...validation.errors, ...validation.warnings].map(findingOf);
  const planChecks = { findingCount: findings.length, findings };

  const keyMatches =
    calibrationState.status !== 'missing' &&
    Object.entries(calibrationKey).every(
      ([key, value]) =>
        calibrationState.calibration.key[key as keyof typeof calibrationKey] === value,
    );
  if (calibrationState.status !== 'active' || !keyMatches) {
    const reasonCode =
      calibrationState.status === 'invalidated' && keyMatches
        ? 'CALIBRATION_INVALIDATED'
        : 'CALIBRATION_MISSING';
    return preflightReportSchema.parse({
      reportVersion: 1,
      authority: 'advisory',
      planChecks,
      duration: unavailableDuration(reasonCode),
      limitations: [PREFLIGHT_LIMITATION],
    });
  }

  const calibration = calibrationState.calibration;
  const boundaries = new Map<string, { lowerMs: number; pointMs: number; upperMs: number }>();
  let lowerMs = 0;
  let pointMs = 0;
  let upperMs = 0;
  for (const beat of plan.beats) {
    boundaries.set(beat.id, { lowerMs, pointMs, upperMs });
    lowerMs += beat.text.length * calibration.lowerMsPerUnit;
    pointMs += beat.text.length * calibration.pointMsPerUnit;
    upperMs += beat.text.length * calibration.upperMsPerUnit;
  }
  boundaries.set('(end)', { lowerMs, pointMs, upperMs });
  const indexOf = new Map(plan.beats.map((beat, index) => [beat.id, index]));
  const minimum = emptyCounts();
  const recommended = emptyCounts();

  const scenes = plan.sections.flatMap((section) =>
    section.scenes.map((scene) => {
      const capability = requireCapability(scene.component);
      const first = indexOf.get(scene.spansBeats[0] as string) as number;
      const last = indexOf.get(scene.spansBeats.at(-1) as string) as number;
      const start = boundaries.get(plan.beats[first]?.id as string) as {
        lowerMs: number;
        pointMs: number;
        upperMs: number;
      };
      const endKey = plan.beats[last + 1]?.id ?? '(end)';
      const end = boundaries.get(endKey) as typeof start;
      const estimate = {
        lowerMs: round2(end.lowerMs - start.lowerMs),
        pointMs: round2(end.pointMs - start.pointMs),
        upperMs: round2(end.upperMs - start.upperMs),
        lowerFrames: toFrame(end.lowerMs, fps) - toFrame(start.lowerMs, fps),
        pointFrames: toFrame(end.pointMs, fps) - toFrame(start.pointMs, fps),
        upperFrames: toFrame(end.upperMs, fps) - toFrame(start.upperMs, fps),
      };
      const minimumAssessment = assessment(
        estimate.lowerFrames,
        estimate.pointFrames,
        capability.meta.minDurationFrames,
      );
      const recommendedAssessment = assessment(
        estimate.lowerFrames,
        estimate.pointFrames,
        capability.meta.recommendedDurationFrames,
      );
      minimum[minimumAssessment] += 1;
      recommended[recommendedAssessment] += 1;

      return {
        sectionId: section.id,
        sceneId: scene.id,
        capabilityId: scene.component,
        authoredUtf16Units: scene.spansBeats.reduce(
          (count, beatId) => count + (plan.beats[indexOf.get(beatId) as number]?.text.length ?? 0),
          0,
        ),
        estimate,
        minimum: { frames: capability.meta.minDurationFrames, assessment: minimumAssessment },
        recommended: {
          frames: capability.meta.recommendedDurationFrames,
          assessment: recommendedAssessment,
        },
        guidance: guidanceFor(minimumAssessment, recommendedAssessment),
      };
    }),
  );

  return preflightReportSchema.parse({
    reportVersion: 1,
    authority: 'advisory',
    planChecks,
    duration: {
      status: 'available',
      reasonCode: null,
      calibration,
      summary: { minimum, recommended },
      scenes,
    },
    limitations: [PREFLIGHT_LIMITATION],
  });
};

const guidanceFor = (minimum: Assessment, recommended: Assessment): string => {
  if (minimum === 'point_below') {
    return 'Risk: the point estimate is below the capability minimum. Reassign or merge existing Beats before recording; revise text only when editorial intent warrants it.';
  }
  if (minimum === 'margin_crosses') {
    return 'Risk: the uncertainty margin crosses the capability minimum. Prefer reassigning or merging existing Beats before recording; revise text only when editorial intent warrants it.';
  }
  if (recommended !== 'margin_clear') {
    return 'Quality risk: the estimate may be shorter than the recommended pacing. Consider spanning another existing Beat; textual revision is optional and editorial.';
  }
  return 'No duration risk is predicted by this advisory calibration; only compilation against a verified Take is authoritative.';
};
