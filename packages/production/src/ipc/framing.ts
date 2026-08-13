import type { Socket } from 'node:net';
import { MAX_IPC_FRAME_BYTES } from './authentication';

export const encodeFrame = (value: unknown): Buffer => {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  if (body.byteLength > MAX_IPC_FRAME_BYTES) throw new Error('IPC_FRAME_TOO_LARGE');
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(body.byteLength);
  return Buffer.concat([header, body]);
};

export const readFrame = (socket: Socket): Promise<unknown> =>
  new Promise((resolveFrame, rejectFrame) => {
    let buffered = Buffer.alloc(0);
    let expected: number | null = null;
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('end', onEnd);
    };
    const fail = (error: Error) => {
      cleanup();
      rejectFrame(error);
    };
    const onError = (error: Error) => fail(error);
    const onEnd = () => fail(new Error('IPC_FRAME_INCOMPLETE'));
    const onData = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (expected === null && buffered.byteLength >= 4) {
        expected = buffered.readUInt32LE(0);
        if (expected === 0 || expected > MAX_IPC_FRAME_BYTES) {
          fail(new Error('IPC_FRAME_LENGTH_INVALID'));
          return;
        }
      }
      if (expected !== null && buffered.byteLength >= expected + 4) {
        const trailing = buffered.byteLength - expected - 4;
        if (trailing !== 0) {
          fail(new Error('IPC_MULTIPLE_FRAMES_FORBIDDEN'));
          return;
        }
        const json = buffered.subarray(4);
        cleanup();
        try {
          resolveFrame(JSON.parse(json.toString('utf8')));
        } catch {
          rejectFrame(new Error('IPC_FRAME_JSON_INVALID'));
        }
      }
    };
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('end', onEnd);
  });
