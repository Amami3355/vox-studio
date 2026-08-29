import { type Server, type Socket, createServer } from 'node:net';
import { type DispatchResult, dispatchProductionArgv } from '../commands/dispatch';
import type { ProductionCommandService } from '../commands/service';
import { PROTOCOL_VERSION, resultEnvelopeSchema } from '../contracts/schemas';
import {
  type IpcRequest,
  authenticatedResponse,
  ipcRequestSchema,
  requestSigningText,
  verifyIpcMac,
} from './authentication';
import { encodeFrame, readFrame } from './framing';
import { sanitizeBoundaryText } from './sanitize';
import { DEFAULT_IPC_SOCKET_TIMEOUT_MS } from './socket-timeout';

export type ProductionIpcHost = {
  listen: () => Promise<void>;
  close: () => Promise<void>;
};

export type ProductionIpcAudit = {
  before?: (request: IpcRequest) => Promise<unknown>;
  after?: (event: {
    request: IpcRequest;
    result: DispatchResult;
    context: unknown;
    startedAtMs: number;
    endedAtMs: number;
  }) => Promise<void>;
};

const publicFailure = () => ({
  exitCode: 1 as const,
  stdout: `${JSON.stringify(
    resultEnvelopeSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      command: null,
      outcome: 'failed',
      run: null,
      data: null,
      artifacts: [],
      error: {
        code: 'PRODUCTION_SERVICE_FAILED',
        message: 'The Production service could not complete the command.',
        details: null,
      },
      next: [],
    }),
  )}\n`,
  stderr: '',
});

export const createProductionIpcHost = ({
  pipePath,
  secret,
  service,
  now = () => Date.now(),
  maxClockSkewMs = 30_000,
  socketTimeoutMs = DEFAULT_IPC_SOCKET_TIMEOUT_MS,
  audit,
}: {
  pipePath: string;
  secret: string | Uint8Array;
  service: ProductionCommandService;
  now?: () => number;
  maxClockSkewMs?: number;
  socketTimeoutMs?: number;
  audit?: ProductionIpcAudit;
}): ProductionIpcHost => {
  if (!/^\\\\\.\\pipe\\[A-Za-z0-9._-]+$/.test(pipePath)) {
    throw new TypeError('Production IPC requires a normalized Windows named-pipe path.');
  }
  if (Buffer.byteLength(secret) < 32) throw new TypeError('Production IPC secret is too short.');
  const seen = new Map<string, number>();
  let server: Server | null = null;

  const authenticate = (input: unknown) => {
    const request = ipcRequestSchema.parse(input);
    const current = now();
    if (Math.abs(current - request.timestampMs) > maxClockSkewMs) throw new Error('IPC_STALE');
    for (const [requestId, expiresAt] of seen) {
      if (expiresAt < current) seen.delete(requestId);
    }
    if (seen.has(request.requestId)) throw new Error('IPC_REPLAY');
    const { mac, ...unsigned } = request;
    if (!verifyIpcMac(secret, requestSigningText(unsigned), mac)) throw new Error('IPC_AUTH');
    seen.set(request.requestId, current + maxClockSkewMs);
    return request;
  };

  const handle = async (socket: Socket): Promise<void> => {
    socket.setTimeout(socketTimeoutMs, () => socket.destroy());
    let request: IpcRequest;
    try {
      request = authenticate(await readFrame(socket));
    } catch {
      socket.destroy();
      return;
    }
    const startedAtMs = Date.now();
    let auditContext: unknown;
    try {
      auditContext = await audit?.before?.(request);
    } catch {
      socket.destroy();
      return;
    }
    let result: DispatchResult;
    try {
      result = await dispatchProductionArgv(service, request.cwd, request.argv);
    } catch {
      result = publicFailure();
    }
    const publicResult = {
      ...result,
      stdout: sanitizeBoundaryText(result.stdout),
      stderr: sanitizeBoundaryText(result.stderr),
    };
    try {
      await audit?.after?.({
        request,
        result: publicResult,
        context: auditContext,
        startedAtMs,
        endedAtMs: Date.now(),
      });
    } catch {
      socket.destroy();
      return;
    }
    const response = authenticatedResponse(secret, {
      protocolVersion: 1,
      requestId: request.requestId,
      exitCode: publicResult.exitCode,
      stdoutBase64: Buffer.from(publicResult.stdout, 'utf8').toString('base64'),
      stderrBase64: Buffer.from(publicResult.stderr, 'utf8').toString('base64'),
    });
    socket.end(encodeFrame(response));
  };

  return {
    listen: () =>
      new Promise<void>((resolveListen, rejectListen) => {
        if (server) return rejectListen(new Error('IPC_HOST_ALREADY_LISTENING'));
        server = createServer((socket) => void handle(socket));
        server.once('error', rejectListen);
        server.listen(pipePath, () => {
          server?.off('error', rejectListen);
          resolveListen();
        });
      }),
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        if (!server) return resolveClose();
        server.close((error) => {
          server = null;
          if (error) rejectClose(error);
          else resolveClose();
        });
      }),
  };
};
