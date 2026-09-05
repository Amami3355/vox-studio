import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { type ProductionCloudHost, startProductionCloudHost } from '../src/ipc/cloud-host';
import type { VolumeProbe } from '../src/ipc/persistent-volume';
import { DEFAULT_IPC_SOCKET_TIMEOUT_MS } from '../src/ipc/socket-timeout';
import { IPC_SECRET, callNetwork, signedPayloadRequest } from './ipc-fixture';

/**
 * The cloud entry point's assembly, driven in process.
 *
 * It is a separate module from `cloud-service-host.ts` — which is the container's `CMD` and does
 * nothing but read `process.env` and call this — precisely so that these assertions can be made
 * against the real assembly rather than against a text scan of an entry point that cannot be
 * imported without starting a server.
 */
let host: ProductionCloudHost | null = null;
let root: string | null = null;

afterEach(async () => {
  await host?.close();
  if (root) await rm(root, { recursive: true, force: true });
  host = null;
  root = null;
});

/** A volume that is mounted. The real probe cannot be satisfied on this machine; see below. */
const mounted: VolumeProbe = { exists: () => true, deviceOf: (path) => (path.length % 2) + 1 };

const environment = async (
  overrides: Record<string, string | undefined> = {},
): Promise<Record<string, string | undefined>> => {
  root = await mkdtemp(join(tmpdir(), 'vox-cloud-'));
  await mkdir(join(root, 'runs'), { recursive: true });
  return {
    VOX_GRANT_KEY: 'grant-key',
    // Never called: no test here reaches `record`, which is the only command that synthesises.
    ELEVENLABS_API_KEY: 'eleven-key',
    VOX_LEDGER_ROOT: join(root, 'ledger'),
    VOX_RUN_HMAC_KEY: 'run-hmac',
    VOX_RUN_KEY_ID: 'key-1',
    VOX_CALIBRATION_PATH: join(root, 'calibration.json'),
    VOX_REMOTION_ENTRY: resolve('packages/video/src/remotion-entry.ts'),
    VOX_VOLUME_ROOT: root,
    VOX_RUNS_ROOT: join(root, 'runs'),
    VOX_NETWORK_TOKEN: IPC_SECRET,
    VOX_NETWORK_PORT: '0',
    ...overrides,
  };
};

const start = async (
  overrides: Record<string, string | undefined> = {},
  probe: VolumeProbe = mounted,
): Promise<number> => {
  host = await startProductionCloudHost({ env: await environment(overrides), volumeProbe: probe });
  return host.port;
};

describe('the cloud entry point', () => {
  it('answers a signed request over the network transport', async () => {
    const port = await start();

    const response = await callNetwork(port, signedPayloadRequest('contract.index'));

    expect(response.exitCode).toBe(0);
    expect(JSON.parse(response.stdout)).toMatchObject({ outcome: 'succeeded' });
  });

  it('binds loopback', async () => {
    const port = await start();

    expect(host?.address).toBe('127.0.0.1');
    expect(port).toBeGreaterThan(0);
  });

  it('refuses any bind address that is not loopback', async () => {
    await expect(start({ VOX_NETWORK_BIND: '0.0.0.0' })).rejects.toThrow(/loopback only/);
  });

  /**
   * ADR-0018 decision 8: *"Proof the service refuses to start without its persistent volume — the
   * failure it prevents is silent, which is why it is asserted rather than assumed."*
   */
  it('refuses to start when the volume is not mounted, and binds nothing', async () => {
    const unmounted: VolumeProbe = { exists: () => true, deviceOf: () => 254 };

    await expect(start({}, unmounted)).rejects.toThrow(/VOLUME_NOT_MOUNTED/);
    expect(host).toBeNull();
  });

  it('refuses to start when the volume is absent entirely', async () => {
    const absent: VolumeProbe = { exists: () => false, deviceOf: () => 254 };

    await expect(start({}, absent)).rejects.toThrow(/VOLUME_ABSENT/);
  });

  /**
   * The mount being present is not the claim that matters on its own — what matters is that the
   * Runs land on it. Until this was wired, all three of these could point at the container's own
   * filesystem with the mount check green, and the only thing keeping them on the volume was a
   * heredoc in `deploy/fetch-service-env.sh`.
   */
  it.each(['VOX_LEDGER_ROOT', 'VOX_RUNS_ROOT', 'VOX_CALIBRATION_PATH'])(
    'refuses to start when %s points off the volume, and binds nothing',
    async (name) => {
      await expect(start({ [name]: join(tmpdir(), 'vox-elsewhere', 'x') })).rejects.toThrow(
        /VOLUME_ESCAPED/,
      );
      expect(host).toBeNull();
    },
  );

  it('refuses a request whose body is not the signed shape, by dropping the socket', async () => {
    const port = await start();

    // Not a status code: the host says nothing, because a reason is an oracle.
    await expect(callNetwork(port, { command: 'contract.index' })).rejects.toThrow();
  });

  it('refuses a route that is not the one surface', async () => {
    const port = await start();

    await expect(
      callNetwork(port, signedPayloadRequest('contract.index'), { path: '/anything-else' }),
    ).rejects.toThrow();
  });
});

describe('what the cloud entry point must not carry', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sourceOf = (name: string): string =>
    readFileSync(resolve(here, '../src/ipc', name), 'utf8');

  /**
   * Ticket 07: *"The cloud entry point does not read `VOX_PIPE_PATH` or `VOX_IPC_TOKEN` and does
   * not import the bridge. A configuration key that exists but is ignored is a key someone will
   * set and expect to matter."*
   */
  it.each(['cloud-host.ts', 'cloud-service-host.ts'])('%s names no pipe at all', (name) => {
    const source = sourceOf(name);

    expect(source).not.toContain('pipe-bridge');
    expect(source).not.toContain('startProductionPipeBridge');
    expect(source).not.toContain('VOX_PIPE_PATH');
    expect(source).not.toContain('VOX_IPC_TOKEN');
    expect(source).not.toContain('createProductionIpcHost');
  });

  it('shares its secret with no other transport', async () => {
    // `VOX_IPC_TOKEN` is the pipe transport's. Setting it does not start this host.
    const env = await environment({ VOX_NETWORK_TOKEN: undefined, VOX_IPC_TOKEN: IPC_SECRET });

    await expect(startProductionCloudHost({ env, volumeProbe: mounted })).rejects.toThrow(
      'Missing trusted service configuration: VOX_NETWORK_TOKEN',
    );
  });
});

/**
 * Ticket 11 measured a showcase render at **178 s** under a two-vCPU cap. Ticket 07 owes a request
 * timeout that admits it "on the platform as well as in the host"; this is the host half, and the
 * platform half is the tunnel and is written into the runbook where an operator can see it.
 */
describe('the request timeout admits a synchronous render', () => {
  const MEASURED_RENDER_MS = 178_000;

  it('leaves room for the measured render and then some', () => {
    expect(DEFAULT_IPC_SOCKET_TIMEOUT_MS).toBeGreaterThan(MEASURED_RENDER_MS * 2);
  });

  it('is the timeout the cloud host actually runs with', async () => {
    await start();

    expect(host?.socketTimeoutMs).toBe(DEFAULT_IPC_SOCKET_TIMEOUT_MS);
  });
});
