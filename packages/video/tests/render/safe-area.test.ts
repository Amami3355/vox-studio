/**
 * ADR-0003's unpaid consequence: *"a declared composition is trusted, and nothing yet
 * checks that it renders"*.
 *
 * `supportedCompositions` is the only lever a capability has to keep a persistent element
 * alive over it, and the compiler takes an entry there as proof that a layout exists for
 * that half of the frame. Nothing verified it. A capability could declare `left`, get
 * squeezed into 960px with a layout drawn for 1920, and spill across the corner the
 * element was standing in — silently, legally, and only visible to whoever happened to
 * watch that section.
 *
 * So this suite is generated from the declarations themselves: every capability × every
 * composition it claims. Adding a composition to a `meta.ts` adds a case here, which is
 * the habit the gap is paid off by.
 *
 * The assertion is a relation between two renders of the same composition carrying
 * different content, never a hash baseline:
 *
 * - outside the reserved rectangle the two frames are byte-identical — that region is
 *   backdrop, and backdrop does not know what the scene says
 * - inside it they differ — which is what stops the first assertion passing because the
 *   probe was reading the wrong rectangle, or an empty one
 *
 * Both hold on any machine, in any font. What they cannot survive is a scene drawing
 * outside the frame it was given, which is the whole point.
 */
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
import { type Rect, slotRect } from '../../src/core/slots';
import type { SafeArea, Slot } from '../../src/core/types';
import { HEIGHT, WIDTH, editorialCold } from '../../src/design/theme';
import { compositionIdFor } from '../../src/runtime/ExampleScene';
import { registry } from '../../src/scenes/registry';
import { type Bitmap, type Region, bandsOutside, decodePng, hashRegions, pixelAt } from './png';

/**
 * `cinematic` for every case, whatever the example declares.
 *
 * The camera is the only thing that can move a laid-out scene across its own boundary, and
 * for a half-frame composition the boundary is the centre line — which a scale about the
 * centre leaves exactly where it is. Translation is therefore the entire risk, and
 * `cinematic`'s panDrift has the largest of any profile. Fixing the profile also stops the
 * two renders of a case differing in camera as well as in content.
 */
const PROFILE = 'cinematic';

/**
 * Two frames, because the pan crosses the frame in both directions and only one of them
 * pushes toward any given boundary. A quarter in, the entrances have landed and the pan is
 * still left of centre; at the last frame it is at its rightmost.
 */
const framesFor = (duration: number): number[] => [Math.round(duration * 0.25), duration - 1];

const isPartial = (rect: Rect): boolean =>
  rect.top > 0 || rect.right > 0 || rect.bottom > 0 || rect.left > 0;

const insideOf = (rect: Rect): Region => ({
  x: Math.round((rect.left / 100) * WIDTH),
  y: Math.round((rect.top / 100) * HEIGHT),
  width: Math.round(((100 - rect.left - rect.right) / 100) * WIDTH),
  height: Math.round(((100 - rect.top - rect.bottom) / 100) * HEIGHT),
});

type Case = {
  label: string;
  capabilityId: string;
  composition: Slot;
  safeArea: SafeArea;
  /** Two examples of the same capability, so "different content" is real content. */
  examples: [string, string];
  frames: number[];
};

const cases: Case[] = registry.flatMap((capability) =>
  capability.meta.supportedCompositions
    .filter((composition) => isPartial(slotRect(composition)))
    .map((composition) => ({
      label: `${capability.meta.id} composed into ${composition}`,
      capabilityId: capability.meta.id,
      composition,
      safeArea: slotRect(composition),
      examples: [capability.examples[0]?.id as string, capability.examples[1]?.id as string] as [
        string,
        string,
      ],
      frames: framesFor(capability.meta.recommendedDurationFrames),
    })),
);

let bundleDirectory = '';
let serveUrl = '';
let browser: HeadlessBrowser | undefined;

beforeAll(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), 'vox-safe-area-'));
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

const renderBitmap = async (
  capabilityId: string,
  exampleId: string,
  safeArea: SafeArea,
  frame: number,
): Promise<Bitmap> => {
  const inputProps = {
    capabilityId,
    exampleId,
    layout: null,
    motionProfile: PROFILE,
    safeArea,
  };
  const composition = await selectComposition({
    serveUrl,
    id: compositionIdFor(capabilityId, exampleId),
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
  return decodePng(rendered.buffer);
};

describe('a declared composition renders into the rectangle it declared', () => {
  it('has a case for every composition in the catalog', () => {
    // The suite is generated, so an empty or half-built case list would report as a pass.
    expect(cases.map((one) => one.label)).toEqual([
      'bar_chart composed into left',
      'bar_chart composed into right',
      'image_context composed into left',
      'image_context composed into right',
    ]);
    for (const one of cases) expect(one.examples[0]).not.toBe(one.examples[1]);
  });

  describe.each(cases.map((one) => [one.label, one] as const))('%s', (_label, testCase) => {
    /** `[frame][example]` — four stills, one browser, rendered together. */
    let frames: Bitmap[][] = [];

    beforeAll(async () => {
      frames = await Promise.all(
        testCase.frames.map((frame) =>
          Promise.all(
            testCase.examples.map((exampleId) =>
              renderBitmap(testCase.capabilityId, exampleId, testCase.safeArea, frame),
            ),
          ),
        ),
      );
    }, 180_000);

    /**
     * The probe, checked against something it did not compute: the canvas size the design
     * system declares, and the backdrop token at a corner the radial lift does not reach.
     * A decoder that mis-strided every row would still produce equal hashes below.
     */
    it('reads the canvas the design system says it rendered', () => {
      const bitmap = frames[0]?.[0] as Bitmap;

      expect([bitmap.width, bitmap.height]).toEqual([WIDTH, HEIGHT]);
      expect(pixelAt(bitmap, 4, HEIGHT - 5)).toBe(editorialCold.color.bg.toLowerCase());
    });

    it('draws nothing into the region the composition reserves', () => {
      const outside = bandsOutside(insideOf(testCase.safeArea), WIDTH, HEIGHT);

      for (const [index, frame] of testCase.frames.entries()) {
        const [a, b] = frames[index] as [Bitmap, Bitmap];

        expect({ frame, region: hashRegions(a, outside) }).toEqual({
          frame,
          region: hashRegions(b, outside),
        });
      }
    });

    it('draws the scene inside it, so the comparison above is over a live frame', () => {
      const inside = [insideOf(testCase.safeArea)];
      const [a, b] = frames.at(-1) as [Bitmap, Bitmap];

      expect(hashRegions(a, inside)).not.toBe(hashRegions(b, inside));
    });
  });
});
