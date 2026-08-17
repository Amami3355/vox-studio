/**
 * One still, to `.scratch/stills/`, so a moved key frame can be looked at before it is
 * accepted.
 *
 * Lives here because Node resolves `@remotion/bundler` from the script's own location
 * upward, so a script outside this package cannot import it.
 *
 *   tsx packages/video/scripts/still.mts <capabilityId> <exampleId> <frame> <outName>
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { compositionIdFor } from '../src/runtime/compositionIds';

const [capabilityId, exampleId, frameArg, outName] = process.argv.slice(2);
if (!capabilityId || !exampleId || !frameArg || !outName) {
  throw new Error('Usage: still.mts <capabilityId> <exampleId> <frame> <outName>');
}

const compositionId = compositionIdFor(capabilityId, exampleId);
const inputProps = { capabilityId, exampleId, layout: null, motionProfile: null };

const serveUrl = await bundle({
  entryPoint: fileURLToPath(new URL('../src/remotion-entry.ts', import.meta.url)),
});
const composition = await selectComposition({ serveUrl, id: compositionId, inputProps });

const outDir = fileURLToPath(new URL('../../../.scratch/stills/', import.meta.url));
await mkdir(outDir, { recursive: true });

await renderStill({
  serveUrl,
  composition,
  inputProps,
  frame: Number(frameArg),
  output: `${outDir}${outName}.png`,
  imageFormat: 'png',
});

console.info(`${outDir}${outName}.png`);
