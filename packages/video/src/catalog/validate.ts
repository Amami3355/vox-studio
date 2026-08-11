/**
 * Validation.
 *
 * Hard constraint → loud failure before render. Soft constraint → silent degradation
 * plus a warning. The two regimes are distinct and never overlap: nothing in this file
 * turns a warning into an error or the reverse.
 */
import type {
  CompileReport,
  CompilerError,
  CompilerWarning,
  SceneCapability,
  SceneInstance,
} from '../core/types';
import { motionProfileIds } from '../design/motion';
import { capabilityIds, findCapability } from '../scenes/registry';

export type VideoPlanBeat = { id: string };

export type VideoPlanSection = {
  id: string;
  scenes: SceneInstance[];
};

export type VideoPlan = {
  beats: VideoPlanBeat[];
  sections: VideoPlanSection[];
};

const ANCHOR_RE = /^([A-Za-z0-9_-]+)\.(start|mid|end)(?:[+-](short|long))?$/;

export const validateScene = (
  instance: SceneInstance,
  options: { knownBeats?: string[] } = {},
): CompileReport => {
  const errors: CompilerError[] = [];
  const warnings: CompilerWarning[] = [];
  const sceneId = instance.id;

  const capability = findCapability(instance.component);
  if (!capability) {
    errors.push({
      code: 'UNKNOWN_CAPABILITY',
      sceneId,
      message: `Unknown SceneCapability "${instance.component}".`,
      expected: capabilityIds(),
    });
    return { ok: false, errors, warnings };
  }

  validateProps(capability, instance, errors);
  validateLayout(capability, instance, errors);
  validateMotionProfile(instance, errors);
  validateEvents(capability, instance, errors, options.knownBeats);
  collectSoftWarnings(capability, instance, warnings);

  if (capability.checks) {
    const extra = capability.checks(instance);
    errors.push(...extra.errors);
    warnings.push(...extra.warnings);
  }

  return { ok: errors.length === 0, errors, warnings };
};

const validateProps = (
  capability: SceneCapability,
  instance: SceneInstance,
  errors: CompilerError[],
): void => {
  const parsed = capability.schema.safeParse(instance.props);
  if (parsed.success) return;
  for (const issue of parsed.error.issues) {
    errors.push({
      code: 'INVALID_PROPS',
      sceneId: instance.id,
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    });
  }
};

const validateLayout = (
  capability: SceneCapability,
  instance: SceneInstance,
  errors: CompilerError[],
): void => {
  if (instance.layout === undefined) return;
  if (capability.layouts[instance.layout]) return;
  errors.push({
    code: 'UNKNOWN_LAYOUT',
    sceneId: instance.id,
    field: 'layout',
    message: `Unknown layout "${instance.layout}" for "${capability.meta.id}".`,
    expected: Object.keys(capability.layouts),
  });
};

const validateMotionProfile = (instance: SceneInstance, errors: CompilerError[]): void => {
  if (instance.motionProfile === undefined) return;
  if ((motionProfileIds as string[]).includes(instance.motionProfile)) return;
  errors.push({
    code: 'INVALID_PROPS',
    sceneId: instance.id,
    field: 'motionProfile',
    message: `Unknown motion profile "${instance.motionProfile}".`,
    expected: motionProfileIds as unknown as string[],
  });
};

const validateEvents = (
  capability: SceneCapability,
  instance: SceneInstance,
  errors: CompilerError[],
  knownBeats: string[] | undefined,
): void => {
  const available = Object.keys(capability.actions);

  for (const [index, event] of (instance.events ?? []).entries()) {
    const def = capability.actions[event.action];
    if (!def) {
      errors.push({
        code: 'UNKNOWN_ACTION',
        sceneId: instance.id,
        field: `events[${index}].action`,
        message: `Action "${event.action}" is not in the vocabulary of "${capability.meta.id}". An action outside the vocabulary renders silently and animates nothing.`,
        expected: available,
      });
      continue;
    }

    if (def.payload) {
      const parsed = def.payload.safeParse(event.payload ?? {});
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push({
            code: 'INVALID_PAYLOAD',
            sceneId: instance.id,
            field: `events[${index}].payload.${issue.path.join('.')}`,
            message: issue.message,
          });
        }
      }
    } else if (event.payload !== undefined) {
      errors.push({
        code: 'INVALID_PAYLOAD',
        sceneId: instance.id,
        field: `events[${index}].payload`,
        message: `Action "${event.action}" takes no payload.`,
      });
    }

    const match = ANCHOR_RE.exec(event.at);
    if (!match) {
      errors.push({
        code: 'UNKNOWN_ANCHOR',
        sceneId: instance.id,
        field: `events[${index}].at`,
        message: `"${event.at}" is not a valid anchor. Expected <beatId>.start|mid|end with an optional +short/-short/+long/-long offset.`,
      });
      continue;
    }

    const beatId = match[1] as string;
    const scope = knownBeats ?? instance.spansBeats;
    if (beatId !== 'scene' && scope && !scope.includes(beatId)) {
      errors.push({
        code: 'UNKNOWN_ANCHOR',
        sceneId: instance.id,
        field: `events[${index}].at`,
        message: `Anchor "${event.at}" points at beat "${beatId}", which this scene does not cover.`,
        expected: [...scope, 'scene'],
      });
    }
  }
};

const collectSoftWarnings = (
  capability: SceneCapability,
  instance: SceneInstance,
  warnings: CompilerWarning[],
): void => {
  for (const [field, constraint] of Object.entries(capability.constraints)) {
    const value = (instance.props as Record<string, unknown>)[field];
    const size = Array.isArray(value)
      ? value.length
      : typeof value === 'string'
        ? value.length
        : null;
    if (size === null) continue;

    if (constraint.recommendedMax !== undefined && size > constraint.recommendedMax) {
      warnings.push({
        code: field === 'title' ? 'TITLE_DENSITY' : 'SOFT_LIMIT_EXCEEDED',
        severity: 'quality',
        sceneId: instance.id,
        field,
        message: `"${field}" has ${size} where ${constraint.recommendedMax} is the recommended maximum.`,
        ...(constraint.onExceed ? { suggestion: constraint.onExceed } : {}),
      });
    }

    if (constraint.recommendedMin !== undefined && size < constraint.recommendedMin) {
      warnings.push({
        code: 'SOFT_LIMIT_EXCEEDED',
        severity: size === 0 ? 'info' : 'quality',
        sceneId: instance.id,
        field,
        message:
          size === 0
            ? `"${field}" is empty; the scene will render its empty state.`
            : `"${field}" has ${size} where ${constraint.recommendedMin} is the recommended minimum.`,
        ...(size === 0 && constraint.onEmpty ? { suggestion: constraint.onEmpty } : {}),
      });
    }
  }
};

export const validateVideoPlan = (plan: VideoPlan): CompileReport => {
  const errors: CompilerError[] = [];
  const warnings: CompilerWarning[] = [];
  const knownBeats = plan.beats.map((b) => b.id);

  for (const section of plan.sections) {
    let previousProfile: string | undefined;

    for (const scene of section.scenes) {
      for (const beatId of scene.spansBeats ?? []) {
        if (!knownBeats.includes(beatId)) {
          errors.push({
            code: 'UNKNOWN_ANCHOR',
            sceneId: scene.id,
            sectionId: section.id,
            field: 'spansBeats',
            message: `Scene "${scene.id}" spans beat "${beatId}", which the plan does not define.`,
            expected: knownBeats,
          } as CompilerError);
        }
      }

      const report = validateScene(scene, { knownBeats: scene.spansBeats ?? knownBeats });
      errors.push(...report.errors.map((e) => ({ ...e, sectionId: section.id })));
      warnings.push(...report.warnings.map((w) => ({ ...w, sectionId: section.id })));

      if (
        previousProfile !== undefined &&
        scene.motionProfile !== undefined &&
        scene.motionProfile === previousProfile
      ) {
        warnings.push({
          code: 'MOTION_PROFILE_REPETITION',
          severity: 'quality',
          sceneId: scene.id,
          sectionId: section.id,
          field: 'motionProfile',
          message: `Consecutive scenes both use "${scene.motionProfile}".`,
          suggestion:
            'Contrast between a moving scene and a still one does more for rhythm than any effect. ' +
            'Pick a profile motivated by this beat’s intention.',
        });
      }
      previousProfile = scene.motionProfile;
    }
  }

  return { ok: errors.length === 0, errors, warnings };
};
