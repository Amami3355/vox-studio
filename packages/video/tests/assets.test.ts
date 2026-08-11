import { describe, expect, it } from 'vitest';
import { createAssetResolver, resolveSceneAssets } from '../src/assets/resolver';

const housingRequirement = {
  type: 'image' as const,
  subject: 'Dense apartment buildings in a European city at dusk',
  treatment: 'photo' as const,
  orientation: 'landscape' as const,
  identityKey: 'housing-city-context',
};

describe('Asset Resolver', () => {
  it('returns an immediate stable placeholder when the local library has no match', () => {
    const resolver = createAssetResolver();

    expect(resolver.resolve(housingRequirement)).toEqual({
      status: 'placeholder',
      uri: 'asset://placeholder/image-context',
      pendingRequirementId: expect.stringMatching(/^req_[a-f0-9]{8}$/),
    });
  });

  it('returns a ready reference when the semantic requirement matches the local library', () => {
    const resolver = createAssetResolver({
      localAssets: [
        {
          requirement: housingRequirement,
          ref: {
            status: 'ready',
            uri: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E',
          },
        },
      ],
      verifyLocalAsset: () => ({ ok: true }),
    });

    expect(
      resolver.resolve({
        ...housingRequirement,
        subject: '  DENSE APARTMENT BUILDINGS IN A EUROPEAN CITY AT DUSK  ',
      }),
    ).toEqual({
      status: 'ready',
      uri: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E',
    });
  });

  it('reuses the first resolution for requirements that share an identity key', () => {
    const ready = {
      status: 'ready' as const,
      uri: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E',
    };
    const resolver = createAssetResolver({
      localAssets: [{ requirement: housingRequirement, ref: ready }],
      verifyLocalAsset: () => ({ ok: true }),
    });

    expect(resolver.resolve(housingRequirement)).toEqual(ready);
    expect(
      resolver.resolve({
        ...housingRequirement,
        subject: 'The same housing guide viewed from another angle',
      }),
    ).toEqual(ready);
  });

  it('resolves a SceneInstance without replacing its semantic props', () => {
    const scene = {
      id: 'scene_context',
      component: 'image_context',
      spansBeats: ['b1'],
      props: {
        headline: 'The rent squeeze is reshaping city life',
        assetRequirement: housingRequirement,
      },
    };

    const assets = resolveSceneAssets(scene, createAssetResolver());

    expect(assets.scene_context?.assetRequirement).toMatchObject({ status: 'placeholder' });
    expect(scene.props.assetRequirement).toBe(housingRequirement);
  });

  it('preserves an explicit local failure for later compile reporting', () => {
    const failed = {
      status: 'failed' as const,
      uri: 'asset://placeholder/image-context',
      requirementId: 'req_corrupt_local',
      reason: 'Local asset could not be decoded.',
    };
    const resolver = createAssetResolver({
      localAssets: [{ requirement: housingRequirement, ref: failed }],
    });

    expect(resolver.resolve(housingRequirement)).toEqual(failed);
  });

  it('turns an unreadable ready entry into a failed reference', () => {
    const resolver = createAssetResolver({
      localAssets: [
        {
          requirement: housingRequirement,
          ref: { status: 'ready', uri: 'asset://library/corrupt-image' },
        },
      ],
      verifyLocalAsset: () => ({ ok: false, reason: 'Local asset could not be decoded.' }),
    });

    expect(resolver.resolve(housingRequirement)).toMatchObject({
      status: 'failed',
      uri: 'asset://library/corrupt-image',
      reason: 'Local asset could not be decoded.',
    });
  });
});
