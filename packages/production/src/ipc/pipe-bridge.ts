import { spawn } from 'node:child_process';

const readyMarker = 'VOX_PIPE_BRIDGE_READY';
const pipeNamePattern = /^[A-Za-z0-9._-]{1,180}$/u;

export type ProductionPipeBridge = {
  close: () => Promise<void>;
};

export const startProductionPipeBridge = async ({
  executable,
  publicPipeName,
  privatePipeName,
}: {
  executable: string;
  publicPipeName: string;
  privatePipeName: string;
}): Promise<ProductionPipeBridge> => {
  if (!pipeNamePattern.test(publicPipeName) || !pipeNamePattern.test(privatePipeName)) {
    throw new TypeError('Production pipe bridge names must be normalized Windows pipe names.');
  }
  if (publicPipeName === privatePipeName) {
    throw new TypeError('Production pipe bridge requires distinct public and private names.');
  }

  const child = spawn(executable, [publicPipeName, privatePipeName], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4096);
  });

  await new Promise<void>((resolveReady, rejectReady) => {
    let stdout = '';
    const timeout = setTimeout(() => {
      child.kill();
      rejectReady(new Error('PRODUCTION_PIPE_BRIDGE_START_TIMEOUT'));
    }, 30_000);
    const settle = (result: 'ready' | 'failed', error?: Error) => {
      clearTimeout(timeout);
      child.stdout.off('data', onStdout);
      child.off('error', onError);
      child.off('exit', onExit);
      if (result === 'ready') resolveReady();
      else rejectReady(error ?? new Error('PRODUCTION_PIPE_BRIDGE_START_FAILED'));
    };
    const onStdout = (chunk: Buffer) => {
      stdout = `${stdout}${chunk.toString('utf8')}`.slice(-4096);
      if (stdout.includes(readyMarker)) settle('ready');
    };
    const onError = (error: Error) => settle('failed', error);
    const onExit = (code: number | null) =>
      settle(
        'failed',
        new Error(`PRODUCTION_PIPE_BRIDGE_START_FAILED:${code ?? 1}:${stderr.trim()}`),
      );
    child.stdout.on('data', onStdout);
    child.once('error', onError);
    child.once('exit', onExit);
  });

  let closed = false;
  return {
    close: async () => {
      if (closed) return;
      closed = true;
      if (child.exitCode !== null || child.signalCode !== null) return;
      await new Promise<void>((resolveClose) => {
        const timeout = setTimeout(resolveClose, 5_000);
        child.once('close', () => {
          clearTimeout(timeout);
          resolveClose();
        });
        child.kill();
      });
    },
  };
};
