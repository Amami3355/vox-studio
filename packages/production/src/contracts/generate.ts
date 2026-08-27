import { z } from 'zod';
import { CONTRACT_CATEGORIES, PRODUCTION_CONTRACT } from './protocol';
import {
  artifactDescriptorSchema,
  commandDataSchemas,
  declineSchema,
  preflightReportSchema,
  productionRequestSchema,
  replacementGrantSchema,
  resultEnvelopeSchema,
} from './schemas';

type JsonObject = Record<string, unknown>;

export type GlossaryEntry = {
  term: string;
  definition: string;
  avoid: string | null;
};

const publicText = (value: string): string =>
  value.replace(
    /`[^`]*(?:packages[\\/]|(?:core|src|docs)[\\/]|node_modules|\.tsx?\b|\.mts\b)[^`]*`/g,
    'the canonical implementation source',
  );

const parseGlossary = (markdown: string): GlossaryEntry[] => {
  const entries: GlossaryEntry[] = [];
  const seen = new Set<string>();

  for (const paragraph of markdown.split(/\r?\n\r?\n/)) {
    const match = paragraph.match(/^\*\*(.+?)\*\*\s+—\s+([\s\S]+)$/);
    if (!match) continue;
    const term = match[1]?.trim() ?? '';
    const body = (match[2] ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (term.length === 0 || body.length === 0)
      throw new Error('Malformed CONTEXT.md glossary entry.');

    const normalized = term.toLocaleLowerCase('en-US');
    if (seen.has(normalized)) throw new Error(`Duplicate CONTEXT.md glossary term: ${term}`);
    seen.add(normalized);

    const marker = body.indexOf(' Avoid: ');
    entries.push({
      term,
      definition: publicText(marker === -1 ? body : body.slice(0, marker).trim()),
      avoid: marker === -1 ? null : publicText(body.slice(marker + ' Avoid: '.length).trim()),
    });
  }

  if (entries.length === 0) throw new Error('CONTEXT.md contains no parseable glossary entries.');
  return entries;
};

const assertObject = (value: unknown, name: string): JsonObject => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} projection must be a JSON object.`);
  }
  return value as JsonObject;
};

const schemaOf = (schema: z.ZodType): JsonObject =>
  z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' }) as JsonObject;

export type GeneratedCategory = {
  category: (typeof CONTRACT_CATEGORIES)[number]['id'];
  contractVersion: number;
  contract: JsonObject;
};

export const buildContractProjections = (inputs: {
  contextMarkdown: string;
  planContract: unknown;
  catalog: unknown;
}): { index: JsonObject; categories: Record<string, GeneratedCategory> } => {
  const plan = assertObject(inputs.planContract, 'plan');
  const catalog = assertObject(inputs.catalog, 'catalog');
  const checks = assertObject(catalog.checks, 'checks');

  /**
   * The catalog is published without the checks, because the category beside it is what
   * publishes them.
   *
   * The source keeps them where they are authored — inside the manifest, beside the capabilities
   * whose refusals they explain — and the lift happens here, at projection time, so nothing about
   * the video package's catalog moves. What a consumer reads is the decision: each document in
   * one place, so reading the whole contract does not mean reading the checks twice.
   */
  const { checks: _publishedBesideIt, ...catalogWithoutChecks } = catalog;

  const protocol = {
    ...PRODUCTION_CONTRACT,
    schemas: {
      request: schemaOf(productionRequestSchema),
      decline: schemaOf(declineSchema),
      replacementGrant: schemaOf(replacementGrantSchema),
      artifactDescriptor: schemaOf(artifactDescriptorSchema),
      preflightReport: schemaOf(preflightReportSchema),
      resultEnvelope: schemaOf(resultEnvelopeSchema),
      commandData: Object.fromEntries(
        Object.entries(commandDataSchemas).map(([id, schema]) => [id, schemaOf(schema)]),
      ),
    },
  } as JsonObject;

  const rawContracts: Record<string, JsonObject> = {
    language: { entries: parseGlossary(inputs.contextMarkdown) },
    plan,
    catalog: catalogWithoutChecks,
    checks,
    protocol,
  };

  const categories = Object.fromEntries(
    CONTRACT_CATEGORIES.map(({ id, contractVersion }) => [
      id,
      { category: id, contractVersion, contract: rawContracts[id] as JsonObject },
    ]),
  );

  return {
    index: {
      contractVersion: 1,
      categories: CONTRACT_CATEGORIES.map(({ id, summary }) => ({ id, summary })),
    },
    categories,
  };
};
