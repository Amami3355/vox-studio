import { afterEach, describe, expect, it } from 'vitest';
import { type ProductionIpcHost, createProductionIpcHost } from '../src/ipc/host';
import { type CommandFixture, createCommandFixture } from './command-fixture';
import { IPC_SECRET, callPipe, pipeName, pipePath, signedRequest } from './ipc-fixture';

let fixture: CommandFixture | null = null;
let host: ProductionIpcHost | null = null;
afterEach(async () => {
  await host?.close();
  await fixture?.cleanup();
  host = null;
  fixture = null;
});

describe('authenticated Windows named-pipe IPC', () => {
  it('returns an authenticated framed contract response without TCP or HTTP', async () => {
    fixture = await createCommandFixture();
    const path = pipePath(pipeName());
    host = createProductionIpcHost({
      pipePath: path,
      secret: IPC_SECRET,
      service: fixture.service,
    });
    await host.listen();

    const response = await callPipe(
      path,
      signedRequest(fixture.root, ['production', 'contract', 'index']),
    );
    const envelope = JSON.parse(response.stdout) as { command: string; outcome: string };

    expect(response).toMatchObject({ exitCode: 0, stderr: '' });
    expect(response.stdout.endsWith('\n')).toBe(true);
    expect(envelope).toMatchObject({ command: 'contract.index', outcome: 'succeeded' });
  });

  it('drops invalid, stale and replayed requests without dispatch', async () => {
    fixture = await createCommandFixture();
    const path = pipePath(pipeName());
    host = createProductionIpcHost({
      pipePath: path,
      secret: IPC_SECRET,
      service: fixture.service,
    });
    await host.listen();
    const good = signedRequest(fixture.root, ['production', 'contract', 'index']);
    await callPipe(path, good);

    await expect(callPipe(path, good)).rejects.toThrow();
    await expect(
      callPipe(path, { ...signedRequest(fixture.root, []), mac: '0'.repeat(64) }),
    ).rejects.toThrow();
    await expect(
      callPipe(path, signedRequest(fixture.root, [], { timestampMs: Date.now() - 60_000 })),
    ).rejects.toThrow();
  });

  it('refuses every non-pipe endpoint shape', async () => {
    fixture = await createCommandFixture();
    expect(() =>
      createProductionIpcHost({
        pipePath: 'http://127.0.0.1:8080',
        secret: IPC_SECRET,
        service: fixture!.service,
      }),
    ).toThrow(/named-pipe/i);
    expect(() =>
      createProductionIpcHost({
        pipePath: '127.0.0.1:8080',
        secret: IPC_SECRET,
        service: fixture!.service,
      }),
    ).toThrow(/named-pipe/i);
  });
});
