import { describe, expect, it } from 'vitest';
import { repositoryAssetLibrary } from '../src/assets/library';
import { createAssetResolver } from '../src/assets/resolver';
import { getSceneSpec, searchScenes, validateScene } from '../src/catalog/tools';
import type { SceneInstance } from '../src/core/types';

/**
 * The capability-focused validation suite. Everything here asks the published surface —
 * the catalog entry and the generic validator — rather than any reducer field or layout
 * constant, so the contract survives a visual implementation changing underneath it.
 */

const requirement = {
  type: 'character',
  subject: 'Housing educator explaining rent chains',
  treatment: 'cutout',
  orientation: 'portrait',
};

const instanceWith = (overrides: {
  props?: Record<string, unknown>;
  events?: SceneInstance['events'];
  layout?: string;
}): SceneInstance => ({
  id: 'scene_explainer',
  component: 'character_explainer',
  layout: overrides.layout ?? 'sideBySide',
  spansBeats: ['b1', 'b2'],
  ...(overrides.events ? { events: overrides.events } : {}),
  props: {
    label: 'Housing educator',
    headline: 'Your rent has a chain of intermediaries',
    explanation: 'Every link in the chain takes its share before the month begins.',
    assetRequirement: requirement,
    ...overrides.props,
  },
});

describe('CharacterExplainerScene catalog contract', () => {
  it('publishes the one-layout character-family capability the Visual Planner can author', () => {
    const spec = getSceneSpec('character_explainer');

    expect(spec).toMatchObject({
      id: 'character_explainer',
      name: 'CharacterExplainerScene',
      family: 'character',
      requiresAssets: true,
      supportsEvents: true,
    });
    expect(spec.layouts.map((layout) => layout.id)).toEqual(['sideBySide']);
    expect(spec.supportedCompositions).toEqual(['full']);
  });

  it('publishes a closed action vocabulary of three payload-less verbs', () => {
    const spec = getSceneSpec('character_explainer');

    expect(spec.actions.map((action) => action.id)).toEqual([
      'revealCharacter',
      'revealCopy',
      'accentCharacter',
    ]);
    for (const action of spec.actions) {
      expect(action.payloadSchema).toBeNull();
      expect(action.deicticFields).toBeUndefined();
    }
  });

  it('ranks character_explainer first for a figure-led explanation', () => {
    expect(searchScenes('a recognisable character carries the explanation')[0]?.id).toBe(
      'character_explainer',
    );
  });

  it('redirects documentary, quotation and typographic intents away', () => {
    const avoid = getSceneSpec('character_explainer').avoidWhen.join(' ');

    expect(avoid).toContain('→ image_context');
    expect(avoid).toContain('→ quote');
    expect(avoid).toContain('→ typographic_statement');
  });

  it('redirects continuity to the canonical Section-level mechanism', () => {
    const guidance = getSceneSpec('character_explainer').avoidWhen.find((entry) =>
      entry.endsWith('→ persistent'),
    );

    expect(guidance).toContain('Persistent element declared on the Section');
  });
});

describe('CharacterExplainerScene asset requirement', () => {
  it('accepts a semantic character requirement with cutout and portrait', () => {
    expect(validateScene(instanceWith({})).errors).toEqual([]);
  });

  it('accepts an illustration in square orientation, with or without an identityKey', () => {
    const square = instanceWith({
      props: {
        assetRequirement: {
          type: 'character',
          subject: 'Recurring mascot for the series',
          treatment: 'illustration',
          orientation: 'square',
          identityKey: 'series-mascot',
        },
      },
    });
    const keyless = instanceWith({
      props: {
        assetRequirement: {
          type: 'character',
          subject: 'One-off passer-by figure',
          treatment: 'cutout',
          orientation: 'square',
        },
      },
    });

    expect(validateScene(square).errors).toEqual([]);
    expect(validateScene(keyless).errors).toEqual([]);
  });

  /**
   * The narrowing is schema, not prose: the manifest publishes the narrowed enums, and
   * the validator rejects the same values the shared asset contract would accept.
   */
  it('rejects a non-character type', () => {
    const report = validateScene(
      instanceWith({
        props: { assetRequirement: { ...requirement, type: 'image' } },
      }),
    );

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_PROPS', field: 'assetRequirement.type' }),
      ]),
    );
  });

  it('rejects unsupported treatments', () => {
    for (const treatment of ['photo', 'duotone']) {
      const report = validateScene(
        instanceWith({ props: { assetRequirement: { ...requirement, treatment } } }),
      );

      expect(report.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'INVALID_PROPS', field: 'assetRequirement.treatment' }),
        ]),
      );
    }
  });

  it('rejects a landscape orientation', () => {
    const report = validateScene(
      instanceWith({ props: { assetRequirement: { ...requirement, orientation: 'landscape' } } }),
    );

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_PROPS', field: 'assetRequirement.orientation' }),
      ]),
    );
  });

  it('rejects a raw URI in place of a semantic requirement', () => {
    const report = validateScene(
      instanceWith({ props: { assetRequirement: 'https://example.com/educator.png' } }),
    );

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_PROPS', field: 'assetRequirement' }),
      ]),
    );
  });

  it('rejects runtime asset fields hidden inside an authored requirement', () => {
    const report = validateScene(
      instanceWith({
        props: {
          assetRequirement: {
            ...requirement,
            uri: '/assets/characters/editorial-explainer-reference.png',
            status: 'ready',
          },
        },
      }),
    );

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_PROPS', field: 'assetRequirement' }),
      ]),
    );
  });
});

describe('CharacterExplainerScene generic validation', () => {
  it('rejects an unknown layout through the generic validator', () => {
    const report = validateScene(instanceWith({ layout: 'stacked' }));

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNKNOWN_LAYOUT',
          field: 'layout',
          expected: ['sideBySide'],
        }),
      ]),
    );
  });

  it('rejects an invented action rather than rendering a silent no-op', () => {
    const report = validateScene(instanceWith({ events: [{ at: 'b1.start', action: 'react' }] }));

    expect(report.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'UNKNOWN_ACTION' })]),
    );
  });

  it('rejects copy past the hard ceiling rather than degrading it', () => {
    const report = validateScene(instanceWith({ props: { headline: 'x'.repeat(121) } }));

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_PROPS', field: 'headline' }),
      ]),
    );
  });

  it('warns on dense copy while keeping the SceneInstance valid', () => {
    const report = validateScene(
      instanceWith({
        props: {
          headline:
            'Every repair proposed since 2015 has assumed a landlord and a lender who never both tightened at once',
        },
      }),
    );

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'TITLE_DENSITY', field: 'headline' }),
      ]),
    );
  });

  it('keeps empty label, headline and explanation valid together', () => {
    const report = validateScene(
      instanceWith({ props: { label: '', headline: '', explanation: '' } }),
    );

    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'headline' })]),
    );
  });
});

describe('CharacterExplainerScene written-order check', () => {
  /**
   * No Take, no beats with timings — the check judges the written order of the event
   * list, so it fails at validate, before anyone has recorded anything.
   */
  it('refuses an accent written before an explicitly declared character reveal', () => {
    const report = validateScene(
      instanceWith({
        events: [
          { at: 'b1.start', action: 'accentCharacter' },
          { at: 'b2.start', action: 'revealCharacter' },
        ],
      }),
    );

    expect(report.ok).toBe(false);
    const error = report.errors.find((e) => e.code === 'EVENT_BEFORE_ELEMENT_REVEALED');
    expect(error).toMatchObject({ sceneId: 'scene_explainer', field: 'events[0].at' });
    // The refusal names the repair, in both directions.
    expect(error?.message).toContain('"b2.start"');
    expect(error?.message).toContain('remove the explicit reveal');
  });

  it('accepts an accent written after the reveal', () => {
    const report = validateScene(
      instanceWith({
        events: [
          { at: 'b1.start', action: 'revealCharacter' },
          { at: 'b2.start', action: 'accentCharacter' },
        ],
      }),
    );

    expect(report.errors).toEqual([]);
  });

  it('accepts an accent with no explicit reveal at all', () => {
    const report = validateScene(
      instanceWith({ events: [{ at: 'b1.start', action: 'accentCharacter' }] }),
    );

    expect(report.errors).toEqual([]);
  });

  it('imposes no order between the two reveals, in either direction', () => {
    const copyFirst = validateScene(
      instanceWith({
        events: [
          { at: 'b1.start', action: 'revealCopy' },
          { at: 'b2.start', action: 'revealCharacter' },
        ],
      }),
    );
    const characterFirst = validateScene(
      instanceWith({
        events: [
          { at: 'b1.start', action: 'revealCharacter' },
          { at: 'b2.start', action: 'revealCopy' },
        ],
      }),
    );

    expect(copyFirst.errors).toEqual([]);
    expect(characterFirst.errors).toEqual([]);
  });

  it('accepts repeated accents, each restarting the gesture', () => {
    const report = validateScene(
      instanceWith({
        events: [
          { at: 'b1.start', action: 'revealCharacter' },
          { at: 'b1.end', action: 'accentCharacter' },
          { at: 'b2.start', action: 'accentCharacter' },
          { at: 'b2.end-short', action: 'accentCharacter' },
        ],
      }),
    );

    expect(report.errors).toEqual([]);
  });
});

describe('the committed evaluation asset', () => {
  const referenceRequirement = {
    type: 'character',
    subject: 'Original editorial educator with an open explanatory gesture',
    treatment: 'illustration',
    orientation: 'portrait',
    identityKey: 'character-explainer-reference',
  } as const;

  it('resolves through the repository library to verified committed media', () => {
    const resolver = createAssetResolver({ library: repositoryAssetLibrary });

    expect(resolver.resolve(referenceRequirement)).toEqual({
      status: 'ready',
      /** Public-relative, so the uri means the same thing to the compiler and the renderer. */
      uri: 'assets/characters/editorial-explainer-reference.png',
    });
  });

  it('fails verification for a public path the library has not committed', () => {
    expect(
      repositoryAssetLibrary.verify(
        { status: 'ready', uri: 'assets/characters/never-committed.png' },
        referenceRequirement,
      ),
    ).toMatchObject({ ok: false, reason: expect.stringContaining('not a file this library') });
  });
});
