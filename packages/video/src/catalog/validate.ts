/**
 * Validation.
 *
 * Hard constraint → loud failure before render. Soft constraint → silent degradation
 * plus a warning. The two regimes are distinct and never overlap: nothing in this file
 * turns a warning into an error or the reverse.
 */
import {
  ALL_SLOTS,
  type Beat,
  type CompileReport,
  type CompilerError,
  type CompilerWarning,
  type PersistentElement,
  type SceneCapability,
  type SceneInstance,
} from '../core/types';
import { motionProfileIds } from '../design/motion';
import { capabilityIds, findCapability } from '../scenes/registry';
import { checkPlanShape } from './plan-shape';

export type VideoPlanSection = {
  id: string;
  /**
   * The contiguous run of beats this section covers. Required, because totality has
   * nothing to compare the union of its scenes' beats against without it.
   */
  spansBeats: string[];
  persistent?: PersistentElement[];
  scenes: SceneInstance[];
};

export type VideoPlan = {
  beats: Beat[];
  sections: VideoPlanSection[];
};

const ANCHOR_RE = /^([A-Za-z0-9_-]+)\.(start|mid|end)(?:[+-](short|long))?$/;

export const validateScene = (instance: SceneInstance): CompileReport => {
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

  validateSpan(instance, errors);
  validateProps(capability, instance, errors);
  validateLayout(capability, instance, errors);
  validateMotionProfile(instance, errors);
  validateEvents(capability, instance, errors);
  collectSoftWarnings(capability, instance, warnings);

  if (capability.checks) {
    const extra = capability.checks(instance);
    errors.push(...extra.errors);
    warnings.push(...extra.warnings);
  }

  return { ok: errors.length === 0, errors, warnings };
};

/**
 * A scene's duration is the sum of the beats it spans, so an empty span is a scene of
 * no duration. TypeScript makes it unrepresentable; a JSON plan from an agent does not.
 *
 * `validateScene` keeps its own guards rather than leaning on `checkPlanShape`, because
 * it is a tool in its own right: an agent calls it on a single instance it is drafting,
 * long before there is a plan to gate.
 */
const validateSpan = (instance: SceneInstance, errors: CompilerError[]): void => {
  if (instance.spansBeats?.length) return;
  errors.push({
    code: 'EMPTY_BEAT_SPAN',
    sceneId: instance.id,
    field: 'spansBeats',
    message: `Scene "${instance.id}" spans no beat, so it has no duration. Give it the beats it plays over, or drop the scene.`,
  });
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
    const scope = instance.spansBeats ?? [];
    if (beatId !== 'scene' && !scope.includes(beatId)) {
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
        code: constraint.onExceedCode ?? 'SOFT_LIMIT_EXCEEDED',
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

/** One claimant on a run of beats — a scene inside a section, or a section inside a plan. */
type Claimant = { id: string; spansBeats: string[] };

/**
 * Contiguity, exclusivity and totality over one ordered domain of beats.
 *
 * Checked twice with the same function: scenes against their section's beats, and
 * sections against the plan's. Checking only the first is not enough, and the hole is
 * easy to miss — a plan with beats [b1, b2] and a single section covering b1 passes
 * every within-section check while b2 still plays over nothing.
 *
 * Totality is the property that earns its keep. It makes "duration = sum of spanned
 * beats" a total function, and it makes the orphan beat — voice over a black screen —
 * impossible to express rather than merely unlikely.
 */
const checkPartition = (
  claimants: Claimant[],
  domain: string[],
  subject: 'Scene' | 'Section',
  sectionId: string | undefined,
): CompilerError[] => {
  const errors: CompilerError[] = [];
  /**
   * `sectionId` is present when this partition is the scenes of a section and absent
   * when it is the plan's sections — that presence is how a consumer tells which of the
   * two partitions broke, so a section-level error names its section in the message
   * only, never in the field.
   */
  const at = sectionId === undefined ? {} : { sectionId };
  const named = (claimant: Claimant) => (subject === 'Scene' ? { sceneId: claimant.id } : {});

  /**
   * Owners are keyed by position, not by id. Keying by id would dedupe two *different*
   * claimants that happen to share one — hiding the very conflict this map exists to
   * find — while position still dedupes the case it was introduced for, a single
   * claimant naming the same beat twice.
   */
  const claimedBy = new Map<string, number[]>();
  /** First index of the previous claimant, so the run of claimants must also advance. */
  let previousStart: number | undefined;

  for (const [position, claimant] of claimants.entries()) {
    const indices: number[] = [];

    for (const beatId of claimant.spansBeats) {
      const index = domain.indexOf(beatId);
      if (index === -1) {
        errors.push({
          code: 'UNKNOWN_ANCHOR',
          ...named(claimant),
          ...at,
          field: 'spansBeats',
          message:
            `${subject} "${claimant.id}" spans beat "${beatId}", which ` +
            `${sectionId === undefined ? 'the plan does not define' : `section "${sectionId}" does not cover`}.`,
          expected: domain,
        });
        continue;
      }
      indices.push(index);
      const owners = claimedBy.get(beatId) ?? [];
      if (!owners.includes(position)) claimedBy.set(beatId, [...owners, position]);
    }

    const contiguous = indices.every((v, i) => i === 0 || v === (indices[i - 1] as number) + 1);
    if (!contiguous) {
      errors.push({
        code: 'BEAT_NOT_CONTIGUOUS',
        ...named(claimant),
        ...at,
        field: 'spansBeats',
        message: `${subject} "${claimant.id}" spans ${format(claimant.spansBeats)}, which is not a contiguous run in plan order.`,
        expected: domain,
      });
    }

    /**
     * Within-claimant contiguity is not enough: [b2] then [b1] is two contiguous runs
     * that still partition the domain perfectly, while the pictures play against the
     * wrong words — the spoken script is the plan's beats in order, and scenes are
     * consumed in array order. Overlap is left to BEAT_DOUBLE_BOOKED, so this fires
     * only when the sequence actually goes backwards.
     */
    const start = indices[0];
    if (start !== undefined) {
      if (previousStart !== undefined && start < previousStart) {
        errors.push({
          code: 'BEAT_NOT_CONTIGUOUS',
          ...named(claimant),
          ...at,
          field: 'spansBeats',
          message: `${subject} "${claimant.id}" starts on beat "${domain[start]}", which comes before the ${subject.toLowerCase()} preceding it. ${subject}s must appear in plan order.`,
          expected: domain,
        });
      }
      previousStart = start;
    }
  }

  for (const [beatId, owners] of claimedBy) {
    if (owners.length < 2) continue;
    const names = owners.map((position) => (claimants[position] as Claimant).id);
    errors.push({
      code: 'BEAT_DOUBLE_BOOKED',
      ...at,
      field: 'spansBeats',
      message: `Beat "${beatId}" is claimed by ${format(names)}. A beat belongs to exactly one ${subject.toLowerCase()}.`,
    });
  }

  for (const beatId of domain) {
    if (claimedBy.has(beatId)) continue;
    errors.push({
      code: 'BEAT_UNCOVERED',
      ...at,
      message: `Beat "${beatId}" is covered by no ${subject.toLowerCase()}, so its voice-over plays over nothing.`,
    });
  }

  return errors;
};

/**
 * Two beats inside one scene may split a sentence harmlessly — there is no cut. What
 * may not happen is a scene *boundary* landing mid-sentence, so the rule is narrower
 * than "every beat is a whole sentence" and can only be checked where scene boundaries
 * are known.
 */
const SENTENCE_END = /[.!?…][)\]"'”’»]*$/;

const checkSentenceBoundaries = (
  section: VideoPlanSection,
  textOf: Map<string, string>,
): CompilerError[] => {
  const errors: CompilerError[] = [];

  for (const scene of section.scenes) {
    const lastBeat = scene.spansBeats.at(-1);
    if (lastBeat === undefined) continue;
    const text = textOf.get(lastBeat);
    if (text === undefined) continue;
    if (SENTENCE_END.test(text.trimEnd())) continue;

    errors.push({
      code: 'SCENE_CUTS_MID_SENTENCE',
      sceneId: scene.id,
      sectionId: section.id,
      field: 'spansBeats',
      message:
        `Scene "${scene.id}" ends on beat "${lastBeat}", whose text does not end a sentence ` +
        `("…${tail(text)}"). The cut would land mid-sentence.`,
    });
  }

  return errors;
};

export const validateVideoPlan = (plan: VideoPlan): CompileReport => {
  /**
   * Structure before meaning, and no further if the structure is wrong. Every check
   * below reads fields the type promises but JSON does not deliver, so running them
   * over a malformed plan trades a report for a crash — and §8.1 needs the report.
   */
  const malformed = checkPlanShape(plan);
  if (malformed.length > 0) return { ok: false, errors: malformed, warnings: [] };

  const errors: CompilerError[] = [];
  const warnings: CompilerWarning[] = [];
  const planBeats = plan.beats.map((b) => b.id);
  const textOf = new Map(plan.beats.map((b) => [b.id, b.text]));

  errors.push(...checkPartition(plan.sections, planBeats, 'Section', undefined));

  for (const section of plan.sections) {
    /**
     * Intersected with the plan's beats, not taken verbatim. A beat the section claims
     * but the plan never defines is already reported once above; letting it stand as
     * the domain here would launder it — the scene claiming it would validate, an
     * anchor onto it would validate, and the sentence rule would skip that scene in
     * silence for want of a text.
     */
    const domain = section.spansBeats.filter((id) => planBeats.includes(id));

    errors.push(...checkPartition(section.scenes, domain, 'Scene', section.id));
    errors.push(...checkSentenceBoundaries(section, textOf));
    errors.push(...checkPlacements(section, domain));

    let previousProfile: string | undefined;

    for (const scene of section.scenes) {
      const report = validateScene(scene);
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

/**
 * Placements are to persistent elements what events are to scenes, so they are held to
 * the same two rules: a real anchor, and a slot that exists.
 */
const checkPlacements = (section: VideoPlanSection, scope: string[]): CompilerError[] => {
  const errors: CompilerError[] = [];

  for (const element of section.persistent ?? []) {
    // Guarded like every other required field reached from a plan: TypeScript makes an
    // absent list unrepresentable, a JSON plan from an agent does not, and a TypeError
    // here would replace the whole CompileReport with a crash.
    for (const [index, placement] of element.placements.entries()) {
      const field = `persistent[${element.id}].placements[${index}]`;

      if (!(ALL_SLOTS as string[]).includes(placement.slot)) {
        errors.push({
          code: 'UNKNOWN_SLOT',
          sectionId: section.id,
          field: `${field}.slot`,
          message: `Unknown slot "${placement.slot}".`,
          expected: ALL_SLOTS,
        });
      }

      const match = ANCHOR_RE.exec(placement.at);
      if (!match) {
        errors.push({
          code: 'UNKNOWN_ANCHOR',
          sectionId: section.id,
          field: `${field}.at`,
          message: `"${placement.at}" is not a valid anchor. Expected <beatId>.start|mid|end with an optional +short/-short/+long/-long offset.`,
        });
        continue;
      }

      const beatId = match[1] as string;
      if (!scope.includes(beatId)) {
        errors.push({
          code: 'UNKNOWN_ANCHOR',
          sectionId: section.id,
          field: `${field}.at`,
          message: `Placement "${placement.at}" points at beat "${beatId}", which section "${section.id}" does not cover.`,
          expected: scope,
        });
      }
    }
  }

  return errors;
};

const format = (items: string[]): string => items.map((i) => `"${i}"`).join(', ') || '(nothing)';

const tail = (text: string): string => text.trimEnd().slice(-24);
