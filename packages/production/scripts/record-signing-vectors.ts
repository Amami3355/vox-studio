/**
 * Records the request and response signing rules for the crew's Python client.
 *
 * `HttpProductionClient` reimplements `payloadRequestSigningText`, `artifactRequestSigningText`
 * and `responseSigningText` in Python, and the two copies are held together by this file rather
 * than by either being run against the other — a test where both sides are wrong in the same way
 * is exactly the failure that would otherwise hide at a language boundary.
 *
 * So the definition is recorded here, by the definition, and both suites assert against the
 * recording: `packages/production/tests/signing-vectors.test.ts` and
 * `services/agents/tests/test_signing_vectors.py`.
 *
 * **Running this is a protocol change, not a fix.** These bytes are the wire format and a
 * deployed service verifies against them, so a session that re-records because a test went red
 * has almost certainly broken the change it was making rather than fixed the recording. The
 * cases exist for what a second implementation gets wrong, and the reason for each is written in
 * the TypeScript test rather than here, where only one of the two readers would find it.
 *
 * The output is not formatted by biome — `biome.json` ignores it for the same reason it ignores
 * the recorded artifact bodies next to it: a formatter and a recorder editing one file take
 * turns undoing each other.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type ArtifactIpcRequest,
  type IpcResponse,
  type PayloadIpcRequest,
  artifactRequestSigningText,
  payloadRequestSigningText,
  responseSigningText,
  signIpc,
} from '../src/ipc/authentication';

/** Test material, and only ever that. It is committed because a vector without one proves nothing. */
const SECRET = 'vox-signing-vector-secret-0123456789-abcdef';

const OUTPUT = join(
  import.meta.dirname,
  '../../../services/agents/tests/fixtures/ipc-signing-vectors.json',
);

const payload: Omit<PayloadIpcRequest, 'mac'> = {
  protocolVersion: 1,
  requestId: '3f2a1c44-9f1e-4b6a-8c2d-7e5b0a9d1c33',
  timestampMs: 1757030400000,
  command: 'run.validate',
  runId: 'run-vector-01',
  // Authored out of order and carrying non-ASCII on purpose. See the TypeScript test.
  payload: {
    zeta: [1, 2, 3],
    alpha: 'an em dash — and a café',
    beta: { nested: true, alpha: null },
  },
};

const empty: Omit<PayloadIpcRequest, 'mac'> = {
  protocolVersion: 1,
  requestId: '0c9d8e7f-6a5b-4c3d-9e1f-2a3b4c5d6e7f',
  timestampMs: 1757030400001,
  command: 'contract.index',
  runId: null,
  payload: null,
};

/** U+1F600, a supplementary character: the surrogate pair D83D DE00 in UTF-16. */
const SUPPLEMENTARY_KEY = String.fromCodePoint(0x1f600);
/** U+FFFD, which is above every lead surrogate as a code unit and below U+1F600 as a code point. */
const BMP_KEY = String.fromCodePoint(0xfffd);

/**
 * Numbers and member order, which are the two things `JSON.stringify` does for free here and a
 * reimplementation has to be told.
 *
 * `pointMsPerUnit` is authored as an integral number because that is what a calibration point
 * is, and it is the case Python gets wrong on its own: `json.dumps(54.0)` is `54.0` and this
 * side writes `54`. JSON cannot carry the difference between `54` and `54.0`, so `floatFields`
 * names the members the Python half must read back as floats — without it the recording would
 * hand that side an integer and prove nothing.
 *
 * The two exotic keys are the member-order case. `sorted()` in Python orders by code point;
 * JCS orders by UTF-16 code unit, so a supplementary character sorts on its lead surrogate and
 * lands *below* U+FFFD rather than above it. Any pair either side of U+E000 discriminates, and
 * this is the shortest one that does.
 *
 * `beatCount` is `Number.MAX_SAFE_INTEGER`, which is the largest integer this rule carries at
 * all: one digit more and the two sides hold different numbers for the same document.
 */
const numbers: Omit<PayloadIpcRequest, 'mac'> = {
  protocolVersion: 1,
  requestId: '7d6c5b4a-3928-4170-8e6d-5c4b3a291807',
  timestampMs: 1757030400003,
  command: 'run.validate',
  runId: 'run-vector-02',
  payload: {
    [SUPPLEMENTARY_KEY]: 'a supplementary character, which sorts on its lead surrogate',
    [BMP_KEY]: 'a BMP character above every lead surrogate',
    pointMsPerUnit: 54,
    uncertaintyMargin: 0.12,
    beatCount: 9007199254740991,
  },
};

const artifact: Omit<ArtifactIpcRequest, 'mac'> = {
  protocolVersion: 1,
  requestId: 'a1b2c3d4-e5f6-4718-9a0b-1c2d3e4f5a6b',
  timestampMs: 1757030400002,
  runId: 'run-vector-01',
  descriptor: {
    kind: 'plan_snapshot',
    path: 'inputs/plans/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08.json',
    sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  },
};

const response: Omit<IpcResponse, 'mac'> = {
  protocolVersion: 1,
  requestId: '5e4d3c2b-1a09-4f8e-b7d6-c5b4a3928170',
  exitCode: 0,
  stdoutBase64: Buffer.from('{"outcome":"succeeded"}\n', 'utf8').toString('base64'),
  stderrBase64: '',
};

const recorded = [
  {
    name: 'payload request with an object payload',
    kind: 'payload' as const,
    request: payload,
    signingText: payloadRequestSigningText(payload),
  },
  {
    name: 'payload request naming no Run and carrying no payload',
    kind: 'payload' as const,
    request: empty,
    signingText: payloadRequestSigningText(empty),
  },
  {
    name: 'payload request carrying numbers and members JSON cannot order for you',
    kind: 'payload' as const,
    request: numbers,
    signingText: payloadRequestSigningText(numbers),
    // The members the Python half reads back as floats. JSON has one number type and this
    // recording is JSON, so without this the case that exists for `54.0` would be handed `54`.
    floatFields: ['pointMsPerUnit', 'uncertaintyMargin'],
  },
  {
    name: 'artifact request for a published descriptor',
    kind: 'artifact' as const,
    request: artifact,
    signingText: artifactRequestSigningText(artifact),
  },
  {
    name: 'response to a command that succeeded',
    kind: 'response' as const,
    request: response,
    signingText: responseSigningText(response),
  },
].map((entry) => ({ ...entry, mac: signIpc(SECRET, entry.signingText) }));

writeFileSync(OUTPUT, `${JSON.stringify({ secret: SECRET, cases: recorded }, null, 2)}\n`, 'utf8');
console.info(`Recorded ${recorded.length} signing vectors to ${OUTPUT}`);
