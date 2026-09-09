import { mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { AssetRef } from '../../src/core/assets';
import { NO_SAFE_AREA } from '../../src/core/types';
import { imageOverlay } from '../../src/design/theme';
import { STRESS_CONTROL_ID } from '../../src/runtime/StressControl';
import { hashStill, renderHarness } from './harness';
import { decodePng, hashRegions, pixelAt } from './png';

const harness = renderHarness();
const artwork = (width: number, height: number, content: string): AssetRef => ({
  status: 'ready',
  uri: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${content}</svg>`)}`,
});
const white = artwork(1920, 1080, '<path fill="white" d="M0 0h1920v1080H0z"/>');
// Deliberately asymmetric measurement artwork, not an illustrative catalog asset.
const square = artwork(
  1080,
  1080,
  '<path fill="#527a63" d="M0 0h1080v1080H0z"/><path fill="#ebbf6b" d="M0 0h1080v60H0z"/><path fill="#719fc3" d="M0 1020h1080v60H0z"/><circle cx="340" cy="470" r="70" fill="#ebbf6b"/>',
);
const props = {
  headline: 'A closer look',
  caption: 'Conceptual illustration',
  assetRequirement: {
    type: 'image',
    subject: 'A prepared illustration',
    treatment: 'illustration',
    orientation: 'landscape',
  },
};
const scene = {
  capabilityId: 'image_detail',
  props,
  layout: 'plate',
  motionProfile: 'editorialStatic',
  safeArea: NO_SAFE_AREA,
  assets: { assetRequirement: white },
};
// The last frame also runs StressControl's DOM clipping and display-height probes.
const still = (overrides: Record<string, unknown> = {}, frame = 149) =>
  harness.still(STRESS_CONTROL_ID, { ...scene, ...overrides }, frame);
const luminance = (hex: string) => {
  const c = [1, 3, 5]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return (c[0] ?? 0) * 0.2126 + (c[1] ?? 0) * 0.7152 + (c[2] ?? 0) * 0.0722;
};

describe('full-frame image detail', () => {
  it.each(['editorial-paper', 'editorial-cold'])(
    'protects copy contrast over white in %s',
    async (themeId) => {
      const bitmap = decodePng(await still({ themeId, inspectBackground: true }));
      expect(pixelAt(bitmap, 2, 2)).toBe('#ffffff');
      expect(pixelAt(bitmap, 1918, 2)).toBe('#ffffff');
      for (const x of [110, 500, 1000]) {
        for (const y of [890, 960]) {
          const contrast =
            (luminance(imageOverlay.secondaryInk) + 0.05) /
            (luminance(pixelAt(bitmap, x, y)) + 0.05);
          expect(contrast).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it('replaces title and caption with one explanation and clears the scrim completely', async () => {
    const events = [{ frame: 0, action: 'annotate', payload: { text: 'One explanation' } }];
    const replaced = await still({ events });
    expect(hashStill(replaced)).toBe(
      hashStill(await still({ props: { ...props, headline: 'One explanation', caption: '' } })),
    );
    const clear = await still({ events: [...events, { frame: 40, action: 'clearAnnotation' }] });
    expect(hashStill(clear)).toBe(
      hashStill(await still({ props: { ...props, headline: '', caption: '' } })),
    );
    const bitmap = decodePng(clear);
    for (const [x, y] of [
      [2, 2],
      [2, 1078],
      [110, 960],
      [1918, 1078],
    ])
      expect(pixelAt(bitmap, x as number, y as number)).toBe('#ffffff');
  });

  it.each(['contain', 'cover'])(
    'keeps text fixed during focus and restores the base view in %s',
    async (imageFit) => {
      const base = {
        props: { ...props, imageFit },
        assets: { assetRequirement: square },
        motionProfile: 'cinematic',
      };
      const events = [
        { frame: 75, action: 'focus', payload: { region: 'bottom' } },
        { frame: 125, action: 'focus', payload: { region: 'whole' } },
      ];
      const whole = await still(base, 60);
      const focused = await still({ ...base, events }, 110);
      expect(hashStill(focused)).not.toBe(hashStill(whole));
      expect(hashStill(await still({ ...base, events }, 149))).toBe(hashStill(whole));
      const textArea = [{ x: 80, y: 800, width: 1500, height: 220 }];
      const foreground = async (frame: number) =>
        decodePng(await still({ ...base, events, inspectForeground: true }, frame));
      expect(hashRegions(await foreground(60), textArea)).toBe(
        hashRegions(await foreground(110), textArea),
      );
    },
  );

  it('preserves square image edges under contain and only crops with an explicit cover', async () => {
    const base = {
      props: { ...props, headline: '', caption: '' },
      assets: { assetRequirement: square },
      motionProfile: 'pushIn',
    };
    const contained = decodePng(await still(base));
    expect(pixelAt(contained, 2, 540)).toBe(imageOverlay.ground.toLowerCase());
    expect(pixelAt(contained, 960, 2)).toBe('#ebbf6b');
    expect(pixelAt(contained, 960, 1078)).toBe('#719fc3');
    const covered = decodePng(
      await still({ ...base, props: { ...base.props, imageFit: 'cover' } }),
    );
    expect(pixelAt(covered, 2, 540)).toBe('#527a63');
    expect(pixelAt(covered, 960, 2)).toBe('#527a63');
  });

  it('renders the annotation ceiling, including an unbreakable word, with the real DOM clipping probe', async () => {
    await mkdir('.scratch/stills/image-detail-tests', { recursive: true });
    for (const [name, text] of [
      ['annotation-max', 'An explanation of the visible detail. '.repeat(4).slice(0, 120)],
      ['annotation-unbroken', 'W'.repeat(120)],
    ]) {
      const bytes = await still({ events: [{ frame: 0, action: 'annotate', payload: { text } }] });
      await writeFile(`.scratch/stills/image-detail-tests/${name}.png`, bytes);
      await still({
        events: [{ frame: 0, action: 'annotate', payload: { text } }],
        inspectForeground: true,
      });
    }
  });

  it('renders pending and failed sources with the same readable subject fallback', async () => {
    const empty = { ...props, headline: '', caption: '' };
    const missing = await still({
      props: empty,
      assets: {
        assetRequirement: { status: 'placeholder', uri: 'unused', pendingRequirementId: 'test' },
      },
    });
    const failed = await still({
      props: empty,
      assets: {
        assetRequirement: {
          status: 'failed',
          uri: 'unused',
          requirementId: 'test',
          reason: 'fixture',
        },
      },
    });
    expect(hashStill(missing)).toBe(hashStill(failed));
    expect(hashStill(missing)).not.toBe(hashStill(await still({ props: empty })));
  });
});
