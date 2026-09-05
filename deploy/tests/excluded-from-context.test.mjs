// Tests `excluded_from_context()` from `scripts/deploy-cloud-service.sh`.
//
//   node deploy/tests/excluded-from-context.test.mjs      (or: pnpm test:wizard)
//
// It needs `bash` on PATH and nothing else. Git Bash satisfies that on Windows, which is where
// this repo is developed, so unlike `fetch-service-env.test.mjs` this one does not want a
// container.
//
// **Why this function is worth a committed test.** It is small, and it decides the wording of the
// one prompt in the deploy wizard that asks the operator to stop and think: whether the
// uncommitted files in the tree actually reach the image, and therefore whether the git tag on a
// 2 GB push describes the build or lies about it. Get it wrong in the permissive direction and a
// misdescribed image ships with a green line beside it; get it wrong in the strict direction and
// the warning fires on every run, which — as the wizard's own comment says — discriminates
// nothing and spends the credibility of the judgement it was protecting.
//
// It had a 26-case harness once. That harness lived in a scratchpad, was never committed, and is
// gone. This is its replacement, and it is committed.
//
// The function is *extracted* rather than sourced: `deploy-cloud-service.sh` runs its stages at
// the top level, so sourcing it would start a deploy. The extraction is asserted rather than
// assumed — if the function is renamed or reshaped, this fails loudly instead of silently testing
// nothing.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WIZARD = resolve(here, '../../scripts/deploy-cloud-service.sh');

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures += 1;
  }
};

/** Pulls the function's source out of the wizard, from its opening line to the `}` in column 0. */
const extractFunction = (source, name) => {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`${name}() {`));
  if (start === -1) throw new Error(`${name}() is not in ${WIZARD} — it was renamed or removed`);
  const end = lines.findIndex((line, index) => index > start && line === '}');
  if (end === -1) throw new Error(`${name}() has no closing brace in column 0`);
  return lines.slice(start, end + 1).join('\n');
};

const wizard = await readFile(WIZARD, 'utf8');
const fn = extractFunction(wizard, 'excluded_from_context');

// The extraction is only useful if it caught the real thing. These are load-bearing lines of the
// function; if they are gone, the file below is testing something else.
check(
  'the extracted function is the real one',
  fn.includes('DOCKERIGNORE') && fn.includes('base='),
);

const workspace = await mkdtemp(join(tmpdir(), 'vox-dockerignore-'));
const harnessPath = join(workspace, 'harness.sh');
await writeFile(
  harnessPath,
  [
    '#!/usr/bin/env bash',
    'set -uo pipefail',
    'DOCKERIGNORE="$1"; shift',
    fn,
    '',
    'for candidate in "$@"; do',
    '  if excluded_from_context "$candidate"; then echo "EXCLUDED"; else echo "INCLUDED"; fi',
    'done',
    '',
  ].join('\n'),
  'utf8',
);

const run = (ignorePath, paths) =>
  new Promise((done, fail) => {
    execFile('bash', [harnessPath, ignorePath, ...paths], (error, stdout) => {
      // A non-zero exit is expected: the last path may be "not excluded", which is a `return 1`.
      if (error && typeof stdout !== 'string') return fail(error);
      done(stdout.trim().split('\n'));
    });
  });

const withIgnore = async (contents, cases) => {
  const path = join(workspace, `ignore-${Math.random().toString(36).slice(2)}`);
  await writeFile(path, contents, 'utf8');
  const verdicts = await run(
    path,
    cases.map(([candidate]) => candidate),
  );
  cases.forEach(([candidate, expected, why], index) => {
    check(
      `${expected === 'EXCLUDED' ? 'excludes' : 'keeps  '} ${candidate}${why ? ` (${why})` : ''}`,
      verdicts[index] === expected,
      `got ${verdicts[index]}`,
    );
  });
};

const IGNORE = [
  '# a comment, and the blank line under it',
  '',
  'node_modules',
  '**/node_modules',
  '.git',
  '.gitignore',
  '.scratch',
  'deploy/README.md',
  'dist/',
  './.env.example',
  '*.pem',
  '.env.*',
  '**/*.test.ts',
  '',
].join('\n');

console.log('\nthe patterns a .dockerignore actually carries');
await withIgnore(IGNORE, [
  // Exact paths, which is what a named file in the ignore file means.
  ['deploy/README.md', 'EXCLUDED', 'an exact path'],
  ['.gitignore', 'EXCLUDED', 'the file that has been uncommitted here for weeks'],
  // The pattern is normalised; the path is not, because `git status` never emits a `./` prefix.
  // What a `./`-prefixed *path* does here is therefore incidental and is deliberately not pinned.
  ['.env.example', 'EXCLUDED', 'the pattern had its ./ stripped'],

  // Directories, and everything beneath them.
  ['.scratch/cloud-phase/map.md', 'EXCLUDED', 'under a named directory'],
  ['dist/agent/index.js', 'EXCLUDED', 'the pattern named it with a trailing slash'],
  ['packages/production/node_modules/tsx/package.json', 'EXCLUDED', 'the same name at depth'],

  // Globs, which the function reads against the basename.
  ['certs/server.pem', 'EXCLUDED', 'a basename glob'],
  ['.env.local', 'EXCLUDED', 'a dotted glob'],
  ['packages/production/tests/cloud-host.test.ts', 'EXCLUDED', 'a **/ glob at depth'],

  // The discriminations that matter: a warning that fires on these would fire on everything.
  ['deploy/README.mdx', 'INCLUDED', 'a longer name is not the named file'],
  ['deploy/READMExmd', 'INCLUDED', 'the . in the pattern is not a wildcard'],
  ['src/dist-tools/build.ts', 'INCLUDED', 'a prefix of a directory name is not that directory'],
  ['scratch/notes.md', 'INCLUDED', 'not the dotted .scratch'],
  ['packages/production/src/ipc/cloud-host.ts', 'INCLUDED', 'a .ts file is not a .test.ts file'],
  ['deploy/pemphigus.txt', 'INCLUDED', 'the glob is anchored to the extension'],
  ['Dockerfile', 'INCLUDED', 'named by nothing'],

  // `git status --porcelain --untracked-files=normal` collapses an untracked directory to a
  // trailing-slash entry. Both of these arrive in exactly that shape.
  ['.scratch/', 'EXCLUDED', 'an untracked directory, collapsed by git'],
  ['certs.pem/', 'EXCLUDED', 'a collapsed directory still has to meet the basename glob'],
  ['untracked-dir/', 'INCLUDED', 'a collapsed directory nothing names'],
]);

/**
 * A negation makes the whole file undecidable for a matcher this size: `!keep.me` means the last
 * matching pattern wins, and this function does not track order. Returning "not excluded" for
 * everything is the safe direction — it over-warns rather than under-warns, and an over-warning
 * is visible where a missing one is not.
 */
console.log('\na .dockerignore carrying a negation');
await withIgnore(['node_modules', '!node_modules/keep', ''].join('\n'), [
  ['node_modules/anything', 'INCLUDED', 'the whole file is abandoned, deliberately'],
  ['deploy/README.md', 'INCLUDED', 'likewise'],
]);

console.log('\nno .dockerignore at all');
const verdict = await run(join(workspace, 'does-not-exist'), ['anything']);
check(
  'nothing is excluded when the file is absent',
  verdict[0] === 'INCLUDED',
  `got ${verdict[0]}`,
);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
