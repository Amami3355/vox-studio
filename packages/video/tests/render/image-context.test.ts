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
import { mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_ASSET_URI } from '../../src/assets/resolver';
import type { AssetRef, ResolvedSceneAssets } from '../../src/core/assets';
import { NO_SAFE_AREA } from '../../src/core/types';
import { imageOverlay } from '../../src/design/theme';
import { STRESS_CONTROL_ID } from '../../src/runtime/StressControl';
import { hashStill, renderHarness } from './harness';
import { decodePng, hashRegions, pixelAt } from './png';
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
  const bytes = await harness.still(
    `image-context--${exampleId}`,
    {
      capabilityId: 'image_context',
      exampleId,
      layout: null,
      motionProfile: null,
      ...(assets ? { assets } : {}),
    },
    SETTLED_FRAME,
  );
  if (!asset) {
    await mkdir('.scratch/stills/image-context', { recursive: true });
    await writeFile(`.scratch/stills/image-context/${exampleId}.png`, bytes);
  }
  return hashStill(bytes);
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
          // Reviewed 2026-09-09: full-frame media with a stable lower-left message,
          // no card or eyebrow. Empty uses a subject fallback on the dark media ground;
          // longCopy wraps fully at bottomRight (legacy splitLeft). At frame 120 the
          // driven example has hidden its copy and scrim, leaving the image alone.
          // The final scrim extends through the reading margin to avoid a hard edge seam.
          canonical: '2fd63467a493c8864ce4e63519a50120',
          empty: 'fafa63377b93a762a0f11e14f0b4ff05',
          longCopy: '3142a07418a160b0d5d4a7d5b00d2c70',
          driven: '65ed8f80831208f36134321a16b73b3d',
        },
      },
    );
  });
});

const whiteImage: AssetRef = {
  status: 'ready',
  uri: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><path fill="white" d="M0 0h1920v1080H0z"/></svg>')}`,
};
const props = {
  headline: 'Context',
  caption: 'A short caption.',
  assetRequirement: {
    type: 'image',
    subject: 'Bright photographic test surface',
    treatment: 'photo',
    orientation: 'landscape',
  },
};
const scene = {
  capabilityId: 'image_context',
  props,
  layout: 'bottomLeft',
  motionProfile: 'editorialStatic',
  safeArea: NO_SAFE_AREA,
  assets: { assetRequirement: whiteImage },
};
const luminance = (hex: string) => {
  const channels = [1, 3, 5]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
};

describe('immersive image context', () => {
  it.each(['bottomLeft', 'bottomRight', 'lowerThird'])(
    'keeps light text legible over a white image in %s',
    async (layout) => {
      for (const themeId of ['editorial-paper', 'editorial-cold']) {
        const bitmap = decodePng(
          await harness.still(
            STRESS_CONTROL_ID,
            { ...scene, layout, themeId, inspectBackground: true },
            120,
          ),
        );
        expect(pixelAt(bitmap, 2, 2)).toBe('#ffffff'); // image reaches the actual canvas edge
        // The anchored scrim must reach the edge even though its feather is density-scaled.
        // A short scrim left a bright vertical seam beside bottom-right copy.
        const edgeX = layout === 'bottomRight' ? 1918 : 2;
        const copyX = layout === 'bottomRight' ? 1700 : 110;
        expect(luminance(pixelAt(bitmap, edgeX, 950))).toBeLessThanOrEqual(
          luminance(pixelAt(bitmap, copyX, 950)),
        );
        const xs = layout === 'bottomRight' ? [930, 1300, 1700] : [110, 450, 850];
        for (const x of xs)
          for (const y of [850, 950]) {
            const background = pixelAt(bitmap, x, y);
            const contrast =
              (luminance(imageOverlay.secondaryInk) + 0.05) / (luminance(background) + 0.05);
            expect(contrast).toBeGreaterThanOrEqual(4.5);
          }
      }
    },
  );

  it('removes copy and its scrim, and restores it after a temporary spoken emphasis', async () => {
    const normal = await harness.still(STRESS_CONTROL_ID, scene, 120);
    const events = [
      { frame: 0, action: 'revealCopy' },
      { frame: 40, action: 'emphasize', payload: { text: 'One idea' } },
      { frame: 80, action: 'clearEmphasis' },
    ];
    expect(hashStill(await harness.still(STRESS_CONTROL_ID, { ...scene, events }, 120))).toBe(
      hashStill(normal),
    );
    const hidden = decodePng(
      await harness.still(
        STRESS_CONTROL_ID,
        { ...scene, events: [{ frame: 30, action: 'hideCopy' }] },
        120,
      ),
    );
    expect(pixelAt(hidden, 110, 950)).toBe('#ffffff');
    expect(pixelAt(hidden, 800, 850)).toBe('#ffffff');
    const emphasized = await harness.still(
      STRESS_CONTROL_ID,
      { ...scene, events: events.slice(0, 2) },
      120,
    );
    const onlyPhrase = await harness.still(
      STRESS_CONTROL_ID,
      { ...scene, props: { ...props, headline: 'One idea', caption: '' } },
      120,
    );
    expect(hashStill(emphasized)).toBe(hashStill(onlyPhrase));
  });

  it('keeps foreground geometry still while the image camera moves', async () => {
    const at = async (frame: number, inspectForeground = true) =>
      decodePng(
        await harness.still(
          STRESS_CONTROL_ID,
          {
            ...scene,
            assets: { assetRequirement: READY_ASSET },
            motionProfile: 'pushIn',
            inspectForeground,
          },
          frame,
        ),
      );
    const textArea = [{ x: 80, y: 750, width: 1050, height: 250 }];
    expect(hashRegions(await at(70), textArea)).toBe(hashRegions(await at(179), textArea));
    const imageArea = [{ x: 0, y: 0, width: 1920, height: 700 }];
    expect(hashRegions(await at(70, false), imageArea)).not.toBe(
      hashRegions(await at(179, false), imageArea),
    );
  });
});
