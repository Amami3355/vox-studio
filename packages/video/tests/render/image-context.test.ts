/**
 * Runtime integration for `image_context`, at the public render boundary.
 *
 * Two different questions, deliberately kept apart. The first test asks whether the
 * three asset states *render* — the contract the increment actually promised — and
 * states it as a relation between hashes rather than as literals, so it keeps meaning
 * something on a machine whose font rendering differs. The second test is the key-frame
 * baseline: literal hashes, accepted after visual review, and the suite that is expected
 * to fail when the design changes on purpose.
 */
import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_ASSET_URI } from '../../src/assets/resolver';
import type { AssetRef, ResolvedSceneAssets } from '../../src/core/assets';
import { hashStill, renderHarness } from './harness';
import { expectRecordedStills } from './still-hashes';

const READY_ASSET: AssetRef = {
  status: 'ready',
  uri: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221600%22%20height=%22900%22%3E%3Crect%20width=%221600%22%20height=%22900%22%20fill=%22%23141922%22/%3E%3Cpath%20d=%22M0%20740L300%20400L520%20620L820%20220L1120%20560L1400%20320L1600%20510V900H0Z%22%20fill=%22%23FF5A1F%22/%3E%3C/svg%3E',
};

const PLACEHOLDER_ASSET: AssetRef = {
  status: 'placeholder',
  uri: PLACEHOLDER_ASSET_URI,
  pendingRequirementId: 'req_pending_render',
};

const FAILED_ASSET: AssetRef = {
  status: 'failed',
  uri: PLACEHOLDER_ASSET_URI,
  requirementId: 'req_failed_render',
  reason: 'Deliberate runtime integration fixture.',
};

const CANONICAL_EXAMPLE_ID = 'example-housing-context';
/** Everything has landed and settled here; every example runs past it. */
const SETTLED_FRAME = 120;

const harness = renderHarness();

const renderHash = async (exampleId: string, asset?: AssetRef): Promise<string> => {
  const assets: ResolvedSceneAssets | undefined = asset ? { assetRequirement: asset } : undefined;
  return hashStill(
    await harness.still(
      `image-context--${exampleId}`,
      {
        capabilityId: 'image_context',
        exampleId,
        layout: null,
        motionProfile: null,
        ...(assets ? { assets } : {}),
      },
      SETTLED_FRAME,
    ),
  );
};

describe('ImageContextScene runtime', () => {
  it('renders every asset state, and degrades placeholder and failed identically', async () => {
    const [ready, placeholder, failed] = await Promise.all([
      renderHash(CANONICAL_EXAMPLE_ID, READY_ASSET),
      renderHash(CANONICAL_EXAMPLE_ID, PLACEHOLDER_ASSET),
      renderHash(CANONICAL_EXAMPLE_ID, FAILED_ASSET),
    ]);

    expect(placeholder).toBe(failed);
    expect(ready).not.toBe(placeholder);
  });

  it('resolves the canonical example through the repository library without an override', async () => {
    const [resolved, placeholder] = await Promise.all([
      renderHash(CANONICAL_EXAMPLE_ID),
      renderHash(CANONICAL_EXAMPLE_ID, PLACEHOLDER_ASSET),
    ]);

    expect(resolved).not.toBe(placeholder);
  });

  it('keeps the accepted key frames stable', async () => {
    const [canonical, empty, longCopy, driven] = await Promise.all([
      renderHash(CANONICAL_EXAMPLE_ID),
      renderHash('example-empty-context'),
      renderHash('example-long-context'),
      renderHash('example-driven-context'),
    ]);

    expectRecordedStills(
      { canonical, empty, longCopy, driven },
      {
        win32: {
          // Re-accepted 2026-08-14 on Windows when `editorial-paper` became the default theme.
          // All three moved, and this time *that* is the corroboration: a palette reaches every
          // pixel of every frame, so an unchanged hash would have meant the theme had not
          // arrived. The previous acceptance is the mirror of it — a camera-allowance change
          // left `empty` alone precisely because `editorialStatic` has no camera. A baseline
          // that moves for the whole reason and not part of it is the thing being checked here.
          //
          // Reviewed before accepting, per this file's header: the ready asset, the placeholder
          // plate, the eyebrow, the title and the caption were each read on paper at frame 120.
          canonical: 'deeb7727f43aac8958e2e4fb6e163369',
          empty: '5c23bdadca1da65d59564540b73bd4b9',
          // `longCopy` is unchanged by the 2026-08-20 header work, and that it is unchanged is
          // the point. `useTitleStep` gained a height budget that day, and an intermediate
          // version of it counted lines instead — under which this headline dropped a step to
          // reach four and this hash moved. The rule it shipped as is a *share* of the scene:
          // five lines here are 326px of a 1008px box, under the half a header may take, so
          // the fit leaves the frame exactly where a human accepted it in the first place. A
          // baseline that had moved would have meant the share was doing something the sentence
          // it comes from never asked for.
          longCopy: 'e26133541a06a7ec683d2915f506b5c8',
          // Accepted 2026-08-15, the first key frame for the only example carrying events.
          // It shares `identityKey` with `canonical` and still hashes differently, which is the
          // corroboration here: same media, same layout, same theme, and the only variable left
          // is the plan holding the copy back. An equal hash would have meant the events were
          // not reaching the frame at all. Reviewed on stills before accepting: at frame 120 the
          // plate carries the resolved photograph and the copy column is deliberately empty.
          driven: '58a8bc4c5e1883d54d48844b2488700d',
        },
      },
    );
  });
});
