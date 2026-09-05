import type { DispatchResult } from '../commands/dispatch';
import { PROTOCOL_VERSION, resultEnvelopeSchema } from '../contracts/schemas';
import { type IpcResponse, authenticatedResponse, verifyIpcMac } from './authentication';
import { sanitizeBoundaryText } from './sanitize';

/**
 * The envelope every transport's request carries, whatever body rides on it. The named pipe
 * carries argv and a working directory; the network host carries ticket 05's command name,
 * Run id and payload. Neither shape appears here, because none of the boundary's behaviour
 * depends on it.
 */
export type BoundaryRequest = {
  protocolVersion: 1;
  requestId: string;
  timestampMs: number;
  mac: string;
};

export type BoundaryRefusalCode =
  | 'IPC_MALFORMED'
  | 'IPC_STALE'
  | 'IPC_REPLAY'
  | 'IPC_AUTH'
  | 'IPC_AUDIT';

/**
 * A refusal the caller never learns the reason for. Both hosts catch this and close, without
 * reading the code: it is carried so that a test can tell one refusal from another, which is
 * what stops a handler that refuses everything for one reason from passing. A transport that put
 * the code on the wire would have turned the boundary into an oracle.
 */
export class BoundaryRefusal extends Error {
  constructor(readonly code: BoundaryRefusalCode) {
    super(code);
    this.name = 'BoundaryRefusal';
  }
}

export type ProductionBoundaryAudit<TRequest> = {
  before?: (request: TRequest) => Promise<unknown>;
  after?: (event: {
    request: TRequest;
    result: DispatchResult;
    context: unknown;
    startedAtMs: number;
    endedAtMs: number;
  }) => Promise<void>;
};

export type ProductionBoundary<TRequest extends BoundaryRequest> = {
  /** Authenticate, dispatch, sanitise and sign. Throws {@link BoundaryRefusal} or nothing. */
  handle: (input: unknown) => Promise<IpcResponse>;
};

export type ProductionBoundaryOptions<TRequest extends BoundaryRequest> = {
  secret: string | Uint8Array;
  parse: (input: unknown) => TRequest;
  signingText: (request: Omit<TRequest, 'mac'>) => string;
  dispatch: (request: TRequest) => Promise<DispatchResult>;
  now?: () => number;
  maxClockSkewMs?: number;
  audit?: ProductionBoundaryAudit<TRequest>;
  /**
   * The authenticator to admit requests through. Supplied when a host serves more than one
   * request shape and they must share one replay cache; omitted, this boundary builds its own.
   */
  authenticator?: BoundaryAuthenticator;
};

/**
 * Protocol shape, clock skew, replay and the per-request HMAC, separated from the response the
 * boundary goes on to build. It is separate because the network host serves two request shapes
 * over one socket — a command, which answers with a signed envelope, and an artifact, which
 * answers with bytes — and **one replay cache has to cover both.** Two authenticators would let a
 * request id captured on one route be spent again on the other.
 */
export type BoundaryAuthenticator = {
  authenticate: <TRequest extends BoundaryRequest>(
    input: unknown,
    parse: (input: unknown) => TRequest,
    signingText: (request: Omit<TRequest, 'mac'>) => string,
  ) => TRequest;
};

export const createBoundaryAuthenticator = ({
  secret,
  now = () => Date.now(),
  maxClockSkewMs = 30_000,
}: {
  secret: string | Uint8Array;
  now?: () => number;
  maxClockSkewMs?: number;
}): BoundaryAuthenticator => {
  if (Buffer.byteLength(secret) < 32) throw new TypeError('Production IPC secret is too short.');
  const seen = new Map<string, number>();

  return {
    authenticate: <TRequest extends BoundaryRequest>(
      input: unknown,
      parse: (input: unknown) => TRequest,
      signingText: (request: Omit<TRequest, 'mac'>) => string,
    ): TRequest => {
      let request: TRequest;
      try {
        request = parse(input);
      } catch {
        throw new BoundaryRefusal('IPC_MALFORMED');
      }
      const current = now();
      if (Math.abs(current - request.timestampMs) > maxClockSkewMs) {
        throw new BoundaryRefusal('IPC_STALE');
      }
      for (const [requestId, expiresAt] of seen) {
        if (expiresAt < current) seen.delete(requestId);
      }
      if (seen.has(request.requestId)) throw new BoundaryRefusal('IPC_REPLAY');
      const { mac, ...unsigned } = request;
      if (!verifyIpcMac(secret, signingText(unsigned as unknown as Omit<TRequest, 'mac'>), mac)) {
        throw new BoundaryRefusal('IPC_AUTH');
      }
      seen.set(request.requestId, current + maxClockSkewMs);
      return request;
    },
  };
};

const publicFailure = (): DispatchResult => ({
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

/**
 * The boundary's behaviour, separated from the socket that delivers it: protocol version and
 * shape, clock skew, replay, per-request HMAC, the audit hooks either side of the call, output
 * sanitisation, and the signed response. Two hosts call this; neither reimplements it, because
 * a second copy is a second place for the boundary to drift.
 *
 * **The replay cache is per-authenticator, and therefore per-process.** `seen` is an in-memory
 * `Map`, so one container is one cache: a request captured inside the skew window and replayed
 * against a *second* instance of this service would be accepted, because that instance has never
 * seen the id. Within one process the cache is shared across every request shape a host serves,
 * which is why {@link createBoundaryAuthenticator} is separable at all. This is a real weakening relative to the local topology, where one machine ran one
 * host. It is mitigated for this phase by running exactly one instance and by a short skew
 * window — a shared cache is a later ticket, and inventing one under a deadline is the wrong
 * shape. A reader adding a second instance is changing this property and should say so.
 */
export const createProductionBoundary = <TRequest extends BoundaryRequest>({
  secret,
  parse,
  signingText,
  dispatch,
  now,
  maxClockSkewMs,
  audit,
  authenticator,
}: ProductionBoundaryOptions<TRequest>): ProductionBoundary<TRequest> => {
  const admit = authenticator ?? createBoundaryAuthenticator({ secret, now, maxClockSkewMs });

  return {
    handle: async (input: unknown): Promise<IpcResponse> => {
      const request = admit.authenticate(input, parse, signingText);
      const startedAtMs = Date.now();
      let auditContext: unknown;
      try {
        auditContext = await audit?.before?.(request);
      } catch {
        throw new BoundaryRefusal('IPC_AUDIT');
      }
      let result: DispatchResult;
      try {
        result = await dispatch(request);
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
        throw new BoundaryRefusal('IPC_AUDIT');
      }
      return authenticatedResponse(secret, {
        protocolVersion: 1,
        requestId: request.requestId,
        exitCode: publicResult.exitCode,
        stdoutBase64: Buffer.from(publicResult.stdout, 'utf8').toString('base64'),
        stderrBase64: Buffer.from(publicResult.stderr, 'utf8').toString('base64'),
      });
    },
  };
};
