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
import type { AssetRef, ResolvedAssets } from '../src/core/assets';

const READY_ASSET: AssetRef = {
  status: 'ready',
  uri: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221600%22%20height=%22900%22%3E%3Crect%20width=%221600%22%20height=%22900%22%20fill=%22%23141922%22/%3E%3Cpath%20d=%22M0%20740L300%20400L520%20620L820%20220L1120%20560L1400%20320L1600%20510V900H0Z%22%20fill=%22%23FF5A1F%22/%3E%3C/svg%3E',
};

const FAILED_ASSET: AssetRef = {
  status: 'failed',
  uri: 'asset://placeholder/image-context',
  requirementId: 'req_failed_render',
  reason: 'Deliberate runtime integration fixture.',
};

const CANONICAL_SCENE_ID = 'example-housing-context';
let bundleDirectory = '';
let serveUrl = '';
let browser: HeadlessBrowser | undefined;

beforeAll(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), 'vox-image-context-'));
  serveUrl = await bundle({
    entryPoint: fileURLToPath(new URL('../src/remotion-entry.ts', import.meta.url)),
    outDir: bundleDirectory,
  });
  browser = await openBrowser('chrome', { logLevel: 'error' });
}, 120_000);

afterAll(async () => {
  if (browser) await browser.close({ silent: true });
  if (bundleDirectory) await rm(bundleDirectory, { recursive: true, force: true });
});

const renderHash = async (exampleId: string, asset?: AssetRef): Promise<string> => {
  const resolvedAssets: ResolvedAssets | undefined = asset
    ? { [exampleId]: { assetRequirement: asset } }
    : undefined;
  const inputProps = {
    capabilityId: 'image_context',
    exampleId,
    layout: null,
    motionProfile: null,
    ...(resolvedAssets ? { resolvedAssets } : {}),
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
  it('renders ready, placeholder, and failed assets through the generic renderer', async () => {
    const [ready, placeholder, failed] = await Promise.all([
      renderHash(CANONICAL_SCENE_ID, READY_ASSET),
      renderHash(CANONICAL_SCENE_ID),
      renderHash(CANONICAL_SCENE_ID, FAILED_ASSET),
    ]);

    expect({ ready, placeholder, failed }).toEqual({
      ready: '4860aa51051887f73b33ead85ea51797',
      placeholder: '5f1fa28fbc5659ed9b5d661665c888b6',
      failed: '5f1fa28fbc5659ed9b5d661665c888b6',
    });
  }, 120_000);

  it('keeps the accepted empty and long-copy key frames stable', async () => {
    const [empty, longCopy] = await Promise.all([
      renderHash('example-empty-context'),
      renderHash('example-long-context'),
    ]);

    expect({ empty, longCopy }).toEqual({
      empty: '9a1370a788be0fdb8c6abdc37bbfff2c',
      longCopy: '98db40f314eeebdde965bada71a2d9e3',
    });
  }, 120_000);
});
