import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type CommandFixture, createCommandFixture } from './command-fixture';

let fixture: CommandFixture | null = null;
afterEach(async () => fixture?.cleanup());

const snapshot = async (
  root: string,
): Promise<Record<string, { bytes: string; mtimeMs: number }>> => {
  const output: Record<string, { bytes: string; mtimeMs: number }> = {};
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else {
        const relative = path.slice(root.length + 1);
        output[relative] = {
          bytes: (await readFile(path)).toString('base64'),
          mtimeMs: (await stat(path)).mtimeMs,
        };
      }
    }
  };
  await walk(root);
  return output;
};

describe('run status', () => {
  it('reopens, verifies and reports without changing any public or private byte', async () => {
    fixture = await createCommandFixture();
    await fixture.service.init({ requestPath: fixture.requestPath, out: fixture.runRoot });
    const beforePublic = await snapshot(fixture.runRoot);
    const beforePrivate = await snapshot(fixture.ledgerRoot);
    const reopened = await fixture.service.status({ runRoot: fixture.runRoot });

    expect(reopened.exitCode).toBe(0);
    expect(reopened.envelope).toMatchObject({
      command: 'run.status',
      run: { stage: 'initialized' },
      data: { staleStages: [], lastOutcome: 'succeeded' },
    });
    expect(await snapshot(fixture.runRoot)).toEqual(beforePublic);
    expect(await snapshot(fixture.ledgerRoot)).toEqual(beforePrivate);
    expect(fixture.network.request).not.toHaveBeenCalled();
  });
});
