import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContractProjections } from '../src/contracts/generate';
import catalog from '../src/contracts/generated/catalog.json';
import checks from '../src/contracts/generated/checks.json';
import index from '../src/contracts/generated/index.json';
import language from '../src/contracts/generated/language.json';
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
  it('generates all five versioned categories and the compact index', () => {
    const projections = fresh();
    const committed = { language, plan, catalog, checks, protocol };

    expect(Object.keys(projections.categories)).toEqual(Object.keys(committed));
    expect(projections.index).toEqual(index);
    for (const [category, projection] of Object.entries(projections.categories)) {
      expect(projection).toEqual(committed[category as keyof typeof committed]);
    }
  });

  it('publishes the same five categories, in the same order, under the same ids', () => {
    expect(index.categories.map(({ id }) => id)).toEqual([
      'language',
      'plan',
      'catalog',
      'checks',
      'protocol',
    ]);
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

  it('publishes the checks as an exact view of catalog v4, and the catalog without them', () => {
    const source = sourceCatalog();

    expect(catalog.contract.manifestVersion).toBe(4);
    expect(checks.contract).toEqual(source.checks);
    expect(Object.hasOwn(catalog.contract, 'checks')).toBe(false);
    // Subtraction that went exactly far enough: the catalog is the source less the checks,
    // every capability, action, anchor form and semantic time rule still published.
    expect({ ...catalog.contract, checks: source.checks }).toEqual(source);
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
