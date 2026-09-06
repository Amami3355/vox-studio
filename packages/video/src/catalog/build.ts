/**
 * Manifest generation.
 *
 * Generated at build time and never hand-edited. A hand-written manifest diverges from
 * the code within days, and the agent then produces invalid props for reasons nobody
 * can trace.
 *
 * Note there is no timestamp in the output: the file is committed, and a timestamp
 * would make every regeneration a spurious diff, which is exactly what stops people
 * reading the diff that matters.
 */
import { z } from 'zod';
import { ANCHOR_GRAMMAR } from '../core/anchor-grammar';
import { assetRequirementSchema } from '../core/assets';
import { COMPILER_CHECKS } from '../core/compiler-checks';
import type { SceneCapability, SceneExample, SceneMeta, SoftConstraints } from '../core/types';
import { motionProfileIds } from '../design/motion';
import { emphasisColor, emphasisRoles, themes } from '../design/theme';
import { registry } from '../scenes/registry';
import { videoPlanSchema } from './plan-shape';
import { STRUCTURAL_PLAN_EXAMPLES, type StructuralPlanExample } from './structural-examples';
import { validateVideoPlan } from './validate';

export type JsonSchemaObject = Record<string, unknown>;

export type CatalogAction = {
  id: string;
  description: string;
  payloadSchema: JsonSchemaObject | null;
  /**
   * Omitted rather than emitted empty when the action declares none, so the manifest says
   * "this action is not a pointing gesture" by silence — the same way it already omits a
   * `payloadSchema` for an action that takes no payload — instead of carrying an empty
   * array on every action in the catalog for the few that need one.
   */
  deicticFields?: string[];
};

export type CatalogLayout = {
  id: string;
  description: string;
  slots: string[];
};

export type CatalogEntry = SceneMeta & {
  propsSchema: JsonSchemaObject;
  softConstraints: SoftConstraints;
  layouts: CatalogLayout[];
  actions: CatalogAction[];
  examples: SceneExample[];
};

/**
 * The closed vocabulary an art-directing agent selects from.
 *
 * It sits beside `capabilities` for the same reason `time` does: it is a property of the
 * design system rather than of any one capability, and an agent that may only choose
 * published values has to be able to read what is published. Every list here is the
 * runtime form of a decision made elsewhere in the design system — a theme registry, the
 * motion profiles, the emphasis roles, the treatments an `AssetRequirement` accepts — so
 * this is a projection of those decisions and never a second place to make them.
 *
 * Raw colours, fonts, easing values and dimensions are deliberately absent. What an agent
 * gets is the name of an intent; what that name resolves to stays with the compiler.
 */
export type VisualVocabulary = {
  themes: string[];
  motionIntents: string[];
  colorRoles: string[];
  treatments: string[];
};

/**
 * What each published theme resolves its semantic colour roles to.
 *
 * Raw colour, and deliberately not part of what an author is taught: the contract projection
 * addresses it to clients only, so a deterministic tool composing an image prompt can reach it
 * while no authoring prompt carries a hex value an agent could then write into a plan.
 */
export type ThemePalettes = Record<string, Record<string, string>>;

export type Catalog = {
  /**
   * Bumped by hand when the shape of this file changes, not on every regeneration.
   *
   * 5 published `visualVocabulary` and `palettes`.
   */
  manifestVersion: 5;
  /**
   * Rule 3's vocabulary, which is not a property of any one capability.
   *
   * Every capability publishes the events it accepts, and every event is placed with an
   * anchor — so a manifest listing the actions but not the grammar publishes half of what
   * an event is. It sits beside `capabilities` rather than inside each of them because
   * repeating it per capability would be the fourth copy of a grammar that has already
   * drifted in three.
   */
  time: typeof ANCHOR_GRAMMAR;
  /** Every error or warning a code-blind author can receive from the compiler. */
  checks: typeof COMPILER_CHECKS;
  visualVocabulary: VisualVocabulary;
  palettes: ThemePalettes;
  capabilities: CatalogEntry[];
};

export type PlanContract = {
  contractVersion: 1;
  schema: JsonSchemaObject;
  examples: readonly StructuralPlanExample[];
};

const toJsonSchema = (schema: z.ZodType): JsonSchemaObject =>
  z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    // The agent authors input, so fields with defaults must read as optional.
    io: 'input',
    unrepresentable: 'any',
  }) as JsonSchemaObject;

const keysOf = (value: unknown): string[] =>
  value !== null && typeof value === 'object' ? Object.keys(value) : [];

const sameMembers = (actual: string[], expected: string[]): boolean =>
  actual.length === expected.length && actual.every((entry) => expected.includes(entry));

/**
 * Capacity metadata is compiler input. A misspelled prop/layout or a half-declaration used
 * to type-check and then disable the warning silently, which is worse than rejecting the
 * capability: the manifest still promised a repair that the compiler could no longer see.
 */
const assertCapacityMetadata = (
  capability: SceneCapability,
  propsSchema: JsonSchemaObject,
): void => {
  const { capacityByComposition, seriesField } = capability.meta;
  if ((capacityByComposition === undefined) !== (seriesField === undefined)) {
    throw new Error(
      `Capability "${capability.meta.id}" must declare capacityByComposition and seriesField together.`,
    );
  }
  if (capacityByComposition === undefined || seriesField === undefined) return;

  const properties = (propsSchema.properties ?? {}) as Record<string, JsonSchemaObject>;
  const seriesSchema = properties[seriesField];
  if (seriesSchema?.type !== 'array') {
    throw new Error(
      `Capability "${capability.meta.id}" seriesField "${seriesField}" must name an array prop in its schema.`,
    );
  }

  const itemSchema = (seriesSchema.items ?? {}) as JsonSchemaObject;
  const itemProperties = (itemSchema.properties ?? {}) as Record<string, JsonSchemaObject>;
  const required = Array.isArray(itemSchema.required) ? itemSchema.required : [];
  if (
    itemSchema.type !== 'object' ||
    itemProperties.label?.type !== 'string' ||
    !['number', 'integer'].includes(itemProperties.value?.type as string) ||
    !required.includes('label') ||
    !required.includes('value')
  ) {
    throw new Error(
      `Capability "${capability.meta.id}" seriesField "${seriesField}" must contain required { label: string, value: number } entries.`,
    );
  }

  const compositions = keysOf(capacityByComposition);
  if (!capability.meta.supportedCompositions.includes('full')) {
    throw new Error(
      `Capability "${capability.meta.id}" capacityByComposition requires "full" as its comparison baseline.`,
    );
  }
  if (!sameMembers(compositions, capability.meta.supportedCompositions)) {
    throw new Error(
      `Capability "${capability.meta.id}" capacityByComposition must cover exactly supportedCompositions; received ${compositions.join(', ')}.`,
    );
  }

  const layouts = Object.keys(capability.layouts);
  for (const composition of capability.meta.supportedCompositions) {
    const declared = capacityByComposition[composition] ?? {};
    const declaredLayouts = keysOf(declared);
    if (!sameMembers(declaredLayouts, layouts)) {
      const unknown = declaredLayouts.find((layout) => !layouts.includes(layout));
      throw new Error(
        `Capability "${capability.meta.id}" capacityByComposition.${composition} must cover exactly its layouts${unknown ? `; unknown layout "${unknown}"` : ''}.`,
      );
    }
    for (const [layout, capacity] of Object.entries(declared)) {
      if (!Number.isInteger(capacity) || capacity <= 0) {
        throw new Error(
          `Capability "${capability.meta.id}" capacityByComposition.${composition}.${layout} must be a positive integer.`,
        );
      }
    }
  }
};

export const buildCatalogEntry = (capability: SceneCapability): CatalogEntry => {
  const propsSchema = toJsonSchema(capability.schema);
  assertCapacityMetadata(capability, propsSchema);

  return {
    ...capability.meta,
    propsSchema,
    softConstraints: capability.constraints,
    layouts: Object.entries(capability.layouts).map(([id, layout]) => ({
      id,
      description: layout.description,
      slots: layout.slots,
    })),
    actions: Object.entries(capability.actions).map(([id, action]) => ({
      id,
      description: action.description,
      payloadSchema: action.payload ? toJsonSchema(action.payload) : null,
      ...(action.deicticFields ? { deicticFields: [...action.deicticFields] } : {}),
    })),
    examples: capability.examples,
  };
};

/**
 * Read out of the design system rather than listed here.
 *
 * `treatments` comes off the `AssetRequirement` schema because that is the enum an author's
 * requirement is actually held to: a vocabulary published wider than the schema accepts
 * would teach a choice the compiler then refuses.
 */
const buildVisualVocabulary = (): VisualVocabulary => {
  const treatment = assetRequirementSchema.shape.treatment.unwrap();
  return {
    themes: Object.keys(themes),
    motionIntents: [...motionProfileIds],
    colorRoles: [...emphasisRoles],
    treatments: [...treatment.options],
  };
};

/**
 * Resolved through `emphasisColor`, which is what a scene resolves a role through, so the
 * colour a generated image is composed against is the colour the compiler would have painted.
 */
const buildPalettes = (): ThemePalettes =>
  Object.fromEntries(
    Object.entries(themes).map(([id, theme]) => [
      id,
      Object.fromEntries(emphasisRoles.map((role) => [role, emphasisColor(theme, role)])),
    ]),
  );

export const buildCatalog = (): Catalog => ({
  manifestVersion: 5,
  time: ANCHOR_GRAMMAR,
  checks: COMPILER_CHECKS,
  visualVocabulary: buildVisualVocabulary(),
  palettes: buildPalettes(),
  capabilities: registry.map(buildCatalogEntry),
});

export const buildPlanContract = (): PlanContract => {
  for (const example of STRUCTURAL_PLAN_EXAMPLES) {
    const parsed = videoPlanSchema.safeParse(example.plan);
    if (!parsed.success) {
      throw new Error(`Structural plan example "${example.id}" fails videoPlanSchema.`);
    }

    const report = validateVideoPlan(parsed.data);
    if (!report.ok) {
      throw new Error(
        `Structural plan example "${example.id}" fails semantic validation: ${report.errors
          .map((error) => `${error.code}: ${error.message}`)
          .join('; ')}`,
      );
    }
  }

  return {
    contractVersion: 1,
    schema: z.toJSONSchema(videoPlanSchema, { target: 'draft-2020-12' }) as JsonSchemaObject,
    examples: STRUCTURAL_PLAN_EXAMPLES,
  };
};

export const serializeCatalog = (catalog: Catalog): string =>
  `${JSON.stringify(catalog, null, 2)}\n`;

export const serializePlanContract = (contract: PlanContract): string =>
  `${JSON.stringify(contract, null, 2)}\n`;
