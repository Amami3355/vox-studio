import { describe, expect, it } from 'vitest';
import {
  RECORD_FIXTURES_COMMAND,
  crewFixtureDrift,
  recordedCrewFixtures,
} from '../src/contracts/crew-fixture-recording';
import { readCrewFixtures } from './crew-fixture-directory';

/**
 * The schema guard next door proves a fixture is an envelope the service could emit. A fixture
 * recorded from last month's catalog satisfies that perfectly, which is the hole this closes:
 * the crew assembles its instructions from these bodies, so a stale one means the Python suite
 * is green against a catalog that no longer exists.
 *
 * Why the comparison can be exact rather than approximate is argued once, in
 * `crew-fixture-recording.ts`, and not repeated here.
 */

const RECORDED = [
  'contract-index.stdout',
  'contract-show-catalog.stdout',
  'contract-show-checks.stdout',
  'contract-show-language.stdout',
  'contract-show-plan.stdout',
  'contract-show-protocol.stdout',
];

/** A recorded fixture's bytes, from the set the module says it would write now. */
const emitted = (name: string): string => {
  const contents = recordedCrewFixtures().get(name);
  if (contents === undefined) throw new Error(`${name} is not a recorded fixture`);
  return contents;
};

describe('the recorded fixtures match what the handlers emit now', () => {
  it('reads the directory the crew actually replays', async () => {
    const onDisk = await readCrewFixtures();
    // Without this the suite below could be green against an empty map — a mistyped path
    // would silently agree that nothing has drifted. Authored envelopes prove the reader is
    // pointed at the whole directory and not only at what this guard records.
    expect([...onDisk.keys()].filter((name) => RECORDED.includes(name)).sort()).toEqual(RECORDED);
    expect([...onDisk.keys()].some((name) => name.startsWith('run-'))).toBe(true);
  });

  it('reports no drift for the fixtures in the tree', async () => {
    expect(crewFixtureDrift(await readCrewFixtures())).toEqual([]);
  });

  it('records one fixture for the index and one for every category it publishes', () => {
    expect([...recordedCrewFixtures().keys()].sort()).toEqual(RECORDED);
  });
});

describe('drift is detected and says what to run', () => {
  it('fails a fixture whose bytes have moved', () => {
    const staled = new Map(recordedCrewFixtures());
    const name = 'contract-show-catalog.stdout';
    staled.set(name, `${emitted(name).trimEnd()} \n`);
    const drift = crewFixtureDrift(staled);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain(name);
    expect(drift[0]).toContain(RECORD_FIXTURES_COMMAND);
  });

  it('names where a same-length recording diverges rather than its byte count', () => {
    const staled = new Map(recordedCrewFixtures());
    const name = 'contract-show-checks.stdout';
    const current = emitted(name);
    // The failure a rebuilt catalog actually produces: a summary reworded in place, leaving a
    // file exactly as long as the one the handler emits.
    staled.set(name, current.replace('compiler', 'kompiler'));
    const [message] = crewFixtureDrift(staled);
    expect(message).toContain('diverge at offset');
    expect(message).toContain('kompiler');
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
