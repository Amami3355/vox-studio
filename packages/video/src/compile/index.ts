/**
 * The compiler.
 *
 * Rule 3: the agent expresses semantic time, the compiler produces physical time. This is
 * the one place milliseconds become frames, and the one place a plan becomes something
 * Remotion can play.
 */
import { type VideoPlan, validateVideoPlan } from '../catalog/validate';
import { type FrameBeat, resolveEventTimings } from '../core/anchors';
import {
  type CompileReport,
  type CompilerError,
  NO_SAFE_AREA,
  type TimedBeat,
} from '../core/types';
import { FPS } from '../design/theme';
import type { CompiledDocument, CompiledScene, CompiledSection } from './document';
import { resolvePersistentLayer, safeAreaFor } from './persistent';

export type { CompiledDocument, CompiledScene, CompiledSection } from './document';

export type CompileInput = {
  plan: VideoPlan;
  /** From `packages/voice`, or a fixture. The compiler never calls TTS itself. */
  beats: TimedBeat[];
  fps?: number;
};

/**
 * `document` is null exactly when `ok` is false, so no caller can render a plan that did
 * not compile. Rule 5's loud failure, enforced by the type rather than by discipline.
 */
export type CompileResult =
  | { ok: true; document: CompiledDocument; report: CompileReport }
  | { ok: false; document: null; report: CompileReport };

export const compile = ({ plan, beats, fps = FPS }: CompileInput): CompileResult => {
  const report = validateVideoPlan(plan);
  if (!report.ok) return { ok: false, document: null, report };

  const untimed = missingTimings(plan, beats);
  if (untimed.length > 0) {
    return { ok: false, document: null, report: { ...report, ok: false, errors: untimed } };
  }

  const frameBeats = toFrameBeats(plan, beats, fps);
  const windowOf = (spansBeats: string[]) => spanWindow(spansBeats, frameBeats);

  const warnings = [...report.warnings];

  const sections: CompiledSection[] = plan.sections.map((section) => {
    const bounds = windowOf(section.spansBeats);

    const scenes: CompiledScene[] = section.scenes.map((scene) => {
      const sceneBounds = windowOf(scene.spansBeats);

      return {
        id: scene.id,
        capabilityId: scene.component,
        ...sceneBounds,
        events: resolveEventTimings(scene.events ?? [], frameBeats, sceneBounds),
        safeArea: NO_SAFE_AREA,
      };
    });

    /**
     * After the scene windows exist, because the ladder resolves per scene and needs to
     * know which frames each one owns — and before the document is sealed, because its
     * outcome edits the scenes it crossed.
     */
    const layer = resolvePersistentLayer(section, scenes, frameBeats, bounds);
    warnings.push(...layer.warnings);

    for (const scene of scenes) {
      scene.safeArea = safeAreaFor(layer, scene.id);
    }

    return { id: section.id, ...bounds, scenes, layoutStates: layer.layoutStates };
  });

  return {
    ok: true,
    document: {
      fps,
      durationInFrames: frameBeats.at(-1)?.to ?? 0,
      beats: frameBeats,
      sections,
    },
    report: { ...report, warnings },
  };
};

/**
 * A plan beat the voice-over never spoke.
 *
 * Checked before any arithmetic, because the alternative is a `NaN` propagating into
 * every window derived from that beat — a scene that starts at frame `NaN` renders
 * nothing and reports nothing, which is the exact failure §8.1 exists to prevent.
 */
const missingTimings = (plan: VideoPlan, beats: TimedBeat[]): CompilerError[] => {
  const spoken = new Set(beats.map((beat) => beat.id));
  return plan.beats
    .filter((beat) => !spoken.has(beat.id))
    .map((beat) => ({
      code: 'MISSING_BEAT_TIMING' as const,
      field: `beats.${beat.id}`,
      message: `Beat "${beat.id}" has no timing. Every beat in the plan must be spoken, because a scene's duration is the sum of the beats it spans.`,
      expected: beats.map((b) => b.id),
    }));
};

/**
 * Convert *boundaries*, never durations.
 *
 * Rounding each beat's length independently and summing accumulates the error into gaps
 * and overlaps between scenes — a one-frame black flash that no test would name and
 * everyone would see. Converting each millisecond boundary with one function makes
 * contiguity a property of the arithmetic instead of something to check afterwards.
 */
const toFrameBeats = (plan: VideoPlan, beats: TimedBeat[], fps: number): FrameBeat[] => {
  const timingOf = new Map(beats.map((beat) => [beat.id, beat]));
  const toFrame = (ms: number) => Math.round((ms * fps) / 1000);

  return plan.beats.map((beat) => {
    const timing = timingOf.get(beat.id) as TimedBeat;
    return { id: beat.id, from: toFrame(timing.fromMs), to: toFrame(timing.toMs) };
  });
};

/** The window of a contiguous run of beats. The partition is already validated. */
const spanWindow = (spansBeats: string[], frameBeats: FrameBeat[]) => {
  const covered = frameBeats.filter((beat) => spansBeats.includes(beat.id));
  return { from: covered[0]?.from ?? 0, to: covered.at(-1)?.to ?? 0 };
};
