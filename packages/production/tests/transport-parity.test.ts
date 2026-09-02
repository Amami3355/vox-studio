import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProductionPayloadSurface } from '../src/commands/payload-surface';
import { type ProductionIpcHost, createProductionIpcHost } from '../src/ipc/host';
import { type ProductionNetworkHost, createProductionNetworkHost } from '../src/ipc/network-host';
import { type CommandFixture, VALID_PLAN, createCommandFixture } from './command-fixture';
import {
  IPC_SECRET,
  callNetwork,
  callPipe,
  pipeName,
  pipePath,
  signedPayloadRequest,
  signedRequest,
} from './ipc-fixture';
import { REQUEST } from './run-fixture';

/**
 * Each transport gets its own fixture, because each drives a real Run onto its own disk. The
 * Run id is pinned by the fixture, so the only differences left between two envelopes are the
 * ones a transport would have introduced — which is exactly what this file is looking for.
 */
type TransportPair = {
  argv: (argv: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  payload: (
    command: string,
    body?: { runId?: string | null; payload?: Record<string, unknown> | null },
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
};

let argvFixture: CommandFixture | null = null;
let payloadFixture: CommandFixture | null = null;
let pipeHost: ProductionIpcHost | null = null;
let networkHost: ProductionNetworkHost | null = null;

afterEach(async () => {
  await pipeHost?.close();
  await networkHost?.close();
  await argvFixture?.cleanup();
  await payloadFixture?.cleanup();
  pipeHost = null;
  networkHost = null;
  argvFixture = null;
  payloadFixture = null;
});

const bothTransports = async (): Promise<TransportPair> => {
  argvFixture = await createCommandFixture();
  payloadFixture = await createCommandFixture();

  const path = pipePath(pipeName());
  pipeHost = createProductionIpcHost({
    pipePath: path,
    secret: IPC_SECRET,
    service: argvFixture.service,
  });
  await pipeHost.listen();

  networkHost = createProductionNetworkHost({
    port: 0,
    secret: IPC_SECRET,
    surface: new ProductionPayloadSurface({
      service: payloadFixture.service,
      runsRoot: join(payloadFixture.root, 'public'),
      createRunDirectory: () => 'run',
    }),
  });
  const port = await networkHost.listen();

  return {
    argv: (argv) => callPipe(path, signedRequest(argvFixture!.root, argv)),
    payload: (command, body = {}) =>
      callNetwork(
        port,
        signedPayloadRequest(command, {
          runId: body.runId ?? null,
          payload: body.payload ?? null,
        }),
      ),
  };
};

describe('one Run over two transports', () => {
  it('produces the same envelope bytes for a deterministic command', async () => {
    const both = await bothTransports();

    const pipe = await both.argv(['production', 'contract', 'index']);
    const network = await both.payload('contract.index');

    expect(network.stdout).toBe(pipe.stdout);
    expect(network.exitCode).toBe(pipe.exitCode);
    expect(network.stderr).toBe(pipe.stderr);
  });

  it('produces the same envelope bytes across init, validate and status', async () => {
    const both = await bothTransports();

    const initialised = [
      await both.argv([
        'production',
        'run',
        'init',
        '--request',
        'request.json',
        '--out',
        'public/run',
      ]),
      await both.payload('run.init', { payload: REQUEST as unknown as Record<string, unknown> }),
    ];
    const runId = (JSON.parse(initialised[0]!.stdout) as { run: { id: string } }).run.id;
    const validated = [
      await both.argv([
        'production',
        'run',
        'validate',
        '--run',
        'public/run',
        '--plan',
        'plan.json',
      ]),
      await both.payload('run.validate', {
        runId,
        payload: VALID_PLAN as unknown as Record<string, unknown>,
      }),
    ];
    const observed = [
      await both.argv(['production', 'run', 'status', '--run', 'public/run']),
      await both.payload('run.status', { runId }),
    ];

    for (const [pipe, network] of [initialised, validated, observed]) {
      expect(network!.exitCode).toBe(pipe!.exitCode);
      expect(network!.stderr).toBe(pipe!.stderr);
      expect(network!.stdout).toBe(pipe!.stdout);
    }
    expect(JSON.parse(observed[0]!.stdout)).toMatchObject({
      command: 'run.status',
      outcome: 'succeeded',
      run: { stage: 'validated' },
    });
  });

  it('refuses a replay on both, and neither of them says why', async () => {
    argvFixture = await createCommandFixture();
    payloadFixture = await createCommandFixture();
    const path = pipePath(pipeName());
    pipeHost = createProductionIpcHost({
      pipePath: path,
      secret: IPC_SECRET,
      service: argvFixture.service,
    });
    await pipeHost.listen();
    networkHost = createProductionNetworkHost({
      port: 0,
      secret: IPC_SECRET,
      surface: new ProductionPayloadSurface({
        service: payloadFixture.service,
        runsRoot: join(payloadFixture.root, 'public'),
      }),
    });
    const port = await networkHost.listen();

    const replayedArgv = signedRequest(argvFixture.root, ['production', 'contract', 'index']);
    const replayedPayload = signedPayloadRequest('contract.index', { runId: null, payload: null });
    await callPipe(path, replayedArgv);
    await callNetwork(port, replayedPayload);

    const refusals = await Promise.all([
      callPipe(path, replayedArgv).catch((error: Error) => error),
      callNetwork(port, replayedPayload).catch((error: Error) => error),
    ]);

    // Both callers learn only that the connection went away: the pipe client's frame read ends
    // early and the HTTP client's socket is reset. Neither carries the host's reason, which is
    // the property — a reason on the wire is an oracle a caller can walk.
    for (const refusal of refusals) {
      expect(refusal).toBeInstanceOf(Error);
      expect((refusal as Error).message).not.toMatch(/replay|skew|stale|auth|hmac/i);
    }
  });
});
