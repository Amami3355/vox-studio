/**
 * The compiler.
 *
 * Rule 3: the agent expresses semantic time, the compiler produces physical time. This is
 * the one place milliseconds become frames, and the one place a plan becomes something
 * Remotion can play.
 */
import { repositoryAssetLibrary } from '../assets/library';
import { type AssetResolver, createAssetResolver, resolveSceneAssets } from '../assets/resolver';
import { type VideoPlan, validateVideoPlan } from '../catalog/validate';
import { resolveEventTimings } from '../core/anchors';
import { ASSET_REQUIREMENT_FIELD } from '../core/assets';
import {
  type CompileReport,
  type CompilerError,
  type CompilerWarning,
  NO_SAFE_AREA,
  type ResolvedSceneAssets,
  type SceneCapability,
  type TimedBeat,
} from '../core/types';
import type { MotionProfileId } from '../design/motion';
import { FPS } from '../design/theme';
import { requireCapability } from '../scenes/registry';
import type { CompiledDocument, CompiledScene, CompiledSection } from './document';
import { resolvePersistentLayer, safeAreaFor } from './persistent';
import { checkTimings, spanWindow, toFrameBeats } from './timings';

export type { CompiledDocument, CompiledScene, CompiledSection } from './document';

export type CompileInput = {
  plan: VideoPlan;
  /** From `packages/voice`, or a fixture. The compiler never calls TTS itself. */
  beats: TimedBeat[];
  /**
   * Accepted, not constructed, so the identity cache is scoped to one compilation rather
   * than to the process. Synchronous by design: when generation and licensed search land,
   * the async work fills that cache *before* compiling, and resolution here stays a
   * lookup — which is what keeps the compiler a pure function.
   */
  resolver?: AssetResolver;
  fps?: number;
};

/**
 * `document` is null exactly when `ok` is false, so no caller can render a plan that did
 * not compile. Rule 5's loud failure, enforced by the type rather than by discipline.
 */
export type CompileResult =
  | { ok: true; document: CompiledDocument; report: CompileReport }
  | { ok: false; document: null; report: CompileReport };

export const compile = ({
  plan,
  beats,
  resolver = createAssetResolver({ library: repositoryAssetLibrary }),
  fps = FPS,
}: CompileInput): CompileResult => {
  const report = validateVideoPlan(plan);
  if (!report.ok) return { ok: false, document: null, report };

  const untimed = checkTimings(plan, beats, fps);
  if (untimed.length > 0) {
    return { ok: false, document: null, report: { ...report, ok: false, errors: untimed } };
  }

  const frameBeats = toFrameBeats(plan, beats, fps);
  const windowOf = (spansBeats: string[]) => spanWindow(spansBeats, frameBeats);

  const warnings = [...report.warnings];
  /**
   * Collected while the sections are built and gated once at the end, rather than thrown
   * at the first breach: §8.1's messages are fed back to an agent for a repair pass, and a
   * pass that fixes one scene only to be told about the next is a loop where a single
   * report would have done.
   */
  const errors: CompilerError[] = [];

  const sections: CompiledSection[] = plan.sections.map((section) => {
    const bounds = windowOf(section.spansBeats);

    const scenes: CompiledScene[] = section.scenes.map((scene) => {
      const sceneBounds = windowOf(scene.spansBeats);

      const capability = requireCapability(scene.component);
      checkDuration(capability, scene.id, section.id, sceneBounds, errors, warnings);

      const assets = resolveSceneAssets(scene, resolver);
      reportDegradedAssets(assets, scene.id, section.id, warnings);

      return {
        id: scene.id,
        capabilityId: scene.component,
        props: scene.props,
        /**
         * Resolved here rather than defaulted in the renderer. A default that lives in
         * the runtime is a decision taken after the document was written, which is
         * exactly the kind of drift a compiled artifact exists to prevent.
         */
        layout: scene.layout ?? (Object.keys(capability.layouts)[0] as string),
        motionProfile: scene.motionProfile ?? 'subtleDrift',
        assets,
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

    return {
      id: section.id,
      ...bounds,
      scenes,
      persistent: (section.persistent ?? []).map(({ id, element, asset }) =>
        asset === undefined ? { id, element } : { id, element, asset },
      ),
      layoutStates: layer.layoutStates,
    };
  });

  if (errors.length > 0) {
    return { ok: false, document: null, report: { ...report, ok: false, errors, warnings } };
  }

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
 * A degraded asset, said out loud.
 *
 * Both states render the same theme plate, and until now both compiled in silence — so a
 * project that had never run the asset pipeline produced a report identical to one where
 * every picture resolved. The report is a deliverable; a plate standing in for a
 * photograph is exactly the kind of thing it exists to say.
 *
 * The two states differ in who has to act. `placeholder` is work not done yet, and the
 * generation pass that fills the identity cache will clear it. `failed` is work that was
 * done and did not survive, so nothing downstream will clear it on its own — §5.2 gives
 * that one `important`, and the resolver's reason travels into the message because it is
 * the only place that reason exists.
 */
const reportDegradedAssets = (
  assets: ResolvedSceneAssets,
  sceneId: string,
  sectionId: string,
  warnings: CompilerWarning[],
): void => {
  const ref = assets[ASSET_REQUIREMENT_FIELD];
  if (ref === undefined || ref.status === 'ready') return;

  const field = `props.${ASSET_REQUIREMENT_FIELD}`;

  if (ref.status === 'placeholder') {
    warnings.push({
      code: 'ASSET_PLACEHOLDER',
      severity: 'quality',
      sceneId,
      sectionId,
      field,
      message: `"${sceneId}" renders a placeholder plate: nothing has resolved requirement ${ref.pendingRequirementId} yet.`,
      suggestion:
        'Add a matching entry to the local asset library, or run the generation pass that fills the resolver cache before compiling.',
    });
    return;
  }

  warnings.push({
    code: 'ASSET_PLACEHOLDER',
    severity: 'important',
    sceneId,
    sectionId,
    field,
    message: `"${sceneId}" renders a placeholder plate because requirement ${ref.requirementId} failed to resolve: ${ref.reason}`,
    suggestion:
      'Fix or replace the asset this requirement points at. Unlike a pending placeholder, nothing downstream will resolve it later.',
  });
};

/**
 * Rule 5's two regimes over one number.
 *
 * `minDurationFrames` is a hard floor: under it the scene cannot play the animation its
 * capability is built around, so §8.1 makes it an error and asks for a merge.
 * `recommendedDurationFrames` is a soft one — the scene plays, it just plays hurried.
 *
 * This is the first check in the system a plan alone could not answer, which is why it
 * lives here rather than in `validateVideoPlan`: a scene has no duration until the
 * milliseconds someone actually spoke have become frames. Nothing above this line knows
 * how long anything is.
 */
const checkDuration = (
  capability: SceneCapability,
  sceneId: string,
  sectionId: string,
  bounds: { from: number; to: number },
  errors: CompilerError[],
  warnings: CompilerWarning[],
): void => {
  const frames = bounds.to - bounds.from;
  const { minDurationFrames, recommendedDurationFrames, id } = capability.meta;

  if (frames < minDurationFrames) {
    errors.push({
      code: 'BELOW_MIN_DURATION',
      sceneId,
      sectionId,
      field: 'spansBeats',
      message: `Scene "${sceneId}" plays for ${frames} frames, under the ${minDurationFrames} "${id}" needs to complete its animation. Give it another beat, or merge it with the scene beside it.`,
    });
    return;
  }

  if (frames < recommendedDurationFrames) {
    warnings.push({
      code: 'SCENE_BELOW_RECOMMENDED_DURATION',
      severity: 'quality',
      sceneId,
      sectionId,
      field: 'spansBeats',
      message: `Scene "${sceneId}" plays for ${frames} frames, where "${id}" is designed for ${recommendedDurationFrames}.`,
      suggestion:
        'It will read as hurried rather than broken. Let it span another beat, or move some ' +
        'of what it says into the scene next to it.',
    });
  }
};
