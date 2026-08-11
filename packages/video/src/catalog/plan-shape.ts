/**
 * The structural gate on a video plan.
 *
 * Everything else in this package validates *meaning*: is this action in the capability's
 * vocabulary, does this anchor point at a beat the scene covers, do these beats partition
 * the section. All of it assumes the plan has the shape its TypeScript type promises —
 * and a plan arriving as JSON from an agent carries no such guarantee.
 *
 * Without this gate, three things go wrong quietly. A beat with `text: null` throws a
 * TypeError out of the middle of validation instead of returning the CompileReport §8.1
 * promises to feed back for repair. A beat with no `text` at all makes the mid-sentence
 * rule skip that scene in silence. And a plan whose beats are all named `b1` partitions
 * perfectly over a single beat while the voice-over has several.
 *
 * Structure and identity only. Whether a motion profile exists, a layout is known or an
 * action is in the vocabulary belongs to the capability that owns it — checking those
 * here too would give one field two sources of truth and break rule 1.
 */
import { z } from 'zod';
import type { CompilerError } from '../core/types';
import type { VideoPlan } from './validate';

/**
 * `scene` is the pseudo-beat `resolveAnchor` uses for a scene's own bounds, so a real
 * beat carrying that id would never be scope-checked by `validateEvents`.
 */
const RESERVED_BEAT_IDS = ['scene'] as const;

const identifier = z.string().min(1);

const beatShape = z.object({
  id: identifier.refine((v) => !(RESERVED_BEAT_IDS as readonly string[]).includes(v), {
    message: '"scene" is reserved: it is the pseudo-beat an anchor uses for its own bounds.',
  }),
  text: z.string().min(1),
});

const placementShape = z.object({
  at: z.string().min(1),
  slot: z.string().min(1),
});

const persistentShape = z.object({
  id: identifier,
  element: z.string().min(1),
  placements: z.array(placementShape),
});

const sceneShape = z.object({
  id: identifier,
  component: z.string().min(1),
  props: z.record(z.string(), z.unknown()),
  spansBeats: z.array(identifier),
});

const sectionShape = z.object({
  id: identifier,
  spansBeats: z.array(identifier),
  persistent: z.array(persistentShape).optional(),
  scenes: z.array(sceneShape),
});

/**
 * Emptiness is deliberately left alone here — of `sections`, of `scenes`, and of a
 * `spansBeats`. Each is already owned downstream, by the partition or by
 * `EMPTY_BEAT_SPAN`, which say which beats end up playing over nothing and why a scene
 * spanning none has no duration. "Too small: expected array to have >=1 items" is a
 * worse message, and a second source of truth for a property that already has one.
 *
 * The line this gate holds is shape: the field is present, it is an array, and its
 * entries are non-empty strings. What the array *means* belongs to the layer that knows.
 */
const planShape = z.object({
  beats: z.array(beatShape).min(1),
  sections: z.array(sectionShape),
});

/**
 * Compile-time tripwire against drift: the hand-written `VideoPlan` stays the precise
 * type (`motionProfile` is a `MotionProfileId`, not a string), and this asserts it still
 * satisfies everything the runtime gate demands. Tightening the schema without widening
 * the type — or the reverse — stops compiling here.
 */
type _PlanSatisfiesShape = VideoPlan extends z.infer<typeof planShape> ? true : never;
const _assertPlanSatisfiesShape: _PlanSatisfiesShape = true;
void _assertPlanSatisfiesShape;

export const checkPlanShape = (plan: VideoPlan): CompilerError[] => {
  const parsed = planShape.safeParse(plan);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      code: 'MALFORMED_PLAN' as const,
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
  }
  return checkIdentifiers(plan);
};

/**
 * Identity, which the schema cannot express because it is a property of the collection
 * rather than of any one member.
 *
 * Duplicate ids are not cosmetic here. Beats are keyed by id for their text and counted
 * by id for coverage, so two beats named `b1` collapse into one addressable unit while
 * the spoken script still has two. Scene ids are the handle the studio and every later
 * edit-by-prompt use to name one instance, so a repeated one makes "scene 4" ambiguous.
 */
const checkIdentifiers = (plan: VideoPlan): CompilerError[] => {
  const errors: CompilerError[] = [];

  for (const id of duplicates(plan.beats.map((b) => b.id))) {
    errors.push({
      code: 'DUPLICATE_ID',
      field: 'beats',
      message: `Beat id "${id}" is used more than once. Beats are addressed by id, so two beats sharing one collapse into a single unit of time while the voice-over still has two.`,
    });
  }

  for (const id of duplicates(plan.sections.map((s) => s.id))) {
    errors.push({
      code: 'DUPLICATE_ID',
      field: 'sections',
      message: `Section id "${id}" is used more than once.`,
    });
  }

  const scenes = plan.sections.flatMap((s) => s.scenes);
  for (const id of duplicates(scenes.map((s) => s.id))) {
    errors.push({
      code: 'DUPLICATE_ID',
      sceneId: id,
      field: 'scenes',
      message: `Scene id "${id}" is used more than once. A SceneInstance id must be unique across the whole project — it is how the studio and every later edit name one instance.`,
    });
  }

  for (const section of plan.sections) {
    for (const id of duplicates((section.persistent ?? []).map((e) => e.id))) {
      errors.push({
        code: 'DUPLICATE_ID',
        sectionId: section.id,
        field: 'persistent',
        message: `Persistent element id "${id}" is used more than once in section "${section.id}".`,
      });
    }
  }

  return errors;
};

const duplicates = (values: string[]): string[] => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
};
