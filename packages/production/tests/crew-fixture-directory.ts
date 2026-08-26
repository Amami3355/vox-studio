import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * The directory the crew's Python tests replay, read the one way both guards over it need.
 *
 * Two tests ask different questions of these files — one whether each is an envelope the
 * service could emit, the other whether the recorded ones still match what the handlers emit
 * now — and both were resolving the path and walking the directory themselves. One walk, so a
 * fixture that arrives is a fixture both guards see.
 */
export const CREW_FIXTURE_DIRECTORY = resolve(
  import.meta.dirname,
  '../../../services/agents/tests/fixtures',
);

/**
 * Every recorded stdout line in that directory, by file name, as bytes rather than as parsed
 * JSON: what both guards assert includes the exact framing, so nothing may normalise it on the
 * way in.
 */
export const readCrewFixtures = async (): Promise<Map<string, string>> => {
  const names = (await readdir(CREW_FIXTURE_DIRECTORY)).filter((name) => name.endsWith('.stdout'));
  const entries = await Promise.all(
    names.map(
      async (name) => [name, await readFile(join(CREW_FIXTURE_DIRECTORY, name), 'utf8')] as const,
    ),
  );
  return new Map(entries);
};
