import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type HumanVerdictInput, signHumanVerdict } from '../src/proof/sign-verdict';

/**
 * Records a human's watch/listen verdict into a sealed proof bundle, and re-hashes it so the
 * bundle still verifies. See `src/proof/sign-verdict.ts` for why this cannot be a hand-edit.
 *
 *   sign:verdict <bundle-dir> --template            prints an input file with the sealed criteria
 *   sign:verdict <bundle-dir> --input <verdict.json> signs
 *
 * The template exists because the notes are the part a person has to write: it comes back with
 * the six criteria already in place, in order, so the notes cannot be filed against the wrong
 * rows. Keep the input file outside the bundle — anything inside it is hashed.
 */

const [directory, ...flags] = process.argv.slice(2);
if (!directory) throw new TypeError('sign:verdict requires an evidence directory.');
const root = resolve(directory);

const flag = (name: string): string | undefined => {
  const position = flags.indexOf(`--${name}`);
  return position === -1 ? undefined : flags[position + 1];
};

if (flags.includes('--template')) {
  const sealed = JSON.parse(await readFile(resolve(root, 'human-verdict.json'), 'utf8')) as {
    rows: Array<{ criterion: string }>;
  };
  const template: HumanVerdictInput = {
    humanVerdict: 'pass',
    evaluator: '',
    displayAndAudioSetup: '',
    rows: sealed.rows.map((row) => ({ criterion: row.criterion, verdict: 'pass', note: '' })),
  };
  process.stdout.write(`${JSON.stringify(template, null, 2)}\n`);
} else {
  const inputPath = flag('input');
  if (!inputPath) throw new TypeError('sign:verdict requires --input <verdict.json>.');
  const input = JSON.parse(await readFile(resolve(inputPath), 'utf8')) as HumanVerdictInput;
  const result = await signHumanVerdict(root, input);
  process.stdout.write(`${JSON.stringify({ ok: true, signed: true, ...result })}\n`);
}
