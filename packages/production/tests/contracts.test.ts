import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContractProjections } from '../src/contracts/generate';
import catalog from '../src/contracts/generated/catalog.json';
import checks from '../src/contracts/generated/checks.json';
import design from '../src/contracts/generated/design.json';
import index from '../src/contracts/generated/index.json';
import language from '../src/contracts/generated/language.json';
import operating from '../src/contracts/generated/operating.json';
import plan from '../src/contracts/generated/plan.json';
import protocol from '../src/contracts/generated/protocol.json';
import { handleContractIndex, handleContractShow } from '../src/contracts/handlers';
import {
  commandDataSchemas,
  productionRequestSchema,
  resultEnvelopeSchema,
} from '../src/contracts/schemas';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

const sourceCatalog = (): Record<string, unknown> =>
  JSON.parse(
    readFileSync(resolve(repositoryRoot, 'packages/video/src/catalog/catalog.json'), 'utf8'),
  );

const fresh = () =>
  buildContractProjections({
    contextMarkdown: readFileSync(resolve(repositoryRoot, 'CONTEXT.md'), 'utf8'),
    planContract: JSON.parse(
      readFileSync(
        resolve(repositoryRoot, 'packages/video/src/catalog/plan-contract.json'),
        'utf8',
      ),
    ),
    catalog: sourceCatalog(),
  });

describe('production contract projections', () => {
  it('generates all seven versioned categories and the compact index', () => {
    const projections = fresh();
    const committed = { language, plan, catalog, checks, operating, design, protocol };

    expect(Object.keys(projections.categories)).toEqual(Object.keys(committed));
    expect(projections.index).toEqual(index);
    for (const [category, projection] of Object.entries(projections.categories)) {
      expect(projection).toEqual(committed[category as keyof typeof committed]);
    }
  });

  it('publishes the same seven categories, in the same order, under the same ids', () => {
    expect(index.categories.map(({ id }) => id)).toEqual([
      'language',
      'plan',
      'catalog',
      'checks',
      'operating',
      'design',
      'protocol',
    ]);
  });

  /**
   * Ticket 25. The index says who each category is published *to*, so a consumer assembling a
   * prompt reads what it was addressed rather than deciding for itself what it needs.
   *
   * Asserted as the whole partition rather than category by category: the failure this guards
   * is a category added without an audience, or added to the author's set without the argument
   * that it is something an author can act on, and either would slip past a per-category check
   * that only knew about today's six.
   */
  it('addresses every category to an audience, and the author only to what it can act on', () => {
    const addressed = (who: string): string[] =>
      index.categories.filter(({ audience }) => audience.includes(who)).map(({ id }) => id);

    for (const category of index.categories) expect(category.audience.length).toBeGreaterThan(0);
    expect(addressed('author')).toEqual(['language', 'plan', 'catalog', 'checks', 'operating']);
    expect(addressed('client')).toEqual(['catalog', 'checks', 'operating', 'design', 'protocol']);
  });

  /**
   * ADR-0016 is the argument. An author holds payloads and tools and nothing that locates
   * anything, so it cannot issue a command, read an exit code, resume a Run, observe a transport
   * or write inside a boundary — and every one of those was a fifth of its prompt.
   *
   * The split is asserted as a partition of the document that was there before, so a key cannot
   * be dropped on the way through or land in both halves.
   */
  it('splits the operating rules the author acts on out of the protocol it cannot operate', () => {
    expect(Object.keys(operating.contract)).toEqual(['preflight', 'recording', 'repair']);
    expect(Object.keys(protocol.contract)).toEqual([
      'protocolVersion',
      'commands',
      'lifecycle',
      'transport',
      'exitCodes',
      'writeBoundary',
      'resume',
      'schemas',
    ]);
    expect(
      Object.keys(operating.contract).filter((key) => Object.hasOwn(protocol.contract, key)),
    ).toEqual([]);
  });

  /**
   * The property that would have caught the catalog publishing the checks category's document
   * verbatim beside it: a category may not carry what another category exists to publish.
   *
   * Containment rather than equality, because that is the shape the duplication took — the
   * repeated document was a section of a larger one, so comparing whole projections would have
   * gone on passing. A consumer that reads the whole contract pays for every repeat.
   */
  it('never carries one category document inside another', () => {
    const documents = Object.entries(fresh().categories).map(
      ([id, { contract }]) => [id, JSON.stringify(contract)] as const,
    );

    for (const [id, document] of documents) {
      for (const [otherId, other] of documents) {
        if (id === otherId) continue;
        expect(
          document.includes(other),
          `the ${id} projection carries the ${otherId} projection's published document`,
        ).toBe(false);
      }
    }
  });

  it('lifts the checks and the palettes out of the catalog and publishes the rest of it', () => {
    const source = sourceCatalog();

    // Two unrelated 4s sit near each other here and mean different things. This one is the
    // *manifest* version — what the catalog describes. The `catalog` category's own
    // `contractVersion` in `protocol.ts` is separately at 4 after ticket 28, and versions how the
    // category is *published*. They moved to the same digit by coincidence and nothing keeps them
    // in step; a reader who assumed one tracked the other would be wrong in both directions.
    expect(catalog.contract.manifestVersion).toBe(5);
    expect(checks.contract).toEqual(source.checks);
    expect(design.contract).toEqual({ palettes: source.palettes });
    expect(Object.hasOwn(catalog.contract, 'checks')).toBe(false);
    // The palettes are raw colour and the catalog is addressed to authors, so the one thing
    // asserted about them here is that an author's projection does not carry them.
    expect(Object.hasOwn(catalog.contract, 'palettes')).toBe(false);
    // Subtraction that went exactly far enough: the catalog is the source less the two lifted
    // documents, every capability, action, anchor form and semantic time rule still published.
    const {
      capabilityTiers: _tiers,
      roleProjections: _roles,
      ...canonicalCatalog
    } = catalog.contract;
    expect({
      ...canonicalCatalog,
      checks: source.checks,
      palettes: source.palettes,
    }).toEqual(source);
  });

  it('publishes byte-identical capability tiers and the role allowed to consume each tier', () => {
    const source = sourceCatalog();
    const capabilities = source.capabilities as Record<string, unknown>[];
    const tiers = catalog.contract.capabilityTiers;

    expect(tiers).toEqual({
      selection: {
        fields: [
          'id',
          'name',
          'family',
          'summary',
          'useWhen',
          'avoidWhen',
          'supportedCompositions',
          'requiresAssets',
          'recommendedDurationFrames',
        ],
      },
      authoring: {
        fields: [
          'supportsEvents',
          'occupiesRegions',
          'capacityByComposition',
          'seriesField',
          'minDurationFrames',
          'propsSchema',
          'softConstraints',
          'layouts',
          'actions',
          'examples',
        ],
      },
    });
    expect(catalog.contract.roleProjections).toEqual({
      visualStructurer: { tiers: ['selection'], capabilitySelection: 'all' },
      sceneAuthor: { tiers: ['selection', 'authoring'], capabilitySelection: 'selected' },
      planRepair: { tiers: ['selection', 'authoring'], capabilitySelection: 'implicated' },
    });

    const fields = [...tiers.selection.fields, ...tiers.authoring.fields];
    expect(new Set(fields).size).toBe(fields.length);
    expect(new Set(fields)).toEqual(
      new Set(capabilities.flatMap((capability) => Object.keys(capability))),
    );
    for (const capability of capabilities) {
      expect(
        Object.fromEntries(
          fields
            .filter((field) => Object.hasOwn(capability, field))
            .map((field) => [field, capability[field]]),
        ),
      ).toEqual(capability);
    }
  });

  it('parses CONTEXT.md into unique non-empty glossary entries', () => {
    const entries = language.contract.entries;
    const normalized = entries.map((entry) => entry.term.toLocaleLowerCase('en-US'));

    expect(entries.length).toBeGreaterThan(20);
    expect(new Set(normalized).size).toBe(entries.length);
    expect(entries.some((entry) => entry.term === 'Take')).toBe(true);
    for (const entry of entries) expect(entry.definition.length).toBeGreaterThan(0);
  });

  it('keeps repository and implementation filenames out of every public projection', () => {
    const serialized = JSON.stringify(fresh());
    expect(serialized).not.toMatch(
      /(?:packages[\\/]|node_modules|sourceMappingURL|sourcesContent|\.tsx?\b|\.mts\b)/,
    );
  });

  it('keeps credentials and unknown fields out of request.json', () => {
    const request = {
      protocolVersion: 1,
      brief: { id: 'brief', text: 'A concise editorial intent.' },
      production: {
        voice: {
          provider: 'elevenlabs',
          voiceId: 'JBFqnCBsd6RMkjVDRZzb',
          modelId: 'eleven_v3',
          seed: 7,
        },
        maxNewTakes: 2,
      },
    };

    expect(productionRequestSchema.safeParse(request).success).toBe(true);
    expect(
      productionRequestSchema.safeParse({
        ...request,
        production: { ...request.production, apiKey: 'forbidden' },
      }).success,
    ).toBe(false);
  });

  it('serves pure index/show envelopes with their fixed command data', () => {
    const indexEnvelope = handleContractIndex();
    const checksEnvelope = handleContractShow('checks');

    expect(resultEnvelopeSchema.safeParse(indexEnvelope).success).toBe(true);
    expect(resultEnvelopeSchema.safeParse(checksEnvelope).success).toBe(true);
    expect(commandDataSchemas['contract.index'].safeParse(indexEnvelope.data).success).toBe(true);
    expect(commandDataSchemas['contract.show'].safeParse(checksEnvelope.data).success).toBe(true);
    expect(indexEnvelope.run).toBeNull();
    expect(indexEnvelope.artifacts).toEqual([]);
    expect(checksEnvelope.data).toEqual(checks);
  });
});
