/**
 * The Section runtime, at the public render boundary.
 *
 * The compiler's decisions are asserted as data in `tests/compile.test.ts`. What only a
 * browser can answer is whether the document *plays* — so this suite states the ADR-0003
 * outcome as a relation between two renders of the same plan, one carrying a persistent
 * element and one not:
 *
 * - over the scene that can yield, the two frames differ (the narrator is drawn)
 * - over the scene that occupies the whole frame, they are identical (it is hidden)
 *
 * Neither assertion depends on a font, a hash baseline or this machine.
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
import type { VideoPlan } from '../../src/catalog/validate';
import { compile } from '../../src/compile';
import type { CompiledDocument } from '../../src/compile/document';
import type { TimedBeat } from '../../src/core/types';

const NARRATOR_URI =
  'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22300%22%20height=%22300%22%3E%3Ccircle%20cx=%22150%22%20cy=%22150%22%20r=%22140%22%20fill=%22%23FF5A1F%22/%3E%3C/svg%3E';

const timedBeats: TimedBeat[] = [
  { id: 'b1', text: 'Rents have climbed for a decade.', fromMs: 0, toMs: 2000 },
  { id: 'b2', text: 'London is the extreme case.', fromMs: 2000, toMs: 5000 },
];

const scenes = [
  {
    id: 'chart',
    component: 'bar_chart',
    layout: 'standard',
    motionProfile: 'energetic' as const,
    spansBeats: ['b1'],
    props: {
      title: 'Share of income spent on rent',
      unit: '%',
      data: [
        { label: 'Berlin', value: 27 },
        { label: 'London', value: 47 },
      ],
    },
  },
  {
    id: 'context',
    component: 'image_context',
    layout: 'splitLeft',
    motionProfile: 'cinematic' as const,
    spansBeats: ['b2'],
    props: {
      headline: 'The rent squeeze is reshaping city life',
      assetRequirement: {
        type: 'image',
        subject: 'Dense apartment buildings in a European city at dusk',
        treatment: 'photo',
        orientation: 'landscape',
        identityKey: 'housing-city-context',
      },
    },
  },
];

const planWith = (narrator: boolean): VideoPlan => ({
  beats: timedBeats.map(({ id, text }) => ({ id, text })),
  sections: [
    {
      id: 'sec1',
      spansBeats: ['b1', 'b2'],
      ...(narrator
        ? {
            persistent: [
              {
                id: 'narrator',
                element: 'character' as const,
                asset: { status: 'ready' as const, uri: NARRATOR_URI },
                placements: [{ at: 'b1.start', slot: 'cornerBR' as const }],
              },
            ],
          }
        : {}),
      scenes,
    },
  ],
});

const documentFor = (narrator: boolean): CompiledDocument => {
  const result = compile({ plan: planWith(narrator), beats: timedBeats });
  if (!result.ok) throw new Error(`fixture plan did not compile: ${JSON.stringify(result.report)}`);
  return result.document;
};

let bundleDirectory = '';
let serveUrl = '';
let browser: HeadlessBrowser | undefined;

beforeAll(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), 'vox-compiled-'));
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

const renderHash = async (document: CompiledDocument, frame: number): Promise<string> => {
  const inputProps = { document };
  const composition = await selectComposition({
    serveUrl,
    id: 'compiled-document',
    inputProps,
    puppeteerInstance: browser,
    logLevel: 'error',
  });
  const rendered = await renderStill({
    serveUrl,
    composition,
    inputProps,
    puppeteerInstance: browser,
    frame,
    output: null,
    imageFormat: 'png',
    logLevel: 'error',
  });

  if (!rendered.buffer) throw new Error('Remotion returned no still buffer.');
  return createHash('md5').update(rendered.buffer).digest('hex');
};

describe('the Section runtime', () => {
  it('plays a compiled document as one video, section and scene windows included', async () => {
    const document = documentFor(true);

    // 5000ms of speech at 30fps, with the cut where b2 begins.
    expect(document.durationInFrames).toBe(150);
    expect(document.sections[0]?.scenes.map((scene) => [scene.from, scene.to])).toEqual([
      [0, 60],
      [60, 150],
    ]);

    const [chartFrame, contextFrame] = await Promise.all([
      renderHash(document, 30),
      renderHash(document, 90),
    ]);

    expect(chartFrame).not.toBe(contextFrame);
  }, 120_000);

  it('draws the persistent element over the scene that yielded to it', async () => {
    const [withNarrator, without] = await Promise.all([
      renderHash(documentFor(true), 30),
      renderHash(documentFor(false), 30),
    ]);

    expect(withNarrator).not.toBe(without);
  }, 120_000);

  it('hides it over the scene that occupies the whole frame, changing nothing else', async () => {
    const [withNarrator, without] = await Promise.all([
      renderHash(documentFor(true), 90),
      renderHash(documentFor(false), 90),
    ]);

    expect(withNarrator).toBe(without);
  }, 120_000);
});
