/**
 * Seeds the duration calibration store, and prints the voice block a request must carry to match.
 *
 * Without this, `DurationCalibrationStore.load()` returns `{ status: 'missing' }` and Preflight
 * runs against a missing calibration. The failure is quiet — a Run proceeds and its duration
 * assessment is simply not calibrated — which is why this is a step rather than a footnote.
 *
 * The calibration and its key are imported from the source of truth, never restated here.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DurationCalibrationStore,
  activeInitialCalibration,
} from '../../../../packages/production/src/preflight/calibration';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const calibrationPath = process.env.VOX_CALIBRATION_PATH;
if (!calibrationPath) {
  process.stderr.write('VOX_CALIBRATION_PATH is unset. Export the service environment first.\n');
  process.exit(2);
}

const store = new DurationCalibrationStore(resolve(calibrationPath));
const existing = await store.load();
if (existing.status === 'active' && !process.argv.includes('--force')) {
  process.stdout.write(`Already active at ${calibrationPath}. Pass --force to overwrite.\n`);
} else {
  const state = activeInitialCalibration();
  await store.save(state);
  process.stdout.write(`Seeded ${calibrationPath} (was: ${existing.status}).\n`);
}

/**
 * The half operators miss. A seeded store applies to one key only; a request naming a different
 * voice, model or seed is scored as a different key and the calibration does not apply to it.
 */
const seeded = activeInitialCalibration();
if (seeded.status !== 'active') throw new Error('activeInitialCalibration is no longer active.');
const { provider, voiceId, modelId, seed } = seeded.calibration.key;
process.stdout.write(
  `\nThe request's production.voice block must match this key exactly:\n\n${JSON.stringify(
    { provider, voiceId, modelId, seed },
    null,
    2,
  )}\n\nSource: ${resolve(repositoryRoot, 'packages/production/src/preflight/preflight.ts').slice(
    repositoryRoot.length + 1,
  )} (INITIAL_DURATION_CALIBRATION)\n`,
);
