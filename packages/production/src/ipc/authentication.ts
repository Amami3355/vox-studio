import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { type JsonValue, canonicalJson } from '../canonical-json';

export const IPC_PROTOCOL_VERSION = 1 as const;
export const MAX_IPC_FRAME_BYTES = 16 * 1024 * 1024;

export const ipcRequestSchema = z
  .object({
    protocolVersion: z.literal(IPC_PROTOCOL_VERSION),
    requestId: z.uuid(),
    timestampMs: z.number().int().nonnegative(),
    cwd: z.string().min(1),
    argv: z.array(z.string()),
    mac: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const ipcResponseSchema = z
  .object({
    protocolVersion: z.literal(IPC_PROTOCOL_VERSION),
    requestId: z.uuid(),
    exitCode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    stdoutBase64: z.base64(),
    stderrBase64: z.base64(),
    mac: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

/**
 * Ticket 05's payload surface on the wire: a command name, a Run id where the command names
 * one, and a payload object where the command takes one. Both fields are present and nullable
 * rather than optional, because the signing text below has to be reproducible by a caller that
 * never guesses which fields it may leave out.
 */
export const payloadRequestSchema = z
  .object({
    protocolVersion: z.literal(IPC_PROTOCOL_VERSION),
    requestId: z.uuid(),
    timestampMs: z.number().int().nonnegative(),
    command: z.string().min(1),
    runId: z.string().min(1).nullable(),
    payload: z.record(z.string(), z.unknown()).nullable(),
    mac: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export type IpcRequest = z.infer<typeof ipcRequestSchema>;
export type PayloadIpcRequest = z.infer<typeof payloadRequestSchema>;
export type IpcResponse = z.infer<typeof ipcResponseSchema>;

const field = (value: string): string => `${Buffer.byteLength(value, 'utf8')}:${value}`;

export const requestSigningText = (request: Omit<IpcRequest, 'mac'>): string =>
  [
    'VOX-IPC-REQUEST-1',
    field(request.requestId),
    field(String(request.timestampMs)),
    field(request.cwd),
    field(String(request.argv.length)),
    ...request.argv.map(field),
  ].join('\n');

/**
 * The payload request's signing text. Its domain tag differs from `VOX-IPC-REQUEST-1` on
 * purpose: a MAC computed over an argv request must not authenticate a payload request, and a
 * shared prefix is how two transports end up with one forgeable surface between them.
 *
 * The payload is canonicalised rather than `JSON.stringify`d, because the bytes a caller signs
 * and the bytes this process re-serialises are only the same bytes if key order is.
 */
export const payloadRequestSigningText = (request: Omit<PayloadIpcRequest, 'mac'>): string =>
  [
    'VOX-IPC-PAYLOAD-REQUEST-1',
    field(request.requestId),
    field(String(request.timestampMs)),
    field(request.command),
    field(request.runId ?? ''),
    field(request.payload === null ? '' : canonicalJson(request.payload as JsonValue)),
  ].join('\n');

export const responseSigningText = (response: Omit<IpcResponse, 'mac'>): string =>
  [
    'VOX-IPC-RESPONSE-1',
    field(response.requestId),
    field(String(response.exitCode)),
    field(response.stdoutBase64),
    field(response.stderrBase64),
  ].join('\n');

export const signIpc = (secret: string | Uint8Array, value: string): string =>
  createHmac('sha256', secret).update(value, 'utf8').digest('hex');

export const verifyIpcMac = (
  secret: string | Uint8Array,
  value: string,
  actual: string,
): boolean => {
  const expected = Buffer.from(signIpc(secret, value), 'hex');
  const candidate = Buffer.from(actual, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
};

export const authenticatedResponse = (
  secret: string | Uint8Array,
  response: Omit<IpcResponse, 'mac'>,
): IpcResponse => ({ ...response, mac: signIpc(secret, responseSigningText(response)) });
