/**
 * Re-derive the shipped `TimedBeat[]` from the committed alignment. No API call.
 *
 * A take's three artifacts are one thing, but they are not three *independent* things:
 * the beats file is a pure function of the alignment and the plan. So a change to the
 * fold — a new field, a fixed boundary rule — needs the beats regenerated without
 * spending quota or moving a single millisecond of audio, which is exactly what
 * `record-take.mts` must never be used for.
 *
 * Run from `packages/voice`: `pnpm exec tsx scripts/refold.mts`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { shippedPlans } from '@vox/video';
import { type Alignment, foldAlignment } from '../src/fold';

const here = import.meta.dirname;
const alignmentPath = join(here, '..', 'tests', 'fixtures', 'vertical-slice.alignment.json');
const beatsPath = join(here, '..', '..', 'video', 'src', 'plans', 'vertical-slice.beats.json');

const plan = shippedPlans[0];
if (!plan) throw new Error('No shipped plan to re-fold.');

const alignment = JSON.parse(readFileSync(alignmentPath, 'utf8')) as Alignment;
const timed = foldAlignment(plan.plan.beats, alignment);

writeFileSync(beatsPath, `${JSON.stringify(timed, null, 2)}\n`, 'utf8');

console.info(`Re-folded ${timed.length} beats from the committed alignment.`);
for (const beat of timed) {
  console.info(`  ${beat.id}  ${beat.fromMs}..${beat.toMs}ms  ${beat.words.length} words`);
}
