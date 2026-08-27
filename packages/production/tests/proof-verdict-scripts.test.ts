import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { CRITERIA, pendingBundle, removeVerdictBundles } from './verdict-fixture';

/**
 * The two commands a person actually runs, driven as commands.
 *
 * The modules beneath them were covered and these were not, which left the gap where it does the
 * most damage: `--template` exists precisely so notes cannot be filed against the wrong criteria,
 * and it was the one part of that guarantee nothing exercised. A template that emitted the rows
 * in the wrong order, or dropped `criterion`, would have been found by a person mid-signature.
 *
 * They are spawned rather than imported because both are top-level-await scripts that read
 * `process.argv` — importing them would test a different thing than the one that ships.
 */

const execFileAsync = promisify(execFile);
const SCRIPTS = resolve(import.meta.dirname, '..', 'scripts');

// Each case spawns `tsx` once or more, and a cold spawn is seconds on Windows. The default 5s
// would make these tests report load as failure, which is the flake this suite least needs.
const SPAWNS = 60_000;

const inputs: string[] = [];
afterAll(async () => {
  await Promise.all(inputs.map((path) => rm(path, { recursive: true, force: true })));
  await removeVerdictBundles();
});

/**
 * Runs a script the way `pnpm --filter @vox/production <script>` does, and returns stdout.
 *
 * The package's own `tsx`, not `npx tsx`: `npx` re-resolves the binary on every call, and six
 * spawns of it is most of this file's runtime for nothing the test is about.
 */
const TSX = resolve(
  import.meta.dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsx.CMD' : 'tsx',
);

const run = async (script: string, args: string[]): Promise<string> => {
  const { stdout } = await execFileAsync(TSX, [join(SCRIPTS, script), ...args], {
    cwd: resolve(SCRIPTS, '..'),
    windowsHide: true,
    shell: process.platform === 'win32',
  });
  return stdout;
};

/** An input file, written outside the bundle — anything inside it would be hashed. */
const inputFile = async (value: unknown): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'vox-verdict-input-'));
  inputs.push(directory);
  const path = join(directory, 'verdict.json');
  await writeFile(path, JSON.stringify(value), 'utf8');
  return path;
};

describe('sign:verdict', () => {
  it(
    'prints a template carrying every sealed criterion, in the sealed order',
    async () => {
      const root = await pendingBundle();
      const template = JSON.parse(await run('sign-verdict.ts', [root, '--template'])) as {
        rows: Array<{ criterion: string; verdict: string; note: string }>;
      };

      // Order is the whole point: a template that reordered the rows would hand a person a file
      // whose notes land one criterion off, which is the failure `criterion` is checked against.
      expect(template.rows.map((row) => row.criterion)).toEqual([...CRITERIA]);
      expect(template.rows.every((row) => row.note === '')).toBe(true);
    },
    SPAWNS,
  );

  it(
    'produces a template that signs, which is the only thing that makes it a template',
    async () => {
      const root = await pendingBundle();
      const template = JSON.parse(await run('sign-verdict.ts', [root, '--template'])) as Record<
        string,
        unknown
      >;
      const rows = (template.rows as Array<Record<string, unknown>>).map((row, position) => ({
        ...row,
        note: `watched, row ${position + 1} holds`,
      }));
      const path = await inputFile({
        ...template,
        evaluator: 'A Person',
        displayAndAudioSetup: '27-inch display at 100%, wired headphones',
        rows,
      });

      const signed = JSON.parse(await run('sign-verdict.ts', [root, '--input', path])) as {
        ok: boolean;
        humanVerdict: string;
      };
      expect(signed).toMatchObject({ ok: true, humanVerdict: 'pass' });

      // And the bundle it left behind is one the integrity check accepts.
      const verified = JSON.parse(
        await run('verify-proof.ts', [root, '--allow-pending']),
      ) as Record<string, unknown>;
      expect(verified).toMatchObject({ ok: true, humanVerdict: 'pass' });
    },
    SPAWNS,
  );

  it(
    'refuses an input with no --input path rather than doing something else',
    async () => {
      const root = await pendingBundle();
      await expect(run('sign-verdict.ts', [root])).rejects.toThrow(/requires --input/);
    },
    SPAWNS,
  );
});

describe('verify:proof', () => {
  it(
    'refuses a pending crew bundle by default, which is the release gate holding',
    async () => {
      const root = await pendingBundle();
      await expect(run('verify-proof.ts', [root])).rejects.toThrow(/PROOF_VERDICT_NOT_PASS/);
    },
    SPAWNS,
  );

  it(
    'verifies that same bundle under --allow-pending, which is the check that can pass',
    async () => {
      // Ticket 15's third criterion is "the evidence bundle verifies", and until this flag existed
      // there was no command in the repo that could ask it of a crew bundle: the default gate
      // refuses one for carrying no human verdict, which is by design and not a fault in the bundle.
      const root = await pendingBundle();
      const verified = JSON.parse(
        await run('verify-proof.ts', [root, '--allow-pending']),
      ) as Record<string, unknown>;
      expect(verified).toMatchObject({
        ok: true,
        requirePass: false,
        machineVerdict: 'not-evidenced',
        humanVerdict: 'pending',
      });
    },
    SPAWNS,
  );

  it(
    'still refuses a bundle whose bytes moved, flag or no flag',
    async () => {
      const root = await pendingBundle();
      await writeFile(join(root, 'SUMMARY.md'), 'tampered\n', 'utf8');
      await expect(run('verify-proof.ts', [root, '--allow-pending'])).rejects.toThrow(
        /PROOF_HASH_MISMATCH/,
      );
    },
    SPAWNS,
  );
});
