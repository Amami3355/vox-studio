import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createProductionIpcHost } from './host';
import { startProductionPipeBridge } from './pipe-bridge';
import {
  createConfiguredProductionService,
  required,
  resolveProductionServiceConfiguration,
} from './service-configuration';
import { resolveSocketTimeoutMs } from './socket-timeout';

const pipeNameFromPath = (value: string): string => {
  const prefix = '\\\\.\\pipe\\';
  if (!value.startsWith(prefix)) throw new TypeError('Production IPC pipe path is invalid.');
  return value.slice(prefix.length);
};

const publicPipePath = required(process.env, 'VOX_PIPE_PATH');
const publicPipeName = pipeNameFromPath(publicPipePath);
const privatePipeName = `vox-trusted-${randomUUID()}`;
const ipcSecret = required(process.env, 'VOX_IPC_TOKEN');

/**
 * The service is constructed by `service-configuration.ts`, which the cloud entry point calls too.
 * What remains in this file is the *local transport* and nothing else: the public pipe path, its
 * private counterpart, the bridge that forwards between them, and the shared secret those use.
 *
 * The construction sits here, before the socket timeout, because that is where it sat before the
 * extraction. Both read configuration and both can throw, so their order decides which variable an
 * operator with two things wrong is told about first — and a runbook that greps for the first line
 * of a failed start should not change because a function moved.
 *
 * ADR-0018 decision 7: the named pipe is the local transport permanently. This file does not branch
 * on a cloud topology and never should — `cloud-host.ts` is its sibling, not a mode of it.
 */
const service = createConfiguredProductionService(resolveProductionServiceConfiguration());

const socketTimeoutMs = resolveSocketTimeoutMs(process.env.VOX_IPC_SOCKET_TIMEOUT_MS);

const host = createProductionIpcHost({
  pipePath: `\\\\.\\pipe\\${privatePipeName}`,
  secret: ipcSecret,
  service,
  socketTimeoutMs,
});
await host.listen();
const pipeBridge = await startProductionPipeBridge({
  executable:
    process.env.VOX_PIPE_BRIDGE_HELPER ??
    resolve(import.meta.dirname, '../../dist/service/vox-pipe-bridge.exe'),
  publicPipeName,
  privatePipeName,
});
process.stderr.write('Vox Production service ready.\n');

const stop = async () => {
  await pipeBridge.close();
  await host.close();
  process.exitCode = 0;
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
