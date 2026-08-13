/**
 * Re-derive the shipped `TimedBeat[]` from the committed alignment. No API call.
 *
 * A take's artifacts are one thing, but they are not all *independent* things: the beats
 * file is a pure function of the alignment and the plan. So a change to the fold — a new
 * field, a fixed boundary rule — needs the beats regenerated without spending quota or
 * moving a single millisecond of audio, which is exactly what `record-take.mts` must never
 * be used for.
 *
 * What that convenience quietly assumed is that the alignment on disk belongs to the audio
 * on disk. Nothing established it. This script read the plan and the alignment, wrote the
 * beats, and never opened the mp3 — so a cherry-pick, a partial revert, or a merge that
 * took one file and not the other left alignment from take B beside audio from take A, and
 * refolding then made the beats agree with B. The result is a systematically mistimed video
 * in which the fold test, text equality and every other gate still pass, discoverable only
 * by watching it.
 *
 * So the identity is checked before the derived file is written, and the write happens only
 * if it holds. Refusing is the entire contribution: this script cannot re-record, and
 * writing beats from a set that disagrees is strictly worse than writing nothing.
 *
 * Run from `packages/voice`: `pnpm exec tsx scripts/refold.mts`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { shippedPlans } from '@vox/video';
import { type Alignment, foldAlignment } from '../src/fold';
import { type TakeManifest, describeTake, verifyTake } from '../src/take';

const here = import.meta.dirname;
const fixtures = join(here, '..', 'tests', 'fixtures');
const beatsPath = join(here, '..', '..', 'video', 'src', 'plans', 'vertical-slice.beats.json');

const plan = shippedPlans[0];
if (!plan) throw new Error('No shipped plan to re-fold.');

const alignmentPath = join(fixtures, `${plan.id}.alignment.json`);
const manifestPath = join(fixtures, `${plan.id}.take.json`);
const audioPath = join(here, '..', '..', 'video', 'public', `${plan.id}.vo.mp3`);

const alignment = JSON.parse(readFileSync(alignmentPath, 'utf8')) as Alignment;

/**
 * Read before the fold rather than after, so a mismatched set costs nothing and changes
 * nothing. A missing manifest is refused rather than skipped: "no manifest" and "verified"
 * must not lead to the same place, or the check is advisory and the next take that arrives
 * without one silently re-opens the hole this closes.
 */
let manifest: TakeManifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as TakeManifest;
} catch {
  throw new Error(
    `No take manifest at ${manifestPath}. It records which audio and which alignment were recorded together, and without it there is nothing to check the committed artifacts against. Record the take again to produce one.`,
  );
}

verifyTake(manifest, { audio: readFileSync(audioPath), alignment });

const timed = foldAlignment(plan.plan.beats, alignment);

writeFileSync(beatsPath, `${JSON.stringify(timed, null, 2)}\n`, 'utf8');

console.info(`Verified ${describeTake(manifest)}`);
console.info(`Re-folded ${timed.length} beats from the committed alignment.`);
for (const beat of timed) {
  console.info(`  ${beat.id}  ${beat.fromMs}..${beat.toMs}ms  ${beat.words.length} words`);
}
