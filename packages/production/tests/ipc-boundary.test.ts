import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  type IpcRequest,
  ipcRequestSchema,
  requestSigningText,
  responseSigningText,
  signIpc,
  verifyIpcMac,
} from '../src/ipc/authentication';
import { BoundaryRefusal, createProductionBoundary } from '../src/ipc/boundary';
import { IPC_SECRET, signedRequest } from './ipc-fixture';

const served = { exitCode: 0 as const, stdout: 'served\n', stderr: '' };

const boundaryWith = (
  options: { now?: () => number; maxClockSkewMs?: number } = {},
): {
  boundary: ReturnType<typeof createProductionBoundary<IpcRequest>>;
  dispatch: ReturnType<typeof vi.fn>;
} => {
  const dispatch = vi.fn(async () => served);
  const boundary = createProductionBoundary<IpcRequest>({
    secret: IPC_SECRET,
    parse: (input) => ipcRequestSchema.parse(input),
    signingText: requestSigningText,
    dispatch,
    ...options,
  });
  return { boundary, dispatch };
};

/**
 * The seam both hosts call. Each refusal is asserted on its own, because a handler that refuses
 * everything for one reason passes a test that only checks that it refused.
 */
describe('the shared boundary', () => {
  it('signs a response the caller can verify, over a dispatch it actually made', async () => {
    const { boundary, dispatch } = boundaryWith();
    const request = signedRequest('C:\\work', ['production', 'contract', 'index']);

    const response = await boundary.handle(request);
    const { mac, ...unsigned } = response;

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(response.requestId).toBe(request.requestId);
    expect(verifyIpcMac(IPC_SECRET, responseSigningText(unsigned), mac)).toBe(true);
    expect(Buffer.from(response.stdoutBase64, 'base64').toString('utf8')).toBe('served\n');
  });

  it('refuses a replayed requestId, without dispatching it a second time', async () => {
    const { boundary, dispatch } = boundaryWith();
    const request = signedRequest('C:\\work', ['production', 'contract', 'index']);
    await boundary.handle(request);

    await expect(boundary.handle(request)).rejects.toThrow(BoundaryRefusal);
    await expect(boundary.handle(request)).rejects.toMatchObject({ code: 'IPC_REPLAY' });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('refuses a request outside the skew window, without dispatching it', async () => {
    const { boundary, dispatch } = boundaryWith({ maxClockSkewMs: 1_000 });

    await expect(
      boundary.handle(
        signedRequest('C:\\work', ['production', 'contract', 'index'], {
          timestampMs: Date.now() - 60_000,
        }),
      ),
    ).rejects.toMatchObject({ code: 'IPC_STALE' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('refuses a bad MAC, without dispatching it', async () => {
    const { boundary, dispatch } = boundaryWith();

    await expect(
      boundary.handle({
        ...signedRequest('C:\\work', ['production', 'contract', 'index']),
        mac: '0'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'IPC_AUTH' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('refuses a request whose shape is not the protocol, without dispatching it', async () => {
    const { boundary, dispatch } = boundaryWith();

    await expect(boundary.handle({ hello: 'world' })).rejects.toMatchObject({
      code: 'IPC_MALFORMED',
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('refuses a MAC signed over different argv, so the signature covers the command', async () => {
    const { boundary } = boundaryWith();
    const unsigned = {
      protocolVersion: 1 as const,
      requestId: randomUUID(),
      timestampMs: Date.now(),
      cwd: 'C:\\work',
      argv: ['production', 'contract', 'index'],
    };
    const tampered = {
      ...unsigned,
      argv: ['production', 'run', 'record', '--run', 'C:\\work'],
      mac: signIpc(IPC_SECRET, requestSigningText(unsigned)),
    };

    await expect(boundary.handle(tampered)).rejects.toMatchObject({ code: 'IPC_AUTH' });
  });

  it('answers a dispatch that throws with the public failure, not with the error', async () => {
    const boundary = createProductionBoundary<IpcRequest>({
      secret: IPC_SECRET,
      parse: (input) => ipcRequestSchema.parse(input),
      signingText: requestSigningText,
      dispatch: async () => {
        throw new Error('the ledger at C:\\vox\\private is unreadable');
      },
    });

    const response = await boundary.handle(
      signedRequest('C:\\work', ['production', 'contract', 'index']),
    );
    const stdout = Buffer.from(response.stdoutBase64, 'base64').toString('utf8');

    expect(response.exitCode).toBe(1);
    expect(stdout).not.toContain('C:\\vox');
    expect(JSON.parse(stdout)).toMatchObject({
      outcome: 'failed',
      error: { code: 'PRODUCTION_SERVICE_FAILED' },
    });
  });

  it('sanitises the dispatch result before it is signed', async () => {
    const boundary = createProductionBoundary<IpcRequest>({
      secret: IPC_SECRET,
      parse: (input) => ipcRequestSchema.parse(input),
      signingText: requestSigningText,
      dispatch: async () => ({
        exitCode: 0 as const,
        stdout: 'wrote /var/lib/vox/runs/run-a/plan.json\n',
        stderr: 'from C:\\repo\\packages\\production\\src\\x.ts\n',
      }),
    });

    const response = await boundary.handle(
      signedRequest('C:\\work', ['production', 'contract', 'index']),
    );

    expect(Buffer.from(response.stdoutBase64, 'base64').toString('utf8')).not.toContain('/var/lib');
    expect(Buffer.from(response.stderrBase64, 'base64').toString('utf8')).not.toContain('C:\\repo');
  });

  it('refuses a secret too short to be one', () => {
    expect(() =>
      createProductionBoundary<IpcRequest>({
        secret: 'short',
        parse: (input) => ipcRequestSchema.parse(input),
        signingText: requestSigningText,
        dispatch: async () => served,
      }),
    ).toThrow(/too short/i);
  });
});
