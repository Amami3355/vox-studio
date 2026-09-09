/**
 * Local visual review of image_context using an existing PNG; no provider calls.
 * tsx packages/video/scripts/review-image-context.mts <image.png> <output-dir>
 * The timed emphasis is a render control, not a normative plan or catalog example.
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
  throw new Error('Usage: review-image-context.mts <image.png> <output-dir>');
const out = resolve(destination);
await mkdir(out, { recursive: true });
const uri = `data:image/png;base64,${(await readFile(resolve(source))).toString('base64')}`;
const inputProps: StressSceneProps = {
  capabilityId: 'image_context',
  props: {
    headline: 'Avant le tonnerre',
    caption: 'La lumière nous parvient avant le son.',
    imageFocus: 'left',
    assetRequirement: {
      type: 'image',
      subject: 'Storm above a landscape, observer at left',
      treatment: 'photo',
      orientation: 'landscape',
    },
  },
  assets: { assetRequirement: { status: 'ready', uri } },
  layout: 'bottomRight',
  motionProfile: 'cinematic',
  safeArea: NO_SAFE_AREA,
  events: [
    { frame: 0, action: 'revealImage' },
    { frame: 30, action: 'revealCopy' },
    { frame: 180, action: 'emphasize', payload: { text: 'La lumière arrive d’abord' } },
    { frame: 240, action: 'clearEmphasis' },
    { frame: 300, action: 'hideCopy' },
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
  for (const frame of [20, 120, 210, 280, 340]) {
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
  for (const layout of ['bottomLeft', 'bottomRight', 'lowerThird']) {
    const variant = { ...inputProps, layout };
    const variantComposition = await selectComposition({
      serveUrl,
      id: STRESS_CONTROL_ID,
      inputProps: variant,
      puppeteerInstance: browser,
      logLevel: 'error',
    });
    await renderStill({
      serveUrl,
      composition: { ...variantComposition, durationInFrames: 360 },
      inputProps: variant,
      puppeteerInstance: browser,
      frame: 120,
      output: join(out, `${layout}.png`),
      imageFormat: 'png',
      logLevel: 'error',
    });
  }
  if (mode !== '--stills')
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      puppeteerInstance: browser,
      codec: 'h264',
      outputLocation: join(out, 'image-context-preview.mp4'),
      logLevel: 'error',
    });
  console.info(out);
} finally {
  await browser.close({ silent: true });
}
