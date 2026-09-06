import { describe, expect, it } from 'vitest';
import { repositoryAssetLibrary } from '../src/assets/library';
import {
  type LocalAssetLibrary,
  PLACEHOLDER_ASSET_URI,
  assetRequirementId,
  createAssetResolver,
  resolveSceneAssets,
} from '../src/assets/resolver';

const housingRequirement = {
  type: 'image' as const,
  subject: 'Dense apartment buildings in a European city at dusk',
  treatment: 'photo' as const,
  orientation: 'landscape' as const,
  identityKey: 'housing-city-context',
};

const keylessRequirement = {
  type: 'image' as const,
  subject: 'Empty office block at night',
  treatment: 'photo' as const,
  orientation: 'landscape' as const,
};

const READY_URI = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E';

const libraryOf = (
  entries: LocalAssetLibrary['entries'],
  verify: LocalAssetLibrary['verify'] = () => ({ ok: true }),
): LocalAssetLibrary => ({ entries, verify });

describe('Asset Resolver', () => {
  it('returns an immediate stable placeholder when there is no library at all', () => {
    const resolver = createAssetResolver();

    expect(resolver.resolve(housingRequirement)).toEqual({
      status: 'placeholder',
      uri: PLACEHOLDER_ASSET_URI,
      pendingRequirementId: expect.stringMatching(/^req_[a-f0-9]{8}$/),
    });
  });

  it('returns a ready reference when a keyless requirement matches the library semantically', () => {
    const resolver = createAssetResolver({
      library: libraryOf([
        { requirement: keylessRequirement, ref: { status: 'ready', uri: READY_URI } },
      ]),
    });

    expect(
      resolver.resolve({ ...keylessRequirement, subject: '  EMPTY OFFICE BLOCK AT NIGHT  ' }),
    ).toEqual({ status: 'ready', uri: READY_URI });
  });

  it('reuses one resolution for every requirement sharing an identity key', () => {
    const ready = { status: 'ready' as const, uri: READY_URI };
    const resolver = createAssetResolver({
      library: libraryOf([{ requirement: housingRequirement, ref: ready }]),
    });

    expect(resolver.resolve(housingRequirement)).toEqual(ready);
    expect(
      resolver.resolve({
        ...housingRequirement,
        subject: 'The same city viewed from another angle',
      }),
    ).toEqual(ready);
  });

  it('prefers an accepted project asset over repository media for the same identity', () => {
    const projectUri = 'data:image/png;base64,cHJvamVjdA==';
    const resolver = createAssetResolver({
      projectLibrary: libraryOf([
        {
          requirement: housingRequirement,
          ref: { status: 'ready', uri: projectUri },
        },
      ]),
      library: repositoryAssetLibrary,
    });

    expect(resolver.resolve(housingRequirement)).toEqual({ status: 'ready', uri: projectUri });
  });

  it('publishes the requirement id used by placeholder findings and generation work', () => {
    const resolver = createAssetResolver();
    const resolved = resolver.resolve(housingRequirement);

    expect(resolved).toMatchObject({
      pendingRequirementId: assetRequirementId(housingRequirement),
    });
    expect(assetRequirementId({ ...housingRequirement, subject: 'different wording' })).toBe(
      assetRequirementId(housingRequirement),
    );
  });

  /**
   * The regression this file exists for. Resolving a miss first used to pin a placeholder
   * under the identity key, so a later requirement sharing that key was answered with the
   * placeholder instead of its library hit — the same two inputs producing two different
   * outputs depending on the order they arrived in.
   */
  it('resolves an identity to the same reference whichever requirement arrives first', () => {
    const ready = { status: 'ready' as const, uri: READY_URI };
    const missFirst = createAssetResolver({
      library: libraryOf([{ requirement: housingRequirement, ref: ready }]),
    });
    const hitFirst = createAssetResolver({
      library: libraryOf([{ requirement: housingRequirement, ref: ready }]),
    });
    const otherWording = { ...housingRequirement, subject: 'A city skyline after sunset' };

    missFirst.resolve(otherWording);
    hitFirst.resolve(housingRequirement);

    expect(missFirst.resolve(housingRequirement)).toEqual(hitFirst.resolve(otherWording));
    expect(missFirst.resolve(housingRequirement)).toEqual(ready);
  });

  it('gives every requirement sharing an identity the same pending id while it is missing', () => {
    const resolver = createAssetResolver({ library: libraryOf([]) });

    const first = resolver.resolve(housingRequirement);
    const second = createAssetResolver({ library: libraryOf([]) }).resolve({
      ...housingRequirement,
      subject: 'Wholly different wording for the same identity',
    });

    expect(first).toEqual(second);
  });

  it('preserves an explicit local failure for later compile reporting', () => {
    const failed = {
      status: 'failed' as const,
      uri: PLACEHOLDER_ASSET_URI,
      requirementId: 'req_corrupt_local',
      reason: 'Local asset could not be decoded.',
    };
    const resolver = createAssetResolver({
      library: libraryOf([{ requirement: housingRequirement, ref: failed }]),
    });

    expect(resolver.resolve(housingRequirement)).toEqual(failed);
  });

  it('turns an unreadable ready entry into a failed reference', () => {
    const resolver = createAssetResolver({
      library: libraryOf(
        [
          {
            requirement: housingRequirement,
            ref: { status: 'ready', uri: 'asset://library/corrupt-image' },
          },
        ],
        () => ({ ok: false, reason: 'Local asset could not be decoded.' }),
      ),
    });

    expect(resolver.resolve(housingRequirement)).toMatchObject({
      status: 'failed',
      uri: 'asset://library/corrupt-image',
      reason: 'Local asset could not be decoded.',
    });
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

    expect(assets.assetRequirement).toMatchObject({ status: 'placeholder' });
    expect(scene.props.assetRequirement).toBe(housingRequirement);
  });

  it('leaves a scene with no asset requirement empty rather than inventing one', () => {
    const scene = {
      id: 'scene_chart',
      component: 'bar_chart',
      spansBeats: ['b1'],
      props: { title: 'Rent as a share of income', data: [] },
    };

    expect(resolveSceneAssets(scene, createAssetResolver())).toEqual({});
  });
});

describe('repository asset library', () => {
  it('answers the canonical housing identity with verified committed media', () => {
    const resolver = createAssetResolver({ library: repositoryAssetLibrary });

    expect(resolver.resolve(housingRequirement)).toMatchObject({
      status: 'ready',
      uri: expect.stringMatching(/^data:image\/svg\+xml,/),
    });
  });

  it('rejects an entry whose media is not a decodable inline image', () => {
    expect(
      repositoryAssetLibrary.verify(
        { status: 'ready', uri: 'https://example.com/photo.jpg' },
        housingRequirement,
      ),
    ).toEqual({ ok: false, reason: expect.stringContaining('not an inline image') });
  });
});
