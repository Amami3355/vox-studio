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
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import {
  type HeadlessBrowser,
  openBrowser,
  renderStill,
  selectComposition,
} from '@remotion/renderer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLACEHOLDER_ASSET_URI } from '../../src/assets/resolver';
import type { AssetRef, ResolvedSceneAssets } from '../../src/core/assets';

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
let bundleDirectory = '';
let serveUrl = '';
let browser: HeadlessBrowser | undefined;

beforeAll(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), 'vox-image-context-'));
  serveUrl = await bundle({
    entryPoint: fileURLToPath(new URL('../../src/remotion-entry.ts', import.meta.url)),
    outDir: bundleDirectory,
  });
  browser = await openBrowser('chrome', { logLevel: 'error' });
}, 180_000);

afterAll(async () => {
  if (browser) await browser.close({ silent: true });
  if (bundleDirectory) await rm(bundleDirectory, { recursive: true, force: true });
});

const renderHash = async (exampleId: string, asset?: AssetRef): Promise<string> => {
  const assets: ResolvedSceneAssets | undefined = asset ? { assetRequirement: asset } : undefined;
  const inputProps = {
    capabilityId: 'image_context',
    exampleId,
    layout: null,
    motionProfile: null,
    ...(assets ? { assets } : {}),
  };
  const composition = await selectComposition({
    serveUrl,
    id: `image-context--${exampleId}`,
    inputProps,
    puppeteerInstance: browser,
    logLevel: 'error',
  });
  const rendered = await renderStill({
    serveUrl,
    composition,
    inputProps,
    puppeteerInstance: browser,
    frame: 120,
    output: null,
    imageFormat: 'png',
    logLevel: 'error',
  });

  if (!rendered.buffer) throw new Error('Remotion returned no still buffer.');
  return createHash('md5').update(rendered.buffer).digest('hex');
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
    const [canonical, empty, longCopy] = await Promise.all([
      renderHash(CANONICAL_EXAMPLE_ID),
      renderHash('example-empty-context'),
      renderHash('example-long-context'),
    ]);

    expect({ canonical, empty, longCopy }).toEqual({
      // Re-accepted when SlotFrame stopped letting a scene decline the camera allowance.
      // `empty` is unchanged, and that is the corroboration: it renders `editorialStatic`,
      // which has no camera, so there was no allowance for it to have been missing.
      canonical: '0aad7bf2baef39a0d235b1c34cd4108c',
      empty: '9a1370a788be0fdb8c6abdc37bbfff2c',
      longCopy: '34d4762b05fbc5e340b6ce317f14edc2',
    });
  });
});
