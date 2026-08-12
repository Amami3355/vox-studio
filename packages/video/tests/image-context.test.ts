import { describe, expect, it } from 'vitest';
import { getSceneSpec, searchScenes, validateScene } from '../src/catalog/tools';

describe('ImageContextScene catalog contract', () => {
  it('publishes the one-layout capability the Visual Planner can author', () => {
    const spec = getSceneSpec('image_context');

    expect(spec).toMatchObject({
      id: 'image_context',
      name: 'ImageContextScene',
      family: 'context',
      requiresAssets: true,
      supportsEvents: false,
    });
    expect(spec.layouts.map((layout) => layout.id)).toEqual(['splitLeft']);
    expect(spec.actions).toEqual([]);
  });

  it('ranks image context first for a documentary establishing shot', () => {
    expect(searchScenes('documentary context with one strong image')[0]?.id).toBe('image_context');
  });

  it('rejects a raw URI in place of a semantic AssetRequirement', () => {
    const report = validateScene({
      id: 'scene_context',
      component: 'image_context',
      layout: 'splitLeft',
      spansBeats: ['b1'],
      props: {
        headline: 'The rent squeeze is reshaping city life',
        assetRequirement: 'https://example.com/housing.jpg',
      },
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_PROPS',
          field: 'assetRequirement',
        }),
      ]),
    );
  });

  it('rejects runtime asset fields hidden inside an authored AssetRequirement', () => {
    const report = validateScene({
      id: 'scene_context',
      component: 'image_context',
      layout: 'splitLeft',
      spansBeats: ['b1'],
      props: {
        headline: 'The rent squeeze is reshaping city life',
        assetRequirement: {
          type: 'image',
          subject: 'Apartment buildings at dusk',
          treatment: 'photo',
          orientation: 'landscape',
          uri: 'https://example.com/housing.jpg',
          status: 'ready',
        },
      },
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_PROPS',
          field: 'assetRequirement',
        }),
      ]),
    );
  });

  it('rejects a blank asset subject, which would render a label-less plate', () => {
    const report = validateScene({
      id: 'scene_context',
      component: 'image_context',
      layout: 'splitLeft',
      spansBeats: ['b1'],
      props: {
        headline: 'The rent squeeze is reshaping city life',
        assetRequirement: {
          type: 'image',
          subject: '',
          treatment: 'photo',
          orientation: 'landscape',
        },
      },
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_PROPS', field: 'assetRequirement.subject' }),
      ]),
    );
  });

  it('rejects a headline that is not a string', () => {
    const report = validateScene({
      id: 'scene_context',
      component: 'image_context',
      layout: 'splitLeft',
      spansBeats: ['b1'],
      props: {
        headline: 42,
        assetRequirement: {
          type: 'image',
          subject: 'Apartment buildings at dusk',
          treatment: 'photo',
          orientation: 'landscape',
        },
      },
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_PROPS', field: 'headline' }),
      ]),
    );
  });

  it('rejects copy past the hard ceiling rather than degrading it', () => {
    const report = validateScene({
      id: 'scene_context',
      component: 'image_context',
      layout: 'splitLeft',
      spansBeats: ['b1'],
      props: {
        headline: 'x'.repeat(121),
        assetRequirement: {
          type: 'image',
          subject: 'Apartment buildings at dusk',
          treatment: 'photo',
          orientation: 'landscape',
        },
      },
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_PROPS', field: 'headline' }),
      ]),
    );
  });

  it('rejects a layout the capability does not publish', () => {
    const report = validateScene({
      id: 'scene_context',
      component: 'image_context',
      layout: 'fullBleed',
      spansBeats: ['b1'],
      props: {
        headline: 'The rent squeeze is reshaping city life',
        assetRequirement: {
          type: 'image',
          subject: 'Apartment buildings at dusk',
          treatment: 'photo',
          orientation: 'landscape',
        },
      },
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNKNOWN_LAYOUT',
          field: 'layout',
          expected: ['splitLeft'],
        }),
      ]),
    );
  });

  it('warns on dense copy while keeping the SceneInstance valid', () => {
    const report = validateScene({
      id: 'scene_context',
      component: 'image_context',
      layout: 'splitLeft',
      spansBeats: ['b1'],
      props: {
        headline:
          'For first-time buyers, the distance between wages and housing costs keeps widening',
        assetRequirement: {
          type: 'image',
          subject: 'Young renter looking through an apartment window',
          treatment: 'photo',
          orientation: 'landscape',
        },
      },
    });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'TITLE_DENSITY',
          field: 'headline',
        }),
      ]),
    );
  });
});
