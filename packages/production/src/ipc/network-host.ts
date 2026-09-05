import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ProductionPayloadSurface } from '../commands/payload-surface';
import type { CommandId } from '../contracts/schemas';
import {
  type ArtifactIpcRequest,
  MAX_IPC_FRAME_BYTES,
  type PayloadIpcRequest,
  artifactRequestSchema,
  artifactRequestSigningText,
  payloadRequestSchema,
  payloadRequestSigningText,
} from './authentication';
import {
  type ProductionBoundaryAudit,
  createBoundaryAuthenticator,
  createProductionBoundary,
} from './boundary';
import { DEFAULT_IPC_SOCKET_TIMEOUT_MS } from './socket-timeout';

/** Commands: a payload in, a signed envelope back. A request anywhere else is closed. */
export const PRODUCTION_NETWORK_PATH = '/command';

/**
 * Artifacts: a Run id and a published descriptor in, the bytes back.
 *
 * **A second route, not a second host.** ADR-0018 decision 7 pins the one entry point authorised
 * to construct this host, and that is unchanged — `cloud-host.ts` is still the only name on the
 * allowlist. What this adds is the read-back direction of the crew's contract, which
 * `ProductionPayloadSurface.fetchArtifact` has always implemented and no transport ever carried.
 *
 * It is a POST under the same HMAC as `/command`, through the same authenticator and therefore
 * the same replay cache. It grants a browser nothing: a browser cannot sign a body, and this
 * route asks for a signature exactly as the other one does. Ticket 10 records why the shape that
 * *would* have admitted one — a signed link on a GET — was not taken.
 */
export const PRODUCTION_ARTIFACT_PATH = '/artifact';

/**
 * The addresses this host will bind. `0.0.0.0` is not among them: the firewall is the outer
 * lock and it lives in a different system from this code, so a host bound to every interface is
 * one misapplied rule away from being reachable. Bind address is one line and it fails closed.
 *
 * **`localhost` is not on this list, and its absence is the point.** It is a name, not an
 * address: it resolves through `/etc/hosts` and NSS, which are configuration this process does
 * not own and cannot read back. An allowlist admitting it would be admitting whatever that file
 * says today — which is the same class of mistake as trusting the firewall to keep a
 * `0.0.0.0` bind private, one layer down.
 */
const LOOPBACK = new Set(['127.0.0.1', '::1']);

/** Only the methods the host needs, so a test can drive it with a stub. */
export type PayloadCommandExecutor = Pick<ProductionPayloadSurface, 'execute' | 'fetchArtifact'>;

export type ProductionNetworkHost = {
  /** Resolves with the bound port, which is the one the caller asked for unless it was 0. */
  listen: () => Promise<number>;
  close: () => Promise<void>;
  address: () => AddressInfo | null;
};

export type ProductionNetworkHostAudit = ProductionBoundaryAudit<PayloadIpcRequest>;

/**
 * The second transport, over the same boundary as the first.
 *
 * **It implements no caller-identity check of its own, and that is a decision rather than an
 * omission.** `sshd` and the firewall answer *who may connect* — there is no public ingress, the
 * only route in is a tunnel gated by a key the operator holds, and this host binds loopback on
 * the far side of it. An identity check inside the container would be a second, weaker answer to
 * a question already answered, and it would be the one a reader trusted. What this host does
 * check is the request *body*, through the per-request HMAC in `boundary.ts`, which answers a
 * different question and is not replaced by the channel's answer.
 *
 * **Nothing here is encrypted by this host.** The SSH tunnel is the encrypted channel and there
 * is no TLS anywhere in this topology; the hop from the tunnel's endpoint to this port is
 * loopback on a box with no public ingress. A reader grepping for a TLS context and finding none
 * is reading it correctly. See ADR-0018 decision 2.
 */
export const createProductionNetworkHost = ({
  port,
  bindAddress = '127.0.0.1',
  secret,
  surface,
  now,
  maxClockSkewMs,
  socketTimeoutMs = DEFAULT_IPC_SOCKET_TIMEOUT_MS,
  audit,
}: {
  port: number;
  bindAddress?: string;
  secret: string | Uint8Array;
  surface: PayloadCommandExecutor;
  now?: () => number;
  maxClockSkewMs?: number;
  socketTimeoutMs?: number;
  audit?: ProductionNetworkHostAudit;
}): ProductionNetworkHost => {
  if (!LOOPBACK.has(bindAddress)) {
    throw new TypeError('The Production network host binds loopback only.');
  }
  // One authenticator for both routes, so they share one replay cache. See `boundary.ts`.
  const authenticator = createBoundaryAuthenticator({ secret, now, maxClockSkewMs });
  const boundary = createProductionBoundary<PayloadIpcRequest>({
    secret,
    now,
    maxClockSkewMs,
    audit,
    authenticator,
    parse: (input) => payloadRequestSchema.parse(input),
    signingText: payloadRequestSigningText,
    dispatch: async (request) => {
      const execution = await surface.execute({
        // The wire accepts any non-empty string here on purpose: an unpublished command is
        // answered with an envelope, the way the argv path answers one, rather than by dropping
        // the socket. The surface resolves the string back to a published id or to `null`.
        command: request.command as CommandId,
        runId: request.runId,
        payload: request.payload,
      });
      // The same `stdout` the argv path produces for the same envelope, trailing newline
      // included, so a parity test compares bytes rather than intentions.
      return {
        exitCode: execution.exitCode,
        stdout: `${JSON.stringify(execution.envelope)}\n`,
        stderr: '',
      };
    },
  });
  let server: Server | null = null;

  /**
   * Reads one JSON body under the frame ceiling the pipe transport already enforces. A body
   * that runs past it is refused by closing, exactly as an oversized frame is.
   */
  const readBody = (request: IncomingMessage): Promise<unknown> =>
    new Promise((resolveBody, rejectBody) => {
      const chunks: Buffer[] = [];
      let size = 0;
      request.on('data', (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_IPC_FRAME_BYTES) {
          rejectBody(new Error('IPC_FRAME_TOO_LARGE'));
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      request.on('error', rejectBody);
      request.on('end', () => {
        try {
          resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          rejectBody(new Error('IPC_FRAME_JSON_INVALID'));
        }
      });
    });

  /**
   * The artifact route's answer. Bytes on success and a refusal object on a surface error, told
   * apart by content type rather than by status code — this host answers 200 or it answers
   * nothing, because a status code is a reason and the boundary publishes no reasons.
   *
   * **A surface refusal is not a boundary refusal and is not hidden.** `ARTIFACT_MISSING` and its
   * siblings are what the command route already puts in an envelope for a caller to read; the
   * boundary's silence covers a bad MAC, a replay and a stale request, and those still close the
   * socket below.
   *
   * **The response carries no MAC.** The descriptor's digest authenticates these bytes: the
   * caller holds it because a signed envelope published it, and recomputes it on arrival. A
   * response MAC would attest the channel a second time and say nothing about the bytes that the
   * digest does not already say.
   */
  const serveArtifact = async (input: unknown, response: ServerResponse): Promise<void> => {
    const request = authenticator.authenticate<ArtifactIpcRequest>(
      input,
      (candidate) => artifactRequestSchema.parse(candidate),
      artifactRequestSigningText,
    );
    let body: Buffer;
    let contentType: string;
    try {
      const retrieved = await surface.fetchArtifact(request.runId, request.descriptor);
      body = Buffer.from(retrieved.bytes);
      contentType = 'application/octet-stream';
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : 'ARTIFACT_UNAVAILABLE';
      // The message is the surface's own and has been through no sanitiser, so it is dropped
      // rather than forwarded: `payload-surface.ts` writes host paths into some of them.
      body = Buffer.from(JSON.stringify({ code }), 'utf8');
      contentType = 'application/json';
    }
    response.writeHead(200, { 'content-type': contentType, 'content-length': body.byteLength });
    response.end(body);
  };

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      if (request.method !== 'POST') throw new Error('IPC_ROUTE_UNKNOWN');
      if (request.url === PRODUCTION_ARTIFACT_PATH) {
        await serveArtifact(await readBody(request), response);
        return;
      }
      if (request.url !== PRODUCTION_NETWORK_PATH) throw new Error('IPC_ROUTE_UNKNOWN');
      const signed = await boundary.handle(await readBody(request));
      const body = Buffer.from(JSON.stringify(signed), 'utf8');
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': body.byteLength,
      });
      response.end(body);
    } catch {
      // The pipe host destroys the socket on every refusal and says nothing. A status code here
      // would be a reason, and a reason is an oracle: a caller could tell a bad MAC from a
      // replay from an unknown route by reading it.
      request.socket.destroy();
    }
  };

  return {
    listen: () =>
      new Promise<number>((resolveListen, rejectListen) => {
        if (server) return rejectListen(new Error('IPC_HOST_ALREADY_LISTENING'));
        const opened = createServer((request, response) => void handle(request, response));
        opened.setTimeout(socketTimeoutMs, (socket) => socket.destroy());
        server = opened;
        opened.once('error', rejectListen);
        opened.listen(port, bindAddress, () => {
          opened.off('error', rejectListen);
          const bound = opened.address();
          if (bound === null || typeof bound === 'string') {
            rejectListen(new Error('IPC_HOST_ADDRESS_UNKNOWN'));
            return;
          }
          resolveListen(bound.port);
        });
      }),
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        if (!server) return resolveClose();
        server.closeAllConnections();
        server.close((error) => {
          server = null;
          if (error) rejectClose(error);
          else resolveClose();
        });
      }),
    address: () => {
      const bound = server?.address() ?? null;
      return bound === null || typeof bound === 'string' ? null : bound;
    },
  };
};
