import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type ArtifactIpcRequest,
  type IpcResponse,
  type PayloadIpcRequest,
  artifactRequestSigningText,
  payloadRequestSigningText,
  responseSigningText,
  signIpc,
} from '../src/ipc/authentication';
import { CREW_FIXTURE_DIRECTORY } from './crew-fixture-directory';

/**
 * One signing rule, two languages, and neither checked against the other.
 *
 * `HttpProductionClient` reimplements `payloadRequestSigningText` and
 * `artifactRequestSigningText` in Python, and the cheap way to test that would be to point it at
 * a host and see whether the request is admitted. That test passes when both sides are wrong in
 * the same way, which is not hypothetical here — this repository has already had a measurement
 * agree with itself and be wrong.
 *
 * So the definition is recorded once, as text and as a MAC over a fixed secret, and each side
 * asserts against the recording. This file is the TypeScript half. `test_signing_vectors.py` is
 * the Python half and reads the same file.
 *
 * **The cases are chosen for what a second implementation gets wrong**, not for coverage:
 *
 * - a payload whose keys are authored out of order, because the field is canonicalised rather
 *   than `JSON.stringify`d and a reimplementation that forgets is green until a caller happens
 *   to author them sorted;
 * - a string carrying an em dash and an accented letter, because the length prefix counts UTF-8
 *   bytes and a reimplementation counting characters agrees with this one on ASCII forever;
 * - a request naming no Run and carrying no payload, because both become `0:` and a
 *   reimplementation that omits the fields instead produces a shorter text that still looks
 *   plausible;
 * - an artifact request, whose domain tag must differ from the payload one;
 * - a response, because the crew verifies what answered the socket rather than trusting it,
 *   and that rule crosses the language boundary the same way the request rules do.
 *
 * **Re-recording it is a decision, not a fix.** The bytes here are the wire format: if this test
 * fails, either the signing rule changed — which is a protocol change that strands every deployed
 * caller — or the change that broke it is the bug.
 */

type SigningVector = {
  secret: string;
  cases: {
    name: string;
    kind: 'payload' | 'artifact' | 'response';
    request: Record<string, unknown>;
    signingText: string;
    mac: string;
  }[];
};

const VECTORS = JSON.parse(
  readFileSync(join(CREW_FIXTURE_DIRECTORY, 'ipc-signing-vectors.json'), 'utf8'),
) as SigningVector;

const signingTextFor = (entry: SigningVector['cases'][number]): string => {
  if (entry.kind === 'payload') {
    return payloadRequestSigningText(entry.request as unknown as Omit<PayloadIpcRequest, 'mac'>);
  }
  if (entry.kind === 'artifact') {
    return artifactRequestSigningText(entry.request as unknown as Omit<ArtifactIpcRequest, 'mac'>);
  }
  return responseSigningText(entry.request as unknown as Omit<IpcResponse, 'mac'>);
};

describe('the recorded signing vectors', () => {
  it('records a case for each shape a caller has to sign', () => {
    // Without this the suite below is green over an empty list, and a reimplementation would be
    // checked against nothing at all.
    expect(VECTORS.cases.map((entry) => entry.kind).sort()).toEqual([
      'artifact',
      'payload',
      'payload',
      'response',
    ]);
    expect(VECTORS.secret.length).toBeGreaterThanOrEqual(32);
  });

  it.each(VECTORS.cases)('reproduces the signing text of $name', (entry) => {
    expect(signingTextFor(entry)).toBe(entry.signingText);
  });

  it.each(VECTORS.cases)('reproduces the MAC of $name', (entry) => {
    expect(signIpc(VECTORS.secret, entry.signingText)).toBe(entry.mac);
  });

  it('counts the length prefix in bytes rather than in characters', () => {
    // The assertion above would hold with either rule if the recording were ASCII. This names
    // the property directly, so the reason the case exists cannot be lost by editing it.
    const withText = VECTORS.cases.find((entry) => entry.signingText.includes('em dash'));
    if (!withText) throw new Error('The vector carrying non-ASCII text is gone.');
    const payload = (withText.request as { payload: Record<string, unknown> }).payload;
    const canonical = withText.signingText.split('\n').at(-1) as string;
    const [declared, ...rest] = canonical.split(':');

    expect(Buffer.byteLength(rest.join(':'), 'utf8')).toBe(Number(declared));
    expect(Buffer.byteLength(rest.join(':'), 'utf8')).toBeGreaterThan(rest.join(':').length);
    expect(Object.keys(payload)).not.toEqual([...Object.keys(payload)].sort());
  });
});
