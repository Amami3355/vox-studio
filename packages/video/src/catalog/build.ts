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
import type { SceneCapability, SceneExample, SceneMeta, SoftConstraints } from '../core/types';
import { registry } from '../scenes/registry';

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

export type Catalog = {
  /** Bumped by hand when the shape of this file changes, not on every regeneration. */
  manifestVersion: 2;
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
  capabilities: CatalogEntry[];
};

const toJsonSchema = (schema: z.ZodType): JsonSchemaObject =>
  z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    // The agent authors input, so fields with defaults must read as optional.
    io: 'input',
    unrepresentable: 'any',
  }) as JsonSchemaObject;

export const buildCatalogEntry = (capability: SceneCapability): CatalogEntry => ({
  ...capability.meta,
  propsSchema: toJsonSchema(capability.schema),
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
});

export const buildCatalog = (): Catalog => ({
  manifestVersion: 2,
  time: ANCHOR_GRAMMAR,
  capabilities: registry.map(buildCatalogEntry),
});

export const serializeCatalog = (catalog: Catalog): string =>
  `${JSON.stringify(catalog, null, 2)}\n`;
