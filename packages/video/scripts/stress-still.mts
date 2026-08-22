/**
 * One content-stress case as a still, so a red finding can be looked at.
 *
 * `still.mts` renders an *example* — copy a human wrote to be readable. This renders what
 * `tests/stress/cases.ts` generates: the schema's own ceilings and floors, drawn through
 * `StressControl` and the real pipeline. A border or clipping finding names a case and a
 * number and no picture, and the repair is always a decision about layout, so the picture
 * is the first thing anyone needs.
 *
 *   tsx packages/video/scripts/stress-still.mts <capabilityId> <regime> <layout> <frame>
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { NO_SAFE_AREA } from '../src/core/types';
import { STRESS_CONTROL_ID } from '../src/runtime/StressControl';
import { requireCapability } from '../src/scenes/registry';
import { stressContent } from '../tests/stress/cases';

const [capabilityId = 'timeline', regime = 'ceiling', layout = 'spine', frameArg = '269'] =
  process.argv.slice(2);

const capability = requireCapability(capabilityId);
const shape = stressContent(capability).find((one) => one.id === regime);
if (!shape) throw new Error(`no ${regime} shape`);

const inputProps = {
  capabilityId,
  props: shape.props,
  events: shape.events,
  layout,
  motionProfile: 'editorialStatic',
  safeArea: NO_SAFE_AREA,
};

const serveUrl = await bundle({
  entryPoint: fileURLToPath(new URL('../src/remotion-entry.ts', import.meta.url)),
});
const composition = await selectComposition({ serveUrl, id: STRESS_CONTROL_ID, inputProps });
const outDir = fileURLToPath(new URL('../../../.scratch/stills/', import.meta.url));
await mkdir(outDir, { recursive: true });

await renderStill({
  serveUrl,
  composition,
  inputProps,
  frame: Number(frameArg),
  output: `${outDir}stress-${capabilityId}-${regime}.png`,
  imageFormat: 'png',
});
console.info(`${outDir}stress-${capabilityId}-${regime}.png`);
