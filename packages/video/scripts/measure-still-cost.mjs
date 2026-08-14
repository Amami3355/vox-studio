/**
 * Measure what a still costs, so ticket 25 stops guessing.
 *
 * Points the existing renderStill machinery at the real paid Northbridge Run and times
 * every phase separately: bundle, browser launch, composition selection, then each still.
 * The number ticket 25 needs is the *marginal* one — what a second frame costs once the
 * bundle and the browser are already up — because that is the agent's inner loop, and it
 * is the number that decides the shape. Startup amortises; the marginal cost does not.
 *
 * Not part of the build. Run with `pnpm --filter @vox/video measure:stills`. Writes PNGs
 * and a `measurement.json` to a scratch directory and touches no production code.
 *
 * ## The baseline, 2026-08-14
 *
 * Against this Run's stored document (5 501 frames, 14 named frames), on the same machine
 * that produced its 333.7 s `run.render`:
 *
 *                          run 1     run 2
 *     bundle              1 994 ms  1 826 ms   once per code change
 *     openBrowser         1 260 ms    217 ms   once per session; collapses when Chrome is warm
 *     selectComposition   1 004 ms    858 ms   once per document
 *     first still           382 ms    540 ms
 *     marginal still        500 ms    615 ms   per frame
 *     ------------------------------------------------------------------------------
 *     14 frames, total     11.1 s     11.4 s   against 333.7 s for the video — 30× cheaper
 *
 * Compare the **total**, not the phases: startup and marginal cost trade against each
 * other run to run, and only the total is stable.
 *
 * Re-run this after anything that changes the bundle's size or the scene tree, and compare
 * against those numbers. A `bundle` phase that has grown past a few seconds is the failure
 * this script exists to catch early: it is the one phase a still cannot escape, and the
 * whole premise of a cheap visual check rests on it staying small.
 *
 * ## What it deliberately does not measure
 *
 * Audio. `renderStill` produces a silent PNG, so nothing here says anything about
 * narration, sync or pace. That question is answered upstream and for free, in the take's
 * `alignment.json` and in the word anchors `run.compile` resolves in 208 ms. The real
 * `audio.mp3` is still copied into the bundle's public directory below, so that the
 * `bundle` figure carries the same weight it carries in production rather than a
 * flattering one.
 */
import { readdirSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';

const repo = (path) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

/**
 * Pinned, and pinned on purpose: a baseline is only a baseline against the same document,
 * so the default is the paid long-form Run the 333.7 s figure came from. Pass another
 * run directory as the first argument to measure a different one — the number it prints
 * is then a fresh measurement rather than a comparison.
 *
 * Never re-run the proof itself to obtain this: the paid dispatches are spent, and every
 * artifact this script needs is already on disk.
 */
const RUN = process.argv[2]
  ? resolve(process.argv[2])
  : repo(
      '.scratch/agent-production-interface/proofs/2026-08-14T012547-734Z-northbridge-night-bus/main-run',
    );

/**
 * Artifacts are content-addressed, so the hash directory names change with the content and
 * hard-coding them would make this script a fossil of one run. Read the single entry
 * instead, and refuse rather than guess when there is more than one — a run with two
 * compilations is a question about *which* one, not a coin toss.
 */
const sole = (kind) => {
  const directory = join(RUN, 'artifacts', kind);
  const entries = readdirSync(directory);
  if (entries.length !== 1) {
    throw new Error(
      `Expected exactly one ${kind} artifact in ${directory}, found ${entries.length}.`,
    );
  }
  return join(directory, entries[0]);
};

const DOCUMENT = join(sole('compilations'), 'document.json');
const AUDIO = join(sole('takes'), 'audio.mp3');

/** Gitignored by `.scratch/**`, so frames and PNGs can never be picked up by `git add -A`. */
const OUT = repo('.scratch/still-cost');

const now = () => process.hrtime.bigint();
const since = (mark) => Number(now() - mark) / 1e6;
const phases = [];
const time = async (label, work) => {
  const mark = now();
  const value = await work();
  const took = since(mark);
  phases.push({ label, ms: took });
  console.info(`${label.padEnd(28)} ${took.toFixed(0).padStart(8)} ms`);
  return value;
};

const document = JSON.parse(await readFile(DOCUMENT, 'utf8'));

/**
 * Every frame the document itself names: each scene's first frame, and each event's.
 * Event frames are scene-relative, so an event at 0 is the scene's own opening and
 * collapses into it — which is why this is a Set and not a concatenation.
 */
const named = new Set();
for (const section of document.sections) {
  for (const scene of section.scenes) {
    named.add(scene.from);
    for (const event of scene.events ?? []) named.add(scene.from + event.frame);
  }
}
const frames = [...named].sort((a, b) => a - b);
console.info(`document: ${document.durationInFrames} frames at ${document.fps} fps`);
console.info(`named frames (${frames.length}): ${frames.join(', ')}\n`);

await mkdir(OUT, { recursive: true });
const work = await mkdtemp(join(tmpdir(), 'vox-measure-'));
const publicDir = join(work, 'public');
await mkdir(publicDir);
await copyFile(AUDIO, join(publicDir, 'voiceover.mp3'));

const serveUrl = await time('bundle', () =>
  bundle({
    entryPoint: fileURLToPath(new URL('../src/remotion-entry.ts', import.meta.url)),
    outDir: join(work, 'bundle'),
    publicDir,
    symlinkPublicDir: false,
  }),
);

const browser = await time('openBrowser', () => openBrowser('chrome', { logLevel: 'error' }));

const inputProps = { document };
const composition = await time('selectComposition', () =>
  selectComposition({
    serveUrl,
    id: 'compiled-document',
    inputProps,
    puppeteerInstance: browser,
    logLevel: 'error',
  }),
);

const stills = [];
for (const frame of frames) {
  const mark = now();
  await renderStill({
    serveUrl,
    composition,
    inputProps,
    puppeteerInstance: browser,
    frame,
    output: join(OUT, `frame-${String(frame).padStart(5, '0')}.png`),
    imageFormat: 'png',
    logLevel: 'error',
  });
  const took = since(mark);
  stills.push({ frame, ms: took });
  console.info(`still frame ${String(frame).padStart(5)}      ${took.toFixed(0).padStart(8)} ms`);
}

await browser.close({ silent: true });
await rm(work, { recursive: true, force: true });

const startup = phases.reduce((sum, phase) => sum + phase.ms, 0);
const sheet = stills.reduce((sum, still) => sum + still.ms, 0);
const first = stills[0]?.ms ?? 0;
const rest = stills.slice(1);
const marginal = rest.length ? rest.reduce((sum, s) => sum + s.ms, 0) / rest.length : 0;

const summary = {
  document: { durationInFrames: document.durationInFrames, fps: document.fps },
  frames,
  phases,
  stills,
  totals: {
    startupMs: startup,
    contactSheetMs: sheet,
    wholeOperationMs: startup + sheet,
    firstStillMs: first,
    marginalStillMs: marginal,
    measuredRenderMediaMs: 333_700,
  },
};
await writeFile(join(OUT, 'measurement.json'), JSON.stringify(summary, null, 2));

console.info(`\nstartup (bundle+browser+select) ${(startup / 1000).toFixed(1)} s`);
console.info(`${frames.length} stills                        ${(sheet / 1000).toFixed(1)} s`);
console.info(`whole contact sheet             ${((startup + sheet) / 1000).toFixed(1)} s`);
console.info(`first still                     ${(first / 1000).toFixed(1)} s`);
console.info(`marginal still (mean of rest)   ${marginal.toFixed(0)} ms`);
console.info('run.render measured at          333.7 s');
console.info(`\nPNGs and measurement.json in ${OUT}`);
