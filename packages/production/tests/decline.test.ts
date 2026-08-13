import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type CommandFixture, createCommandFixture } from './command-fixture';

let fixture: CommandFixture | null = null;
afterEach(async () => fixture?.cleanup());

describe('run decline', () => {
  it('persists a structured terminal decision without deleting a draft plan', async () => {
    fixture = await createCommandFixture();
    await fixture.service.init({ requestPath: fixture.requestPath, out: fixture.runRoot });
    const draft = join(fixture.runRoot, 'plan.json');
    await writeFile(draft, '{"draft":true}');
    const result = await fixture.service.decline({
      runRoot: fixture.runRoot,
      decisionPath: fixture.declinePath,
    });

    expect(result).toMatchObject({
      exitCode: 0,
      envelope: { outcome: 'declined', run: { stage: 'declined' } },
    });
    expect(await readFile(draft, 'utf8')).toBe('{"draft":true}');
    const later = await fixture.service.validate({
      runRoot: fixture.runRoot,
      planPath: fixture.planPath,
    });
    expect(later.exitCode).toBe(1);
    expect(later.envelope.error?.code).toBe('RUN_TERMINAL');
    expect(fixture.network.request).not.toHaveBeenCalled();
  });
});
