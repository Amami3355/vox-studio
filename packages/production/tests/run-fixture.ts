import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CrashPoint, RunStore, type RunStoreOptions } from '../src/run-store/run-store';

export const REQUEST = {
  protocolVersion: 1,
  brief: { id: 'northbridge', text: 'Explain why the night bus route changed.' },
  production: {
    voice: {
      provider: 'elevenlabs',
      voiceId: 'JBFqnCBsd6RMkjVDRZzb',
      modelId: 'eleven_v3',
      seed: 7,
    },
    maxNewTakes: 2,
  },
} as const;

export type RunFixture = {
  root: string;
  runRoot: string;
  ledgerRoot: string;
  options: RunStoreOptions;
  store: RunStore;
  setCrashPoint: (point: CrashPoint | null) => void;
  cleanup: () => Promise<void>;
};

export const createRunFixture = async (): Promise<RunFixture> => {
  const root = await mkdtemp(join(tmpdir(), 'vox-run-store-'));
  const publicRoot = join(root, 'public');
  const runRoot = join(publicRoot, 'run');
  const ledgerRoot = join(root, 'private');
  await mkdir(publicRoot);
  let crashPoint: CrashPoint | null = null;

  const options: RunStoreOptions = {
    runRoot,
    ledgerRoot,
    runId: 'run-northbridge',
    hmacKey: 'test-only-secret-key',
    keyId: 'test-key',
    lockTimeoutMs: 50,
    crashAt: (point) => {
      if (point === crashPoint) {
        crashPoint = null;
        throw new Error(`INJECTED_CRASH:${point}`);
      }
    },
  };
  const store = new RunStore(options);
  await store.initialize(REQUEST);

  return {
    root,
    runRoot,
    ledgerRoot,
    options,
    store,
    setCrashPoint: (point) => {
      crashPoint = point;
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
};
