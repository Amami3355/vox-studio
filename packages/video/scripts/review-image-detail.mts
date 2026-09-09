/** Local review with an existing source image; no generation or provider calls.
 * tsx packages/video/scripts/review-image-detail.mts <image.png> <output-dir> [--stills]
 */
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { NO_SAFE_AREA } from '../src/core/types';
import { STRESS_CONTROL_ID, type StressSceneProps } from '../src/runtime/StressControl';

const [source, destination, mode] = process.argv.slice(2);
if (!source || !destination)
  throw new Error('Usage: review-image-detail.mts <image.png> <output-dir> [--stills]');
const out = resolve(destination);
await mkdir(out, { recursive: true });
const uri = `data:image/png;base64,${(await readFile(resolve(source))).toString('base64')}`;
const inputProps: StressSceneProps = {
  capabilityId: 'image_detail',
  props: {
    headline: 'La lumière rencontre l’atmosphère',
    caption: 'Illustration conceptuelle',
    imageFit: 'cover',
    assetRequirement: {
      type: 'image',
      subject: 'Light spectrum meeting molecules in the atmosphere',
      treatment: 'illustration',
      orientation: 'landscape',
    },
  },
  assets: { assetRequirement: { status: 'ready', uri } },
  layout: 'plate',
  motionProfile: 'editorialStatic',
  safeArea: NO_SAFE_AREA,
  events: [
    { frame: 90, action: 'focus', payload: { region: 'right' } },
    { frame: 105, action: 'annotate', payload: { text: 'Les molécules diffusent la lumière' } },
    {
      frame: 195,
      action: 'annotate',
      payload: { text: 'Le bleu est davantage diffusé que le rouge' },
    },
    { frame: 285, action: 'clearAnnotation' },
    { frame: 300, action: 'focus', payload: { region: 'whole' } },
  ],
};
const serveUrl = await bundle({
  entryPoint: fileURLToPath(new URL('../src/remotion-entry.ts', import.meta.url)),
});
const browser = await openBrowser('chrome', { logLevel: 'error' });
try {
  const selected = await selectComposition({
    serveUrl,
    id: STRESS_CONTROL_ID,
    inputProps,
    puppeteerInstance: browser,
    logLevel: 'error',
  });
  const composition = { ...selected, durationInFrames: 360 };
  for (const frame of [60, 100, 150, 240, 295, 340]) {
    await renderStill({
      serveUrl,
      composition,
      inputProps,
      puppeteerInstance: browser,
      frame,
      output: join(out, `frame-${frame}.png`),
      imageFormat: 'png',
      logLevel: 'error',
    });
  }
  for (const themeId of ['editorial-paper', 'editorial-cold'] as const) {
    await renderStill({
      serveUrl,
      composition,
      inputProps: { ...inputProps, themeId },
      puppeteerInstance: browser,
      frame: 150,
      output: join(out, `${themeId}.png`),
      imageFormat: 'png',
      logLevel: 'error',
    });
  }
  await renderStill({
    serveUrl,
    composition,
    inputProps: { ...inputProps, props: { ...inputProps.props, imageFit: 'contain' } },
    puppeteerInstance: browser,
    frame: 60,
    output: join(out, 'contain.png'),
    imageFormat: 'png',
    logLevel: 'error',
  });
  if (mode !== '--stills')
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      puppeteerInstance: browser,
      codec: 'h264',
      outputLocation: join(out, 'image-detail-preview.mp4'),
      logLevel: 'error',
    });
  console.info(out);
} finally {
  await browser.close({ silent: true });
}
