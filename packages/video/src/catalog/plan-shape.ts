/**
 * The strict structural gate and public source schema for an agent-authored VideoPlan.
 *
 * This module owns shape and identity. Capability vocabulary, beat partitions, anchors and
 * other semantic checks remain in validate.ts, beside the behaviour they govern.
 */
import { z } from 'zod';
import { assetRequirementSchema } from '../core/assets';
import { type CompilerError, PERSISTENT_ELEMENT_TYPES, type Slot } from '../core/types';
import { type MotionProfileId, paceIds } from '../design/motion';

const RESERVED_BEAT_IDS = ['scene'] as const;
const identifier = z.string().min(1);

const beatSchema = z
  .object({
    id: identifier.refine((value) => !RESERVED_BEAT_IDS.includes(value as 'scene'), {
      message: '"scene" is reserved: it is the pseudo-beat an anchor uses for its own bounds.',
    }),
    text: z.string().min(1),
  })
  .strict();

const placementSchema = z
  .object({
    at: z.string().min(1),
    // Slot membership is semantic: validate.ts owns UNKNOWN_SLOT and its expected[] repair.
    slot: z.string().min(1) as z.ZodType<Slot>,
  })
  .strict();

const persistentElementSchema = z
  .object({
    id: identifier,
    element: z.enum(PERSISTENT_ELEMENT_TYPES),
    assetRequirement: assetRequirementSchema.optional(),
    placements: z.array(placementSchema),
  })
  .strict();

const semanticEventSchema = z
  .object({
    at: z.string().min(1),
    action: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const sceneInstanceSchema = z
  .object({
    id: identifier,
    component: z.string().min(1),
    props: z.record(z.string(), z.unknown()),
    layout: z.string().min(1).optional(),
    // Membership stays with validateMotionProfile so its existing repair report survives.
    motionProfile: (z.string().min(1) as z.ZodType<MotionProfileId>).optional(),
    events: z.array(semanticEventSchema).optional(),
    spansBeats: z.array(identifier),
    pace: z.enum(paceIds).optional(),
  })
  .strict();

const sectionSchema = z
  .object({
    id: identifier,
    spansBeats: z.array(identifier),
    persistent: z.array(persistentElementSchema).optional(),
    scenes: z.array(sceneInstanceSchema),
  })
  .strict();

/**
 * Emptiness is deliberately semantic except for the plan's beat list. The downstream
 * partition checks and EMPTY_BEAT_SPAN provide the more useful repair for empty sections,
 * scenes and spans.
 */
export const videoPlanSchema = z
  .object({
    beats: z.array(beatSchema).min(1),
    sections: z.array(sectionSchema),
  })
  .strict()
  .describe('Complete agent-authored video plan before recording or compilation.');

export type VideoPlan = z.infer<typeof videoPlanSchema>;
export type VideoPlanSection = VideoPlan['sections'][number];

export const checkPlanShape = (plan: unknown): CompilerError[] => {
  const parsed = videoPlanSchema.safeParse(plan);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      code: 'MALFORMED_PLAN' as const,
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
  }
  return checkIdentifiers(parsed.data);
};

/**
 * Duplicate ids are collection invariants JSON Schema cannot express. They stay in the
 * same structural gate and preserve the existing situated repair messages.
 */
const checkIdentifiers = (plan: VideoPlan): CompilerError[] => {
  const errors: CompilerError[] = [];

  for (const id of duplicates(plan.beats.map((beat) => beat.id))) {
    errors.push({
      code: 'DUPLICATE_ID',
      field: 'beats',
      message: `Beat id "${id}" is used more than once. Beats are addressed by id, so two beats sharing one collapse into a single unit of time while the voice-over still has two.`,
    });
  }

  for (const id of duplicates(plan.sections.map((section) => section.id))) {
    errors.push({
      code: 'DUPLICATE_ID',
      field: 'sections',
      message: `Section id "${id}" is used more than once.`,
    });
  }

  const scenes = plan.sections.flatMap((section) => section.scenes);
  for (const id of duplicates(scenes.map((scene) => scene.id))) {
    errors.push({
      code: 'DUPLICATE_ID',
      sceneId: id,
      field: 'scenes',
      message: `Scene id "${id}" is used more than once. A SceneInstance id must be unique across the whole project — it is how the studio and every later edit name one instance.`,
    });
  }

  for (const section of plan.sections) {
    for (const id of duplicates((section.persistent ?? []).map((element) => element.id))) {
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
