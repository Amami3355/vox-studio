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
  type AssetRef,
  type CompileReport,
  type CompilerError,
  type CompilerWarning,
  NO_SAFE_AREA,
  type ResolvedSceneAssets,
  type SceneCapability,
  type SemanticEvent,
  type Slot,
  type TimedBeat,
  type TimedEvent,
} from '../core/types';
import type { MotionProfileId } from '../design/motion';
import { FPS } from '../design/theme';
import { requireCapability } from '../scenes/registry';
import { type CapacityOutcome, capacityOutcome, reducesData } from './capacity';
import { reportCollapsedMentions } from './coherence';
import type { CompiledAudio, CompiledDocument, CompiledScene, CompiledSection } from './document';
import { compositionFor, resolvePersistentLayer, safeAreaFor } from './persistent';
import { checkTimings, spanWindow, toFrameBeats } from './timings';

export {
  compiledDocumentSchema,
  type CompiledAudio,
  type CompiledDocument,
  type CompiledScene,
  type CompiledSection,
} from './document';

/**
 * The gate a take has to pass, published because `packages/voice` is what produces one.
 *
 * ADR-0004 decision 7 put a hand-folded take through this function to find out whether the
 * contract survived real output. That check is now a standing test in the package that
 * does the folding, and it needs the real thing: a second implementation of contiguity
 * living in the producer is the drift this repository keeps refusing to build.
 */
export { checkTimings } from './timings';

/**
 * The slot table, published from the compiler rather than from `core` on purpose.
 *
 * `core/slots.ts` says the compiler is its only consumer, and that stands: a *scene* that
 * reads it is reading a vocabulary it is specified never to see. But Component Studio has
 * to stand in for the compiler — it picks a composition a capability declares and hands
 * the scene the rectangle that follows — and the alternative is a second table in the
 * harness, which is exactly the drift ADR-0003 decision 5 exists to prevent.
 */
export { type Rect, slotRect } from '../core/slots';

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
  /**
   * The take's audio, carried through rather than derived. The compiler never calls TTS
   * and equally never guesses a filename: whoever recorded the beats knows what the audio
   * is called, and nobody else does.
   */
  audio?: CompiledAudio;
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
  audio = {},
}: CompileInput): CompileResult => {
  const report = validateVideoPlan(plan);
  if (!report.ok) return { ok: false, document: null, report };

  const untimed = checkTimings(plan, beats, fps);
  if (untimed.length > 0) {
    return { ok: false, document: null, report: { ...report, ok: false, errors: untimed } };
  }

  const frameBeats = toFrameBeats(plan, beats, fps);
  const windowOf = (spansBeats: string[]) => spanWindow(spansBeats, frameBeats);

  /**
   * The words of each beat, from the plan rather than from the take. A synthetic take
   * carries no words at all (`FrameBeat.words` is empty), and the coherence check has to
   * work the same whether or not anything has been recorded — what it reads is what the
   * agent wrote, which exists from the first draft.
   */
  const textOf = new Map(plan.beats.map((beat) => [beat.id, beat.text]));

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

      const events = resolveEventTimings(scene.events ?? [], frameBeats, sceneBounds);
      checkEventOrder(scene.events ?? [], events, scene.id, section.id, errors);

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
        events,
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

    const spansOf = new Map(section.scenes.map((scene) => [scene.id, scene.spansBeats]));
    const beatsOf = (sceneId: string) =>
      (spansOf.get(sceneId) ?? []).map((id) => ({ id, text: textOf.get(id) ?? '' }));

    for (const scene of scenes) {
      scene.safeArea = safeAreaFor(layer, scene.id);

      /**
       * Asked once and read twice. The composition decided how much of the plan's data
       * reaches the screen; the first reader says so, and the second asks whether anyone
       * is still talking about what left.
       */
      const outcome = capacityOutcome(scene, compositionFor(layer, scene.id));
      if (outcome === null) continue;

      reportComposedCapacity(scene, outcome, section.id, warnings);
      reportCollapsedMentions({
        scene,
        collapsed: outcome.collapsed,
        beats: beatsOf(scene.id),
        sectionId: section.id,
        warnings,
      });
    }

    return {
      id: section.id,
      ...bounds,
      scenes,
      /**
       * Resolved through the *same* resolver the scenes used, so its identity cache is
       * shared. That is the whole reason ADR-0005 sends elements through the resolver
       * rather than validating the reference they used to carry: an element and a scene
       * declaring the same `identityKey` are declaring they show the same thing, and two
       * resolvers would let them disagree.
       */
      persistent: (section.persistent ?? []).map(({ id, element, assetRequirement }) => {
        if (assetRequirement === undefined) return { id, element };

        const asset = resolver.resolve(assetRequirement);
        reportDegradedAsset(asset, {
          subject: `"${id}"`,
          sectionId: section.id,
          field: `persistent[${id}].${ASSET_REQUIREMENT_FIELD}`,
          warnings,
        });

        return { id, element, asset };
      }),
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
      audio,
    },
    report: { ...report, warnings },
  };
};

/**
 * A composition that cost the scene data, said out loud.
 *
 * The last silent degradation in the system. Every other one already announces itself, and
 * the map's standing constraint — *"Degradation stays visible"* — makes that a rule rather
 * than a habit; this one changed the numbers on screen and told nobody. An agent writing
 * five cities inside the published band of 2–8 received a compile report whose only remark
 * was an `info` about where a character stood, and rendered four bars.
 *
 * Emitted here rather than from `capability.checks` because the question does not exist
 * until the composition does: `checks` runs inside `validateScene`, long before any
 * contention has been resolved. This runs on the same line that hands each scene its safe
 * area, which is the first moment the answer is knowable.
 */
const reportComposedCapacity = (
  scene: CompiledScene,
  outcome: CapacityOutcome,
  sectionId: string,
  warnings: CompilerWarning[],
): void => {
  if (!reducesData(outcome)) return;

  const { composition, capacity, onFullCanvas, collapsed } = outcome;
  const names = collapsed.map((entry) => `"${entry.label}"`).join(', ');

  warnings.push({
    code: 'CAPACITY_REDUCED_BY_COMPOSITION',
    severity: 'quality',
    sceneId: scene.id,
    sectionId,
    field: 'props',
    message:
      `"${scene.id}" yields into "${composition}", where its "${scene.layout}" layout ` +
      `holds ${capacity} of the ${onFullCanvas} it holds on the full canvas. ` +
      `${names} ${collapsed.length === 1 ? 'is' : 'are'} collapsed and will not be on screen.`,
    suggestion:
      'Place the contending element in a slot this scene does not occupy, choose a layout ' +
      'the composition holds more of, or shorten the series to what it holds.',
  });
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
): void =>
  reportDegradedAsset(assets[ASSET_REQUIREMENT_FIELD], {
    subject: `"${sceneId}"`,
    sceneId,
    sectionId,
    field: `props.${ASSET_REQUIREMENT_FIELD}`,
    warnings,
  });

/**
 * One `AssetRef`, said out loud — for a scene's plate or a persistent element's figure.
 *
 * `sceneId` is omitted for an element rather than filled with the element's id: the field
 * means what it says, and a warning claiming a scene that does not exist would be worse
 * than one that names the element in `field` and in the message, which is what this does.
 */
const reportDegradedAsset = (
  ref: AssetRef | undefined,
  {
    subject,
    sceneId,
    sectionId,
    field,
    warnings,
  }: {
    subject: string;
    sceneId?: string;
    sectionId: string;
    field: string;
    warnings: CompilerWarning[];
  },
): void => {
  if (ref === undefined || ref.status === 'ready') return;

  if (ref.status === 'placeholder') {
    warnings.push({
      code: 'ASSET_PLACEHOLDER',
      severity: 'quality',
      ...(sceneId ? { sceneId } : {}),
      sectionId,
      field,
      message: `${subject} renders a placeholder plate: nothing has resolved requirement ${ref.pendingRequirementId} yet.`,
      suggestion:
        'Add a matching entry to the local asset library, or run the generation pass that fills the resolver cache before compiling.',
    });
    return;
  }

  warnings.push({
    code: 'ASSET_PLACEHOLDER',
    severity: 'important',
    ...(sceneId ? { sceneId } : {}),
    sectionId,
    field,
    message: `${subject} renders a placeholder plate because requirement ${ref.requirementId} failed to resolve: ${ref.reason}`,
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

/**
 * ADR-0011: the events array is a script, and the compiler holds it to that.
 *
 * The second check a plan alone cannot answer, and for the same reason as the first. An
 * anchor is a string until a Take exists — `b6.mid` and `b6.word:leaving` have no order
 * between them until someone has spoken "leaving" — so this cannot live in the schema or in
 * `validateVideoPlan`, and runs here on the frames `resolveEventTimings` has just produced.
 *
 * Reported against the *later-written* event, because that is the one whose anchor has to
 * move, and the message names both frames rather than only the breach: an author looking at
 * two word anchors needs to know which of the two words the take put first.
 *
 * `>=` and not `>`. Two events on one moment is ordinary authoring, `resolveEvents` folds
 * them in written order because `Array.prototype.sort` is stable, and a strict rule would
 * refuse plans that were never wrong.
 */
const checkEventOrder = (
  authored: SemanticEvent[],
  timed: TimedEvent[],
  sceneId: string,
  sectionId: string,
  errors: CompilerError[],
): void => {
  for (let i = 1; i < timed.length; i++) {
    const previous = timed[i - 1] as TimedEvent;
    const current = timed[i] as TimedEvent;
    if (current.frame >= previous.frame) continue;

    const before = authored[i - 1] as SemanticEvent;
    const after = authored[i] as SemanticEvent;

    errors.push({
      code: 'EVENTS_OUT_OF_ORDER',
      sceneId,
      sectionId,
      field: `events[${i}].at`,
      message: `Event ${i + 1} ("${after.action}" at "${after.at}", frame ${current.frame}) is written after event ${i} ("${before.action}" at "${before.at}", frame ${previous.frame}) but lands ${previous.frame - current.frame} frames earlier. A scene's events play in the order they are written. An event that overtakes the one above it means the anchors disagree with the script. Re-anchor one of them, or swap the two lines.`,
    });
  }
};
