/**
 * Record the voice-over for a shipped plan.
 *
 * Run deliberately, by a human, when the plan's words change — never from a build step.
 * Synthesis is not reproducible, so re-running this produces a *different* take: different
 * audio, different boundaries. That is why the output is committed.
 *
 *   cd packages/voice && pnpm exec tsx scripts/record-take.mts [--seed 7]
 *
 * It writes four files from **one** response, and they only mean anything together:
 *
 *   packages/video/src/plans/<id>.beats.json            the timings the compiler reads
 *   packages/video/public/<id>.vo.mp3                   the audio those timings describe
 *   packages/voice/tests/fixtures/<id>.alignment.json   what the fold is tested against
 *   packages/voice/tests/fixtures/<id>.take.json        what says the other three are one take
 *
 * Writing them in one pass is the point. Assembled from two takes they would look
 * perfectly well-formed and cut the pictures against words nobody says. This is the only
 * moment that fact is *known* rather than assumed — the manifest exists so the knowledge
 * survives the commit, and so `refold.mts` can check it instead of trusting it.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shippedPlans } from '@vox/video';
import { scriptFor } from '../src/fold';
import { synthesise } from '../src/synthesise';
import { describeTake, takeManifest } from '../src/take';

/** George. Picked arbitrarily by the first spike and never revisited — see ADR-0004. */
const VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');

const seedArg = process.argv.indexOf('--seed');
const seed = seedArg === -1 ? undefined : Number(process.argv[seedArg + 1]);

const shipped = shippedPlans[0];
if (!shipped) throw new Error('No shipped plan to record.');

const script = scriptFor(shipped.plan.beats);
console.info(
  `Recording "${shipped.id}": ${shipped.plan.beats.length} beats, ${script.length} characters`,
);
console.info(`voice ${VOICE_ID}${seed === undefined ? '' : `, seed ${seed}`}\n`);

const take = await synthesise({
  beats: shipped.plan.beats,
  voiceId: VOICE_ID,
  ...(seed === undefined ? {} : { seed }),
});

/**
 * Built before anything is written, from the response still in memory. This is the one
 * instant where "these were recorded together" is a fact rather than an assumption.
 */
const manifest = takeManifest({
  planId: shipped.id,
  voiceId: VOICE_ID,
  ...(seed === undefined ? {} : { seed }),
  recordedAt: new Date().toISOString(),
  audio: take.audio,
  alignment: take.alignment,
});

writeFileSync(
  join(repo, 'packages/voice/tests/fixtures', `${shipped.id}.alignment.json`),
  `${JSON.stringify(take.alignment, null, 2)}\n`,
);
writeFileSync(
  join(repo, 'packages/video/src/plans', `${shipped.id}.beats.json`),
  `${JSON.stringify(take.beats, null, 2)}\n`,
);
writeFileSync(join(repo, 'packages/video/public', `${shipped.id}.vo.mp3`), take.audio);
writeFileSync(
  join(repo, 'packages/voice/tests/fixtures', `${shipped.id}.take.json`),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.info(`\n${describeTake(manifest)}`);

console.info('beat        from      to    length');
for (const beat of take.beats) {
  console.info(
    `${beat.id}  ${String(beat.fromMs).padStart(6)}  ${String(beat.toMs).padStart(6)}  ${String(beat.toMs - beat.fromMs).padStart(6)}ms`,
  );
}
console.info(
  `\ntotal ${take.beats.at(-1)?.toMs}ms, audio ${(take.audio.length / 1024).toFixed(0)} KB`,
);
console.info('\nRe-run `pnpm test` — the fold test compares these against the alignment fixture.');
