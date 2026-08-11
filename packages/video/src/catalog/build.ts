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
import type { SceneCapability, SceneExample, SceneMeta, SoftConstraints } from '../core/types';
import { registry } from '../scenes/registry';

export type JsonSchemaObject = Record<string, unknown>;

export type CatalogAction = {
  id: string;
  description: string;
  payloadSchema: JsonSchemaObject | null;
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
  manifestVersion: 1;
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
  })),
  examples: capability.examples,
});

export const buildCatalog = (): Catalog => ({
  manifestVersion: 1,
  capabilities: registry.map(buildCatalogEntry),
});

export const serializeCatalog = (catalog: Catalog): string =>
  `${JSON.stringify(catalog, null, 2)}\n`;
