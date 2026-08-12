/**
 * The Section runtime, at the public render boundary.
 *
 * The compiler's decisions are asserted as data in `tests/compile.test.ts`. What only a
 * browser can answer is whether the document *plays* — so this suite states the ADR-0003
 * outcomes as relations between two renders of the same plan, one carrying a persistent
 * element and one not:
 *
 * - over a scene that yields, the two frames differ (the narrator is drawn)
 * - over a scene nothing can clear, they are identical (it is hidden)
 *
 * Which scene falls where is a property of the declarations, so the *slot* is the fixture's
 * variable rather than the scene. From a corner both capabilities can clear, the narrator
 * now survives the whole section — the continuity §9.3 is about, and something no plan
 * could demonstrate while `image_context` declared only `full`. From the centre, nothing
 * clears it anywhere and it is dropped throughout.
 *
 * No assertion depends on a font, a hash baseline or this machine.
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
import type { Slot, TimedBeat } from '../../src/core/types';

const NARRATOR_URI =
  'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22300%22%20height=%22300%22%3E%3Ccircle%20cx=%22150%22%20cy=%22150%22%20r=%22140%22%20fill=%22%23FF5A1F%22/%3E%3C/svg%3E';

/** Long enough that both scenes clear the `minDurationFrames` their capabilities declare. */
const timedBeats: TimedBeat[] = [
  { id: 'b1', text: 'Rents have climbed for a decade.', fromMs: 0, toMs: 3000 },
  { id: 'b2', text: 'London is the extreme case.', fromMs: 3000, toMs: 8000 },
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

/** `null` is the same plan with no persistent layer at all — the control render. */
const planWith = (slot: Slot | null): VideoPlan => ({
  beats: timedBeats.map(({ id, text }) => ({ id, text })),
  sections: [
    {
      id: 'sec1',
      spansBeats: ['b1', 'b2'],
      ...(slot
        ? {
            persistent: [
              {
                id: 'narrator',
                element: 'character' as const,
                asset: { status: 'ready' as const, uri: NARRATOR_URI },
                placements: [{ at: 'b1.start', slot }],
              },
            ],
          }
        : {}),
      scenes,
    },
  ],
});

const documentFor = (slot: Slot | null): CompiledDocument => {
  const result = compile({ plan: planWith(slot), beats: timedBeats });
  if (!result.ok) throw new Error(`fixture plan did not compile: ${JSON.stringify(result.report)}`);
  return result.document;
};

/** Frames inside each scene: the chart runs 0–90, the context scene 90–240. */
const OVER_CHART = 30;
const OVER_CONTEXT = 150;

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
    const document = documentFor('cornerBR');

    // 8000ms of speech at 30fps, with the cut where b2 begins.
    expect(document.durationInFrames).toBe(240);
    expect(document.sections[0]?.scenes.map((scene) => [scene.from, scene.to])).toEqual([
      [0, 90],
      [90, 240],
    ]);

    const [chartFrame, contextFrame] = await Promise.all([
      renderHash(document, OVER_CHART),
      renderHash(document, OVER_CONTEXT),
    ]);

    expect(chartFrame).not.toBe(contextFrame);
  }, 120_000);

  /**
   * Both scenes yield into `left`, so the narrator holds one corner across the cut. The
   * assertion is per scene rather than over the whole video because "still drawn after the
   * cut" is the claim, and a single render cannot make it.
   */
  it('keeps a persistent element in frame across a cut both scenes yielded for', async () => {
    const [overChart, overContext, chartAlone, contextAlone] = await Promise.all([
      renderHash(documentFor('cornerBR'), OVER_CHART),
      renderHash(documentFor('cornerBR'), OVER_CONTEXT),
      renderHash(documentFor(null), OVER_CHART),
      renderHash(documentFor(null), OVER_CONTEXT),
    ]);

    expect(overChart).not.toBe(chartAlone);
    expect(overContext).not.toBe(contextAlone);
  }, 120_000);

  /**
   * The centre is the slot nothing rescues: it overlaps both halves, so no composition
   * either capability declares can clear it, and one placement leaves nowhere to relocate
   * to. Rung d, playing.
   */
  it('drops one no composition can clear, changing nothing else about the frame', async () => {
    const [overChart, overContext, chartAlone, contextAlone] = await Promise.all([
      renderHash(documentFor('center'), OVER_CHART),
      renderHash(documentFor('center'), OVER_CONTEXT),
      renderHash(documentFor(null), OVER_CHART),
      renderHash(documentFor(null), OVER_CONTEXT),
    ]);

    expect(overChart).toBe(chartAlone);
    expect(overContext).toBe(contextAlone);
  }, 120_000);
});
