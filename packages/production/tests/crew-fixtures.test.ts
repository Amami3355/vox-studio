import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resultEnvelopeSchema } from '../src/contracts/schemas';

/**
 * The crew's Python tests replay recorded stdout rather than running a service, which buys
 * them determinism and costs them a way to notice the contract moving underneath. This is
 * that way: every fixture the crew replays has to be an envelope this service could emit.
 *
 * It reads the files as bytes rather than importing them, because the thing being asserted
 * includes their exact framing — one JSON line, terminated.
 */

const fixtures = resolve(import.meta.dirname, '../../../services/agents/tests/fixtures');

describe('the crew replays envelopes this service could have written', () => {
  it('parses every recorded fixture against the current contract', async () => {
    const names = (await readdir(fixtures)).filter((name) => name.endsWith('.stdout'));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const raw = await readFile(join(fixtures, name), 'utf8');
      expect(raw.endsWith('\n'), `${name} is not a terminated stdout line`).toBe(true);
      expect(raw.trimEnd().includes('\n'), `${name} is more than one line`).toBe(false);
      expect(() => resultEnvelopeSchema.parse(JSON.parse(raw)), name).not.toThrow();
    }
  });
});
