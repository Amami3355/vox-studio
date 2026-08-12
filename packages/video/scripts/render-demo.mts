/**
 * Compile the continuity plan and render it, so a human can look at the output rather
 * than trust a hash. Not part of the build; run it with `pnpm exec tsx
 * scripts/render-demo.mts` from `packages/video`. Output lands in
 * `.scratch/section-compiler/output/` and is gitignored.
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import type { VideoPlan } from '../src/catalog/validate';
import { compile } from '../src/compile';
import type { TimedBeat } from '../src/core/types';

/**
 * Long enough that both scenes clear the `minDurationFrames` their capabilities declare.
 *
 * `words: []` because these timings are invented rather than spoken. Nothing in the system
 * fabricates a word onset — a take that was not folded from a recorded alignment reports
 * having no words, and a word anchor written against one fails loudly instead of resolving
 * to a plausible frame. This demo uses boundary anchors only, so it costs nothing here.
 */
const beats: TimedBeat[] = [
  { id: 'b1', text: 'Rents have climbed for a decade.', fromMs: 0, toMs: 3000, words: [] },
  { id: 'b2', text: 'London is the extreme case.', fromMs: 3000, toMs: 8000, words: [] },
];

const plan: VideoPlan = {
  beats: beats.map(({ id, text }) => ({ id, text })),
  sections: [
    {
      id: 'sec1',
      spansBeats: ['b1', 'b2'],
      persistent: [
        {
          id: 'narrator',
          element: 'character',
          // Same identity as the shipped slice's narrator, so both draw the one figure
          // the library holds. ADR-0005: a plan names what it needs, never where it is.
          assetRequirement: {
            type: 'character',
            subject: 'Narrator figure, flat editorial silhouette',
            treatment: 'illustration',
            orientation: 'square',
            identityKey: 'narrator',
          },
          placements: [{ at: 'b1.start', slot: 'cornerBR' }],
        },
      ],
      scenes: [
        {
          id: 'chart',
          component: 'bar_chart',
          layout: 'standard',
          motionProfile: 'energetic',
          spansBeats: ['b1'],
          props: {
            title: 'Share of income spent on rent',
            unit: '%',
            data: [
              { label: 'Berlin', value: 27 },
              { label: 'London', value: 47 },
            ],
          },
          events: [
            { at: 'b1.start', action: 'showBaseline' },
            { at: 'b1.mid', action: 'revealAll' },
            { at: 'b1.end-short', action: 'highlightBar', payload: { label: 'London' } },
          ],
        },
        {
          id: 'context',
          component: 'image_context',
          layout: 'splitLeft',
          motionProfile: 'cinematic',
          spansBeats: ['b2'],
          props: {
            headline: 'The rent squeeze is reshaping city life',
            caption: 'A growing share of income disappears before the month begins.',
            assetRequirement: {
              type: 'image',
              subject: 'Dense apartment buildings in a European city at dusk',
              treatment: 'photo',
              orientation: 'landscape',
              identityKey: 'housing-city-context',
            },
          },
        },
      ],
    },
  ],
};

const result = compile({ plan, beats });
if (!result.ok) throw new Error(JSON.stringify(result.report, null, 2));

const out = fileURLToPath(new URL('../../../.scratch/section-compiler/output/', import.meta.url));
await mkdir(out, { recursive: true });
await writeFile(join(out, 'document.json'), JSON.stringify(result.document, null, 2));
await writeFile(join(out, 'report.json'), JSON.stringify(result.report, null, 2));

const dir = await mkdtemp(join(tmpdir(), 'vox-demo-'));
const serveUrl = await bundle({
  entryPoint: fileURLToPath(new URL('../src/remotion-entry.ts', import.meta.url)),
  outDir: dir,
});

const inputProps = { document: result.document };
const composition = await selectComposition({ serveUrl, id: 'compiled-document', inputProps });

for (const frame of [15, 45, 75, 120]) {
  await renderStill({
    serveUrl,
    composition,
    inputProps,
    frame,
    output: join(out, `frame-${String(frame).padStart(3, '0')}.png`),
    imageFormat: 'png',
    logLevel: 'error',
  });
}

await renderMedia({
  serveUrl,
  composition,
  inputProps,
  codec: 'h264',
  outputLocation: join(out, 'section.mp4'),
  logLevel: 'error',
});

console.info('duration (frames):', result.document.durationInFrames);
console.info(
  'scene windows:',
  JSON.stringify(result.document.sections[0]?.scenes.map((s) => [s.id, s.from, s.to])),
);
console.info('layoutStates:', JSON.stringify(result.document.sections[0]?.layoutStates));
console.info('warnings:', JSON.stringify(result.report.warnings.map((w) => w.code)));
console.info('output:', out);
