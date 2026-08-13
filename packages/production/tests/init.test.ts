import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type CommandFixture, createCommandFixture } from './command-fixture';

let fixture: CommandFixture | null = null;
afterEach(async () => fixture?.cleanup());

describe('run init', () => {
  it('creates only the non-existing Run root and snapshots the request', async () => {
    fixture = await createCommandFixture();
    const before = await readFile(fixture.requestPath, 'utf8');
    const result = await fixture.service.init({
      requestPath: fixture.requestPath,
      out: fixture.runRoot,
    });

    expect(result.exitCode).toBe(0);
    expect(result.envelope).toMatchObject({
      command: 'run.init',
      outcome: 'succeeded',
      run: { id: 'run-command-test', stage: 'initialized' },
      data: { created: true },
    });
    await expect(access(join(fixture.runRoot, 'run.json'))).resolves.toBeUndefined();
    expect(await readFile(fixture.requestPath, 'utf8')).toBe(before);
    expect(fixture.network.request).not.toHaveBeenCalled();
  });

  it('uses exit 2 for malformed input and refuses an existing output root', async () => {
    fixture = await createCommandFixture();
    await readFile(fixture.requestPath);
    const first = await fixture.service.init({
      requestPath: fixture.requestPath,
      out: fixture.runRoot,
    });
    const repeated = await fixture.service.init({
      requestPath: fixture.requestPath,
      out: fixture.runRoot,
    });

    expect(first.exitCode).toBe(0);
    expect(repeated.exitCode).toBe(1);
    expect(repeated.envelope.error?.code).toBe('RUN_ROOT_EXISTS');
  });

  it('returns a uniform identified envelope and exit 2 for malformed request JSON', async () => {
    fixture = await createCommandFixture();
    await writeFile(fixture.requestPath, '{broken');
    const result = await fixture.service.init({
      requestPath: fixture.requestPath,
      out: fixture.runRoot,
    });

    expect(result).toMatchObject({
      exitCode: 2,
      envelope: {
        command: 'run.init',
        outcome: 'failed',
        data: null,
        artifacts: [],
        next: [],
      },
    });
  });
});
