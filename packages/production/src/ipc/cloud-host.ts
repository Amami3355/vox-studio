import { resolve } from 'node:path';
import { ProductionPayloadSurface } from '../commands/payload-surface';
import { createProductionNetworkHost } from './network-host';
import {
  type VolumeProbe,
  assertPersistentVolumeMounted,
  assertWritesLandOnVolume,
} from './persistent-volume';
import {
  createConfiguredProductionService,
  required,
  resolveProductionServiceConfiguration,
} from './service-configuration';
import { resolveSocketTimeoutMs } from './socket-timeout';

/**
 * The cloud topology's assembly: the same `ProductionCommandService` the local service builds,
 * with ticket 06's network host in place of the pipe host and no bridge at all.
 *
 * **This is a second entry point, not a branch in the first.** `service-host.ts` is untouched and
 * remains the local service's startup. Ticket 07's reason, kept here because it is the thing a
 * later session will be tempted to undo: putting `if (process.env.CLOUD)` into `service-host.ts`
 * would place two deployment topologies in one file where a missing variable in either kills
 * both, and would make the local service's startup depend on cloud-shaped configuration being
 * absent.
 *
 * It performs no side effects at import. `cloud-service-host.ts` is the container's `CMD` and does
 * nothing but read `process.env` and call this, so that the assembly can be driven by a test.
 */
export type ProductionCloudHost = {
  port: number;
  address: string;
  socketTimeoutMs: number;
  close: () => Promise<void>;
};

export const startProductionCloudHost = async ({
  env = process.env,
  volumeProbe,
}: {
  env?: Record<string, string | undefined>;
  volumeProbe?: VolumeProbe;
} = {}): Promise<ProductionCloudHost> => {
  /**
   * Before anything else, and before the service is constructed.
   *
   * A `ProductionCommandService` built against a ledger root on the container's own filesystem is
   * indistinguishable from a working one until the platform restarts the container and the Runs
   * are gone. The check that prevents it therefore runs before the object that would hide it
   * exists.
   */
  const volumeRoot = required(env, 'VOX_VOLUME_ROOT');
  assertPersistentVolumeMounted(volumeRoot, volumeProbe);

  /**
   * **This transport's own secret, not the pipe transport's.** The two sign under different domain
   * tags — `VOX-IPC-PAYLOAD-REQUEST-1` against the argv path's `VOX-IPC-REQUEST-1` — for the reason
   * ticket 06 recorded: with one shared prefix a captured argv MAC would authenticate a payload
   * request over the other socket. Separating the *domains* closed that hole; separating the *key
   * material* means a leak of either transport's secret does not hand the attacker the other, and
   * it is what makes this ticket's "reads no pipe configuration" rule true rather than nominal.
   *
   * The pipe transport's variables are deliberately not named anywhere in this file — a test scans
   * it for their literals, so naming one even to disclaim it would defeat the guard. They are in
   * `service-host.ts`, and ADR-0018 decision 7 is why the two transports stay apart.
   */
  const secret = required(env, 'VOX_NETWORK_TOKEN');
  const runsRoot = resolve(required(env, 'VOX_RUNS_ROOT'));
  const configuration = resolveProductionServiceConfiguration(env);

  /**
   * The mount being correct is not the same claim as anything being written to it, and until this
   * ran the second claim rested on a heredoc in `deploy/fetch-service-env.sh` rather than on code.
   * Three variables can each point off the volume with the mount check still green.
   *
   * `VOX_REMOTION_ENTRY` is deliberately not here: it is read from the image, not written to, and
   * requiring it on the volume would be a guard wider than its claim.
   */
  assertWritesLandOnVolume(volumeRoot, {
    VOX_RUNS_ROOT: runsRoot,
    VOX_LEDGER_ROOT: configuration.ledgerRoot,
    VOX_CALIBRATION_PATH: configuration.calibrationPath,
  });

  const socketTimeoutMs = resolveSocketTimeoutMs(env.VOX_IPC_SOCKET_TIMEOUT_MS);
  const bindAddress = env.VOX_NETWORK_BIND ?? '127.0.0.1';

  const host = createProductionNetworkHost({
    port: Number(env.VOX_NETWORK_PORT ?? 8080),
    bindAddress,
    secret,
    socketTimeoutMs,
    surface: new ProductionPayloadSurface({
      service: createConfiguredProductionService(configuration),
      runsRoot,
    }),
  });

  const port = await host.listen();
  return { port, address: bindAddress, socketTimeoutMs, close: () => host.close() };
};
