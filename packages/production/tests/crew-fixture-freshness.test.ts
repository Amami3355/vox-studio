import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RECORD_FIXTURES_COMMAND,
  crewFixtureDrift,
  recordedCrewFixtures,
} from '../src/contracts/crew-fixture-recording';

/**
 * The schema guard beside this one proves a fixture is an envelope the service could emit. A
 * fixture recorded from last month's catalog satisfies that perfectly, which is the hole this
 * closes: the crew assembles its instructions from these bodies, so a stale one means the
 * Python suite is green against a catalog that no longer exists.
 *
 * The contract commands take no run identity and no clock, so a handler's stdout is a pure
 * function of the generated contracts. That makes the check exact — recorded bytes against
 * emitted bytes — rather than a digest sidecar that would be a second source of truth.
 */

const fixtures = resolve(import.meta.dirname, '../../../services/agents/tests/fixtures');

const onDisk = async (): Promise<Map<string, string>> => {
  const names = (await readdir(fixtures)).filter((name) => name.endsWith('.stdout'));
  const entries = await Promise.all(
    names.map(async (name) => [name, await readFile(join(fixtures, name), 'utf8')] as const),
  );
  return new Map(entries);
};

describe('the recorded fixtures match what the handlers emit now', () => {
  it('reports no drift for the fixtures in the tree', async () => {
    expect(crewFixtureDrift(await onDisk())).toEqual([]);
  });

  it('records one fixture for the index and one for every category it publishes', () => {
    expect([...recordedCrewFixtures().keys()].sort()).toEqual([
      'contract-index.stdout',
      'contract-show-catalog.stdout',
      'contract-show-checks.stdout',
      'contract-show-language.stdout',
      'contract-show-plan.stdout',
      'contract-show-protocol.stdout',
    ]);
  });
});

describe('drift is detected and says what to run', () => {
  it('fails a fixture whose bytes have moved', () => {
    const staled = new Map(recordedCrewFixtures());
    const name = 'contract-show-catalog.stdout';
    staled.set(name, `${(staled.get(name) as string).trimEnd()} \n`);
    const drift = crewFixtureDrift(staled);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain(name);
    expect(drift[0]).toContain(RECORD_FIXTURES_COMMAND);
  });

  it('fails a category the index publishes with no recorded fixture', () => {
    const missing = new Map(recordedCrewFixtures());
    missing.delete('contract-show-protocol.stdout');
    const drift = crewFixtureDrift(missing);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('contract-show-protocol.stdout');
    expect(drift[0]).toContain(RECORD_FIXTURES_COMMAND);
  });

  it('reports every drifted fixture rather than only the first', () => {
    const broken = new Map(recordedCrewFixtures());
    broken.delete('contract-index.stdout');
    broken.set('contract-show-plan.stdout', '{"not":"what the handler emits"}\n');
    expect(crewFixtureDrift(broken)).toHaveLength(2);
  });

  it('ignores the authored run envelopes it does not record', () => {
    const withAuthored = new Map(recordedCrewFixtures());
    withAuthored.set('run-record-succeeded.stdout', 'anything at all\n');
    expect(crewFixtureDrift(withAuthored)).toEqual([]);
  });
});
