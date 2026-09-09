import { z } from 'zod';
import { CONTRACT_CATEGORIES, OPERATING_CONTRACT, PRODUCTION_CONTRACT } from './protocol';
import {
  artifactDescriptorSchema,
  commandDataSchemas,
  declineSchema,
  imageAcceptanceSchema,
  imageGenerationGrantSchema,
  imageGenerationRequestSchema,
  imageJobSchema,
  imageRejectionSchema,
  preflightReportSchema,
  productionRequestSchema,
  replacementGrantSchema,
  resultEnvelopeSchema,
} from './schemas';
import { productionLimitsSchema, studioAuthorizationSchema } from './studio-authorization';

type JsonObject = Record<string, unknown>;

const VISUAL_SELECTION_FIELDS = [
  'id',
  'name',
  'family',
  'summary',
  'useWhen',
  'avoidWhen',
  'supportedCompositions',
  'requiresAssets',
  'recommendedDurationFrames',
] as const;

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

const catalogProjectionMetadata = (catalog: JsonObject): JsonObject => {
  if (!Array.isArray(catalog.capabilities) || catalog.capabilities.length === 0) {
    throw new Error('catalog.capabilities must be a non-empty array.');
  }
  const capabilities = catalog.capabilities.map((value, index) =>
    assertObject(value, `catalog.capabilities[${index}]`),
  );
  for (const field of VISUAL_SELECTION_FIELDS) {
    if (capabilities.some((capability) => !Object.hasOwn(capability, field))) {
      throw new Error(`Every capability must publish the selection-tier field "${field}".`);
    }
  }

  const allFields = [...new Set(capabilities.flatMap((capability) => Object.keys(capability)))];
  const authoringFields = allFields.filter(
    (field) => !(VISUAL_SELECTION_FIELDS as readonly string[]).includes(field),
  );

  return {
    capabilityTiers: {
      selection: { fields: [...VISUAL_SELECTION_FIELDS] },
      authoring: { fields: authoringFields },
    },
    roleProjections: {
      visualStructurer: { tiers: ['selection'], capabilitySelection: 'all' },
      sceneAuthor: {
        tiers: ['selection', 'authoring'],
        capabilitySelection: 'selected',
      },
      planRepair: {
        tiers: ['selection', 'authoring'],
        capabilitySelection: 'implicated',
      },
    },
  };
};

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
  const {
    checks: _checksHaveTheirOwnCategory,
    palettes: _palettesAreAddressedToClients,
    ...catalogWithoutChecks
  } = catalog;
  const catalogMetadata = catalogProjectionMetadata(catalog);

  /**
   * The palettes are lifted the same way the checks are, and for a stronger reason: they are
   * raw colour. The catalog is addressed to authors, and an author that could read a hex value
   * could write one — so what a theme resolves its roles to is published to clients only, where
   * the deterministic image tool that has to compose against it lives.
   */
  const palettes = assertObject(catalog.palettes, 'catalog.palettes');
  for (const [theme, roles] of Object.entries(palettes)) {
    const resolved = assertObject(roles, `catalog.palettes.${theme}`);
    if (Object.keys(resolved).length === 0) {
      throw new Error(`catalog.palettes.${theme} resolves no colour role.`);
    }
    for (const [role, color] of Object.entries(resolved)) {
      if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
        throw new Error(`catalog.palettes.${theme}.${role} must be a #rrggbb colour.`);
      }
    }
  }

  const protocol = {
    ...PRODUCTION_CONTRACT,
    schemas: {
      productionLimits: schemaOf(productionLimitsSchema),
      studioAuthorization: schemaOf(studioAuthorizationSchema),
      request: schemaOf(productionRequestSchema),
      decline: schemaOf(declineSchema),
      replacementGrant: schemaOf(replacementGrantSchema),
      imageGenerationRequest: schemaOf(imageGenerationRequestSchema),
      imageGenerationGrant: schemaOf(imageGenerationGrantSchema),
      imageAcceptance: schemaOf(imageAcceptanceSchema),
      imageRejection: schemaOf(imageRejectionSchema),
      imageJob: schemaOf(imageJobSchema),
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
    catalog: { ...catalogWithoutChecks, ...catalogMetadata },
    checks,
    operating: OPERATING_CONTRACT as unknown as JsonObject,
    design: { palettes },
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
      categories: CONTRACT_CATEGORIES.map(({ id, summary, audience }) => ({
        id,
        summary,
        audience,
      })),
    },
    categories,
  };
};
