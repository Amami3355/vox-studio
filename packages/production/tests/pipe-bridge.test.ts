import { mkdtemp, rm } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type ProductionPipeBridge,
  startProductionPipeBridge,
} from '../src/ipc/pipe-bridge';
import { compilePipeBridge, pipeName, pipePath } from './ipc-fixture';

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => cleanup?.());

describe('production pipe bridge', () => {
  it(
    'relays bytes between the public ACL pipe and the private host pipe',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'vox-pipe-bridge-'));
      const executable = join(root, 'vox-pipe-bridge.exe');
      const publicName = pipeName();
      const privateName = pipeName();
      const host = createServer((socket) => {
        let received = Buffer.alloc(0);
        socket.on('data', (data: Buffer) => {
          received = Buffer.concat([received, data]);
          if (received.length < 4) return;
          const frameLength = received.readUInt32LE(0) + 4;
          if (received.length >= frameLength) socket.end(received.subarray(0, frameLength));
        });
      });
      let bridge: ProductionPipeBridge | null = null;
      cleanup = async () => {
        await bridge?.close();
        await new Promise<void>((resolveClose) => host.close(() => resolveClose()));
        await rm(root, { recursive: true, force: true });
      };

      await compilePipeBridge(executable);
      await new Promise<void>((resolveListen, rejectListen) => {
        host.once('error', rejectListen);
        host.listen(pipePath(privateName), resolveListen);
      });
      bridge = await startProductionPipeBridge({
        executable,
        publicPipeName: publicName,
        privatePipeName: privateName,
      });

      const payload = Buffer.from('northbridge');
      const frame = Buffer.allocUnsafe(4 + payload.length);
      frame.writeUInt32LE(payload.length, 0);
      payload.copy(frame, 4);
      const echoed = await new Promise<Buffer>((resolveEcho, rejectEcho) => {
        const chunks: Buffer[] = [];
        const client = createConnection(pipePath(publicName));
        client.once('connect', () => client.write(frame));
        client.on('data', (chunk: Buffer) => chunks.push(chunk));
        client.once('end', () => resolveEcho(Buffer.concat(chunks)));
        client.once('error', rejectEcho);
      });

      expect(echoed).toEqual(frame);
    },
    30_000,
  );
});
