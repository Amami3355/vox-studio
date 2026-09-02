import { type Server, type Socket, createServer } from 'node:net';
import { dispatchProductionArgv } from '../commands/dispatch';
import type { ProductionCommandService } from '../commands/service';
import { type IpcRequest, ipcRequestSchema, requestSigningText } from './authentication';
import { type ProductionBoundaryAudit, createProductionBoundary } from './boundary';
import { encodeFrame, readFrame } from './framing';
import { DEFAULT_IPC_SOCKET_TIMEOUT_MS } from './socket-timeout';

export type ProductionIpcHost = {
  listen: () => Promise<void>;
  close: () => Promise<void>;
};

export type ProductionIpcAudit = ProductionBoundaryAudit<IpcRequest>;

/**
 * The named-pipe transport: a pipe path, `node:net`'s framing, and nothing else. The
 * authenticate-dispatch-sanitise-sign sequence lives in `boundary.ts` and is shared with the
 * network host; what stays here is the socket and the argv dispatch shape.
 */
export const createProductionIpcHost = ({
  pipePath,
  secret,
  service,
  now,
  maxClockSkewMs,
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
  const boundary = createProductionBoundary<IpcRequest>({
    secret,
    now,
    maxClockSkewMs,
    audit,
    parse: (input) => ipcRequestSchema.parse(input),
    signingText: requestSigningText,
    dispatch: (request) => dispatchProductionArgv(service, request.cwd, request.argv),
  });
  let server: Server | null = null;

  const handle = async (socket: Socket): Promise<void> => {
    socket.setTimeout(socketTimeoutMs, () => socket.destroy());
    try {
      const response = await boundary.handle(await readFrame(socket));
      socket.end(encodeFrame(response));
    } catch {
      socket.destroy();
    }
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
