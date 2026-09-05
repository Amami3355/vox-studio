import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  type ArtifactDescriptorWire,
  type ArtifactIpcRequest,
  type IpcRequest,
  type IpcResponse,
  type PayloadIpcRequest,
  artifactRequestSigningText,
  ipcResponseSchema,
  payloadRequestSigningText,
  requestSigningText,
  responseSigningText,
  signIpc,
  verifyIpcMac,
} from '../src/ipc/authentication';
import { encodeFrame, readFrame } from '../src/ipc/framing';
import { PRODUCTION_ARTIFACT_PATH, PRODUCTION_NETWORK_PATH } from '../src/ipc/network-host';

const execFileAsync = promisify(execFile);

export const IPC_SECRET = 'ipc-test-secret-that-is-at-least-thirty-two-bytes';

export const pipeName = (): string => `vox-production-${randomUUID()}`;
export const pipePath = (name: string): string => `\\\\.\\pipe\\${name}`;

export const signedRequest = (
  cwd: string,
  argv: string[],
  overrides: Partial<Omit<IpcRequest, 'mac'>> = {},
): IpcRequest => {
  const unsigned = {
    protocolVersion: 1 as const,
    requestId: randomUUID(),
    timestampMs: Date.now(),
    cwd,
    argv,
    ...overrides,
  };
  return { ...unsigned, mac: signIpc(IPC_SECRET, requestSigningText(unsigned)) };
};

export type VerifiedResponse = IpcResponse & { stdout: string; stderr: string };

/**
 * The half of a client that is the same over either transport: parse the response shape, refuse
 * one this service did not sign, and decode the streams. Both clients below end here, because a
 * response the caller cannot authenticate is the failure they are both looking for.
 */
export const verifiedResponse = (raw: unknown): VerifiedResponse => {
  const response = ipcResponseSchema.parse(raw);
  const { mac, ...unsigned } = response;
  if (!verifyIpcMac(IPC_SECRET, responseSigningText(unsigned), mac)) {
    throw new Error('Test client received an unauthenticated response.');
  }
  return {
    ...response,
    stdout: Buffer.from(response.stdoutBase64, 'base64').toString('utf8'),
    stderr: Buffer.from(response.stderrBase64, 'base64').toString('utf8'),
  };
};

export const callPipe = async (path: string, request: IpcRequest): Promise<VerifiedResponse> => {
  const socket = createConnection(path);
  await new Promise<void>((resolveConnect, rejectConnect) => {
    socket.once('connect', resolveConnect);
    socket.once('error', rejectConnect);
  });
  socket.write(encodeFrame(request));
  return verifiedResponse(await readFrame(socket));
};

export const signedPayloadRequest = (
  command: string,
  overrides: Partial<Omit<PayloadIpcRequest, 'mac'>> = {},
): PayloadIpcRequest => {
  const unsigned = {
    protocolVersion: 1 as const,
    requestId: randomUUID(),
    timestampMs: Date.now(),
    command,
    runId: null,
    payload: null,
    ...overrides,
  };
  return { ...unsigned, mac: signIpc(IPC_SECRET, payloadRequestSigningText(unsigned)) };
};

/**
 * The network host's client, kept deliberately dumb: it opens a connection, posts one JSON body
 * and reads one back. A refused request reaches it as a transport error rather than as a status
 * code, which is the point — the host destroys the socket rather than saying why.
 */
export const callNetwork = async (
  port: number,
  body: unknown,
  options: { method?: string; path?: string } = {},
): Promise<VerifiedResponse> => {
  const encoded = Buffer.from(JSON.stringify(body), 'utf8');
  const raw = await new Promise<{ status: number; text: string }>((resolveCall, rejectCall) => {
    const call = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'POST',
        path: options.path ?? PRODUCTION_NETWORK_PATH,
        headers: { 'content-type': 'application/json', 'content-length': encoded.byteLength },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolveCall({
            status: response.statusCode ?? 0,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        response.on('error', rejectCall);
      },
    );
    call.on('error', rejectCall);
    call.end(encoded);
  });
  if (raw.status !== 200) throw new Error(`Production network host answered ${raw.status}.`);
  return verifiedResponse(JSON.parse(raw.text));
};

export const signedArtifactRequest = (
  runId: string,
  descriptor: ArtifactDescriptorWire,
  overrides: Partial<Omit<ArtifactIpcRequest, 'mac'>> = {},
): ArtifactIpcRequest => {
  const unsigned = {
    protocolVersion: 1 as const,
    requestId: randomUUID(),
    timestampMs: Date.now(),
    runId,
    descriptor,
    ...overrides,
  };
  return { ...unsigned, mac: signIpc(IPC_SECRET, artifactRequestSigningText(unsigned)) };
};

export type RetrievedBody = {
  contentType: string;
  bytes: Buffer;
};

/**
 * The artifact route's client. It reads bytes rather than an envelope, so unlike
 * {@link callNetwork} it cannot check a response MAC — the descriptor's digest is what
 * authenticates these bytes, and the caller already holds it from a signed envelope.
 */
export const callArtifact = async (
  port: number,
  body: unknown,
  options: { method?: string; path?: string } = {},
): Promise<RetrievedBody> => {
  const encoded = Buffer.from(JSON.stringify(body), 'utf8');
  const raw = await new Promise<{ status: number; contentType: string; bytes: Buffer }>(
    (resolveCall, rejectCall) => {
      const call = httpRequest(
        {
          host: '127.0.0.1',
          port,
          method: options.method ?? 'POST',
          path: options.path ?? PRODUCTION_ARTIFACT_PATH,
          headers: { 'content-type': 'application/json', 'content-length': encoded.byteLength },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () =>
            resolveCall({
              status: response.statusCode ?? 0,
              contentType: String(response.headers['content-type'] ?? ''),
              bytes: Buffer.concat(chunks),
            }),
          );
          response.on('error', rejectCall);
        },
      );
      call.on('error', rejectCall);
      call.end(encoded);
    },
  );
  if (raw.status !== 200) throw new Error(`Production artifact route answered ${raw.status}.`);
  return { contentType: raw.contentType, bytes: raw.bytes };
};

export const compileTestLauncher = async (output: string): Promise<void> => {
  const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
  await execFileAsync(csc, [
    '/nologo',
    '/target:exe',
    '/platform:x64',
    '/optimize+',
    '/debug-',
    `/out:${resolve(output)}`,
    '/reference:System.Web.Extensions.dll',
    resolve(import.meta.dirname, '../launcher/Program.cs'),
  ]);
};

export const compileRestrictedRunner = async (output: string): Promise<void> => {
  const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
  await execFileAsync(csc, [
    '/nologo',
    '/target:exe',
    '/platform:x64',
    '/optimize+',
    '/debug-',
    `/out:${resolve(output)}`,
    resolve(import.meta.dirname, 'fixtures/RestrictedRunner.cs'),
  ]);
};

export const compilePipeAclHelper = async (output: string): Promise<void> => {
  const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
  await execFileAsync(csc, [
    '/nologo',
    '/target:exe',
    '/platform:x64',
    '/optimize+',
    '/debug-',
    `/out:${resolve(output)}`,
    resolve(import.meta.dirname, '../service/PipeAcl.cs'),
  ]);
};

export const compilePipeBridge = async (output: string): Promise<void> => {
  const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
  await execFileAsync(csc, [
    '/nologo',
    '/target:exe',
    '/platform:x64',
    '/optimize+',
    '/debug-',
    `/out:${resolve(output)}`,
    resolve(import.meta.dirname, '../service/PipeBridge.cs'),
  ]);
};

export const authorizeRestrictedPipeClients = async (
  helper: string,
  name: string,
): Promise<void> => {
  await execFileAsync(helper, [name], { windowsHide: true });
};

export const grantRestrictedPrincipal = async (path: string): Promise<void> => {
  await execFileAsync('icacls.exe', [
    resolve(path),
    '/grant',
    '*S-1-5-32-545:(OI)(CI)(F)',
    '*S-1-5-12:(OI)(CI)(F)',
    '/inheritance:e',
  ]);
};
