import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  type IpcRequest,
  type IpcResponse,
  ipcResponseSchema,
  requestSigningText,
  responseSigningText,
  signIpc,
  verifyIpcMac,
} from '../src/ipc/authentication';
import { encodeFrame, readFrame } from '../src/ipc/framing';

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

export const callPipe = async (
  path: string,
  request: IpcRequest,
): Promise<IpcResponse & { stdout: string; stderr: string }> => {
  const socket = createConnection(path);
  await new Promise<void>((resolveConnect, rejectConnect) => {
    socket.once('connect', resolveConnect);
    socket.once('error', rejectConnect);
  });
  socket.write(encodeFrame(request));
  const response = ipcResponseSchema.parse(await readFrame(socket));
  const { mac, ...unsigned } = response;
  if (!verifyIpcMac(IPC_SECRET, responseSigningText(unsigned), mac)) {
    throw new Error('Test client received an unauthenticated IPC response.');
  }
  return {
    ...response,
    stdout: Buffer.from(response.stdoutBase64, 'base64').toString('utf8'),
    stderr: Buffer.from(response.stderrBase64, 'base64').toString('utf8'),
  };
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
