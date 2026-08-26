/**
 * Records production stdout for the crew's Python tests.
 *
 * The crew's tool tests replay envelopes rather than running a service, and a hand-written
 * envelope only proves the test author and the test agree. These are the bytes the command
 * surface actually emits, produced by the same handlers the dispatcher calls, so a change to
 * the envelope shape shows up as a fixture diff instead of as a green Python suite.
 *
 * Every projection the contract index publishes is recorded, not the smallest one. That was
 * the policy while the fixtures were a convenience for the client, which was indifferent to
 * what a projection carried; the planner assembles its instructions from all five, so a
 * stand-in for any of them is a suite green against a catalog that does not exist.
 *
 * What to write is not decided here. `crew-fixture-recording.ts` holds the names and the
 * bytes, and the guard that fails a stale recording reads the same module, so re-recording
 * and checking can never disagree about what belongs on disk.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  INDEX_FIXTURE,
  recordedCrewFixtures,
  showFixtureName,
} from '../src/contracts/crew-fixture-recording';
import { contractCategorySchema } from '../src/contracts/schemas';

const flag = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

// Resolved from this file, not the working directory: pnpm runs package scripts from the
// package root and the crew lives outside it.
const out = resolve(
  flag('out') ?? resolve(import.meta.dirname, '../../../services/agents/tests/fixtures'),
);

// `--category` narrows the write to one projection and the index beside it. The default is
// every fixture, because a partial re-record is what leaves one projection behind after a
// catalog rebuild — the failure this script's own guard exists to catch.
const only = flag('category');
const narrowed = only === undefined ? null : showFixtureName(contractCategorySchema.parse(only));

const fixtures = [...recordedCrewFixtures()].filter(
  ([name]) => narrowed === null || name === INDEX_FIXTURE || name === narrowed,
);

await mkdir(out, { recursive: true });
for (const [name, contents] of fixtures) {
  await writeFile(resolve(out, name), contents, 'utf8');
}

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    out,
    files: fixtures.map(([name, contents]) => ({ name, bytes: Buffer.byteLength(contents) })),
  })}\n`,
);
