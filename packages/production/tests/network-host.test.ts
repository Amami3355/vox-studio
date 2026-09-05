import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ProductionPayloadSurface } from '../src/commands/payload-surface';
import type { CommandExecution } from '../src/commands/service';
import {
  artifactRequestSigningText,
  payloadRequestSigningText,
  signIpc,
} from '../src/ipc/authentication';
import {
  type PayloadCommandExecutor,
  type ProductionNetworkHost,
  createProductionNetworkHost,
} from '../src/ipc/network-host';
import { type CommandFixture, VALID_PLAN, createCommandFixture } from './command-fixture';
import {
  IPC_SECRET,
  callArtifact,
  callNetwork,
  signedArtifactRequest,
  signedPayloadRequest,
} from './ipc-fixture';
import { REQUEST } from './run-fixture';

let fixture: CommandFixture | null = null;
let host: ProductionNetworkHost | null = null;
afterEach(async () => {
  await host?.close();
  await fixture?.cleanup();
  host = null;
  fixture = null;
});

const surfaceFor = (open: CommandFixture): ProductionPayloadSurface =>
  new ProductionPayloadSurface({
    service: open.service,
    runsRoot: join(open.root, 'public'),
    createRunDirectory: () => 'run-network',
  });

const start = async (
  open: CommandFixture,
  options: Partial<Parameters<typeof createProductionNetworkHost>[0]> = {},
): Promise<number> => {
  host = createProductionNetworkHost({
    port: 0,
    secret: IPC_SECRET,
    surface: surfaceFor(open),
    ...options,
  });
  return host.listen();
};

describe('the network host', () => {
  it('serves the payload surface and answers with the response shape the pipe already defines', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);

    const response = await callNetwork(port, signedPayloadRequest('contract.index'));
    const envelope = JSON.parse(response.stdout) as { command: string; outcome: string };

    expect(response).toMatchObject({ exitCode: 0, stderr: '' });
    expect(response.stdout.endsWith('\n')).toBe(true);
    expect(envelope).toMatchObject({ command: 'contract.index', outcome: 'succeeded' });
  });

  it('drives a Run from a payload and names it by id afterwards', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);

    const init = await callNetwork(port, signedPayloadRequest('run.init', { payload: REQUEST }));
    const created = (JSON.parse(init.stdout) as { run: { id: string } }).run;
    const status = await callNetwork(
      port,
      signedPayloadRequest('run.status', { runId: created.id }),
    );

    expect(init.exitCode).toBe(0);
    expect(created).toMatchObject({ id: 'run-command-test', stage: 'initialized' });
    expect(JSON.parse(status.stdout)).toMatchObject({
      command: 'run.status',
      outcome: 'succeeded',
      run: { id: 'run-command-test' },
    });
  });

  it('answers an unpublished command with an envelope rather than a dropped socket', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);

    const response = await callNetwork(port, signedPayloadRequest('run.teleport'));

    expect(response.exitCode).toBe(1);
    expect(JSON.parse(response.stdout)).toMatchObject({
      command: null,
      outcome: 'failed',
      error: { code: 'UNKNOWN_COMMAND' },
    });
  });
});

/**
 * Ticket 10 chose the third shape: the preview has no link, and the operator retrieves its bytes
 * over the same tunnel that carried the Brief. This route is what carries them.
 *
 * **The response is not signed, and that is the decision rather than an omission.** These bytes
 * are authenticated by the descriptor's digest, which the caller holds because a MAC'd envelope
 * published it, and which the caller recomputes on arrival. A response MAC would authenticate the
 * channel a second time and prove nothing about the bytes that the digest does not already prove.
 */
describe('the network host artifact route', () => {
  const published = async (open: CommandFixture, port: number) => {
    const init = await callNetwork(port, signedPayloadRequest('run.init', { payload: REQUEST }));
    const runId = (JSON.parse(init.stdout) as { run: { id: string } }).run.id;
    const validated = await callNetwork(
      port,
      signedPayloadRequest('run.validate', { runId, payload: VALID_PLAN }),
    );
    const artifacts = (
      JSON.parse(validated.stdout) as {
        artifacts: { kind: string; path: string; sha256: string }[];
      }
    ).artifacts;
    const descriptor = artifacts.find((each) => each.kind === 'plan_snapshot');
    if (!descriptor) throw new Error('validate published no plan snapshot.');
    return { runId, descriptor };
  };

  it('answers a signed request with the artifact bytes, not an envelope carrying them', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);
    const { runId, descriptor } = await published(fixture, port);

    const retrieved = await callArtifact(port, signedArtifactRequest(runId, descriptor));

    expect(retrieved.contentType).toBe('application/octet-stream');
    expect(createHash('sha256').update(retrieved.bytes).digest('hex')).toBe(descriptor.sha256);
    expect(JSON.parse(retrieved.bytes.toString('utf8'))).toEqual(VALID_PLAN);
  });

  it('answers a surface refusal as JSON, so a caller tells absence from bytes by content type', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);
    const { runId, descriptor } = await published(fixture, port);

    const missing = await callArtifact(
      port,
      signedArtifactRequest(runId, {
        ...descriptor,
        path: `inputs/plans/${'0'.repeat(64)}.json`,
      }),
    );

    expect(missing.contentType).toBe('application/json');
    expect(JSON.parse(missing.bytes.toString('utf8'))).toMatchObject({ code: 'ARTIFACT_MISSING' });
  });

  it('names an unknown Run and a descriptor that escapes, each with its own code', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);
    const { runId, descriptor } = await published(fixture, port);

    const absent = await callArtifact(port, signedArtifactRequest('run-absent', descriptor));
    const outside = await callArtifact(
      port,
      signedArtifactRequest(runId, { ...descriptor, path: '../../secrets.json' }),
    );

    expect(JSON.parse(absent.bytes.toString('utf8'))).toMatchObject({ code: 'UNKNOWN_RUN' });
    expect(JSON.parse(outside.bytes.toString('utf8'))).toMatchObject({
      code: 'ARTIFACT_OUTSIDE_RUN',
    });
  });

  it('refuses a payload MAC replayed onto the artifact route', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);
    const { runId, descriptor } = await published(fixture, port);
    const signed = signedArtifactRequest(runId, descriptor);
    const foreign = {
      ...signed,
      mac: signIpc(
        IPC_SECRET,
        artifactRequestSigningText(signed).replace(
          'VOX-IPC-ARTIFACT-REQUEST-1',
          'VOX-IPC-PAYLOAD-REQUEST-1',
        ),
      ),
    };

    await expect(callArtifact(port, foreign)).rejects.toThrow();
  });

  it('refuses a bad MAC, a replay and a stale request, saying nothing about which', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);
    const { runId, descriptor } = await published(fixture, port);
    const once = signedArtifactRequest(runId, descriptor);
    await callArtifact(port, once);

    const replayed = await callArtifact(port, once).catch((error: Error) => error);
    await expect(
      callArtifact(port, { ...signedArtifactRequest(runId, descriptor), mac: '0'.repeat(64) }),
    ).rejects.toThrow();
    await expect(
      callArtifact(
        port,
        signedArtifactRequest(runId, descriptor, { timestampMs: Date.now() - 60_000 }),
      ),
    ).rejects.toThrow();

    expect(replayed).toBeInstanceOf(Error);
    expect((replayed as Error).message).not.toMatch(/IPC_|MAC|replay|skew/i);
  });

  it('shares one replay cache with the command route', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);
    const { runId, descriptor } = await published(fixture, port);
    const command = signedPayloadRequest('contract.index');
    await callNetwork(port, command);

    // The same request id, signed for the other route. The MAC is valid there, so only a
    // shared cache refuses it — and two caches would let a captured id be spent twice.
    await expect(
      callArtifact(
        port,
        signedArtifactRequest(runId, descriptor, { requestId: command.requestId }),
      ),
    ).rejects.toThrow();
  });
});

describe('the network host refusing a request', () => {
  it('refuses a replayed requestId', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);
    const once = signedPayloadRequest('contract.index');
    await callNetwork(port, once);

    await expect(callNetwork(port, once)).rejects.toThrow();
  });

  it('refuses a request outside the skew window', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);

    await expect(
      callNetwork(
        port,
        signedPayloadRequest('contract.index', { timestampMs: Date.now() - 60_000 }),
      ),
    ).rejects.toThrow();
  });

  it('refuses a bad MAC', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);

    await expect(
      callNetwork(port, { ...signedPayloadRequest('contract.index'), mac: '0'.repeat(64) }),
    ).rejects.toThrow();
  });

  it('refuses an argv MAC replayed onto the payload surface', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);
    const unsigned = {
      protocolVersion: 1 as const,
      requestId: crypto.randomUUID(),
      timestampMs: Date.now(),
      command: 'contract.index',
      runId: null,
      payload: null,
    };
    const foreign = {
      ...unsigned,
      // The argv transport's domain tag over the same envelope fields.
      mac: signIpc(
        IPC_SECRET,
        payloadRequestSigningText(unsigned).replace(
          'VOX-IPC-PAYLOAD-REQUEST-1',
          'VOX-IPC-REQUEST-1',
        ),
      ),
    };

    await expect(callNetwork(port, foreign)).rejects.toThrow();
  });

  it('refuses a request that is not a POST to the command path', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);

    await expect(
      callNetwork(port, signedPayloadRequest('contract.index'), { method: 'GET' }),
    ).rejects.toThrow();
    await expect(
      callNetwork(port, signedPayloadRequest('contract.index'), { path: '/anything-else' }),
    ).rejects.toThrow();
  });

  it('leaks no reason with any of them', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture);

    const refusal = await callNetwork(port, { not: 'a request' }).catch((error: Error) => error);

    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).not.toMatch(/IPC_|MAC|replay|skew/i);
  });
});

describe('the network host binding', () => {
  it('binds loopback by default', async () => {
    fixture = await createCommandFixture();
    await start(fixture);

    expect(host?.address()).toMatchObject({ address: '127.0.0.1' });
  });

  it('refuses any bind address that is not loopback', async () => {
    fixture = await createCommandFixture();
    const surface = surfaceFor(fixture);

    expect(() =>
      createProductionNetworkHost({
        port: 0,
        bindAddress: '0.0.0.0',
        secret: IPC_SECRET,
        surface,
      }),
    ).toThrow(/loopback/i);
    expect(() =>
      createProductionNetworkHost({
        port: 0,
        bindAddress: '10.0.0.4',
        secret: IPC_SECRET,
        surface,
      }),
    ).toThrow(/loopback/i);
  });

  it('refuses `localhost`, which is a name this process cannot resolve for itself', async () => {
    fixture = await createCommandFixture();

    // It resolves through `/etc/hosts` and NSS. Admitting it would admit whatever that file
    // says, which is not a decision this code gets to make.
    expect(() =>
      createProductionNetworkHost({
        port: 0,
        bindAddress: 'localhost',
        secret: IPC_SECRET,
        surface: surfaceFor(fixture as CommandFixture),
      }),
    ).toThrow(/loopback/i);
  });
});

describe('the network host idle timeout', () => {
  const slowSurface = (delayMs: number): PayloadCommandExecutor => ({
    // The timeout is about the command route, and a stub that could serve an artifact would be
    // claiming this test covers one.
    fetchArtifact: async () => {
      throw new Error('The idle-timeout stub serves no artifacts.');
    },
    execute: async () => {
      await new Promise((wake) => setTimeout(wake, delayMs));
      return {
        envelope: {
          protocolVersion: 1,
          command: 'contract.index',
          outcome: 'succeeded',
          run: null,
          data: null,
          artifacts: [],
          error: null,
          next: [],
        },
        exitCode: 0,
      } as unknown as CommandExecution;
    },
  });

  it('drops a command that outlasts the configured timeout', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture, { surface: slowSurface(600), socketTimeoutMs: 100 });

    await expect(callNetwork(port, signedPayloadRequest('contract.index'))).rejects.toThrow();
  });

  it('serves the same command when the timeout admits a render', async () => {
    fixture = await createCommandFixture();
    const port = await start(fixture, { surface: slowSurface(600), socketTimeoutMs: 10_000 });

    const response = await callNetwork(port, signedPayloadRequest('contract.index'));

    expect(response.exitCode).toBe(0);
  });
});

/**
 * ADR-0015 decision 3 and ADR-0018 decision 7: the network transport is authorised for the
 * remote topology only, so that a later session cannot cite it to add a convenience listener on
 * a developer's laptop. The named pipe is the local transport permanently; the two are siblings,
 * not stages.
 *
 * The allowlist is the cloud entry point and nothing else. **Ticket 07 wrote the one name on it**,
 * and a session that adds a second is changing an ADR.
 *
 * The name is `cloud-host.ts` rather than `cloud-service-host.ts` — the container's `CMD` — because
 * the binding lives in the assembly, which holds no side effects at import and can therefore be
 * driven by `cloud-host.test.ts`. The `CMD` module reads `process.env` and calls it, and binds
 * nothing itself.
 */
describe('where the network host may be bound', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  /**
   * The whole repository, not just `packages/`. A scan narrowed to where the host happens to
   * live today would let ticket 07 put its entry point in `apps/`, `scripts/` or `services/`
   * and still pass an allowlist that says nothing may bind it.
   */
  const repositoryRoot = resolve(here, '../../..');
  // Built with `join` because the comparison is against `relative()`, which uses the platform's
  // separator — a literal POSIX string here would pass on CI and fail on the Windows machine.
  const cloudEntryPoints: string[] = [
    join('packages', 'production', 'src', 'ipc', 'cloud-host.ts'),
  ];

  const sourceFiles = (from: string): string[] =>
    readdirSync(from).flatMap((name) => {
      const path = join(from, name);
      if (['node_modules', 'dist', 'tests', '.git', '.scratch'].includes(name)) return [];
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return path.endsWith('.ts') || path.endsWith('.mts') ? [path] : [];
    });

  it('is constructed in the cloud entry point and nowhere else', () => {
    const scanned = sourceFiles(repositoryRoot);
    // A scan that found nothing would pass this test for the wrong reason.
    expect(scanned).toContain(
      resolve(repositoryRoot, 'packages/production/src/ipc/network-host.ts'),
    );

    const binding = scanned.filter((path) => {
      if (path.endsWith(join('ipc', 'network-host.ts'))) return false;
      return /createProductionNetworkHost\s*\(/.test(readFileSync(path, 'utf8'));
    });

    expect(binding.map((path) => relative(repositoryRoot, path))).toEqual(cloudEntryPoints);
  });

  it('is not reachable from the local service entry point', () => {
    const local = readFileSync(
      resolve(repositoryRoot, 'packages/production/src/ipc/service-host.ts'),
      'utf8',
    );

    expect(local).not.toContain('network-host');
    expect(local).not.toContain('createProductionNetworkHost');
  });
});
