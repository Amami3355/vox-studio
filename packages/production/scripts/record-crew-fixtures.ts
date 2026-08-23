/**
 * Records production stdout for the crew's Python tests.
 *
 * The crew's tool tests replay envelopes rather than running a service, and a hand-written
 * envelope only proves the test author and the test agree. These are the bytes the command
 * surface actually emits, produced by the same handlers the dispatcher calls, so a change to
 * the envelope shape shows up as a fixture diff instead of as a green Python suite.
 *
 * Only the discovery commands are recorded here, and only the smallest projection among them.
 * The five projections total ~220 KB; committing them all would duplicate generated contract
 * data that drifts the moment the catalog is rebuilt, and the client is not what their
 * content tests. The other categories are exercised through the crew's stub launcher.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { handleContractIndex, handleContractShow } from '../src/contracts/handlers';
import { type ContractCategory, contractCategorySchema } from '../src/contracts/schemas';

const flag = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

// Resolved from this file, not the working directory: pnpm runs package scripts from the
// package root and the crew lives outside it.
const out = resolve(
  flag('out') ?? resolve(import.meta.dirname, '../../../services/agents/tests/fixtures'),
);
const category: ContractCategory = contractCategorySchema.parse(flag('category') ?? 'checks');

// The recorded byte string is the dispatcher's stdout, not the envelope object: one JSON line
// and the newline that terminates it. Verbatim pass-through is only testable against that.
const stdout = (envelope: unknown): string => `${JSON.stringify(envelope)}\n`;

await mkdir(out, { recursive: true });
const written = [
  ['contract-index.stdout', stdout(handleContractIndex())],
  [`contract-show-${category}.stdout`, stdout(handleContractShow(category))],
] as const;

for (const [name, contents] of written) {
  await writeFile(resolve(out, name), contents, 'utf8');
}

process.stdout.write(
  `${JSON.stringify({ ok: true, out, files: written.map(([name, contents]) => ({ name, bytes: Buffer.byteLength(contents) })) })}\n`,
);
