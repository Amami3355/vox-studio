import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductionIpcHost } from '../src/ipc/host';
import { createProductionIpcHost } from '../src/ipc/host';
import { type ProductionPipeBridge, startProductionPipeBridge } from '../src/ipc/pipe-bridge';
import {
  type CommandFixture,
  VALID_PLAN,
  createCommandFixture,
  recordedResponseFor,
} from './command-fixture';
import {
  IPC_SECRET,
  compilePipeBridge,
  compileRestrictedRunner,
  compileTestLauncher,
  grantRestrictedPrincipal,
  pipeName,
  pipePath,
} from './ipc-fixture';

const execFileAsync = promisify(execFile);
const VALID_MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x10, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00,
]);

let fixture: CommandFixture | null = null;
let host: ProductionIpcHost | null = null;
let bridge: ProductionPipeBridge | null = null;
afterEach(async () => {
  await bridge?.close();
  await host?.close();
  await fixture?.cleanup();
  host = null;
  bridge = null;
  fixture = null;
});

const launch = async (
  runner: string,
  executable: string,
  name: string,
  cwd: string,
  argv: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
  try {
    const result = await execFileAsync(runner, ['--launch', cwd, executable, ...argv], {
      cwd,
      env: { ...process.env, VOX_PIPE_NAME: name, VOX_IPC_TOKEN: IPC_SECRET },
      windowsHide: true,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failed = error as Error & { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof failed.code === 'number' ? failed.code : 1,
      stdout: failed.stdout ?? '',
      stderr: failed.stderr ?? '',
    };
  }
};

const assertEnvelope = (
  result: { exitCode: number; stdout: string; stderr: string },
  command: string | null,
  outcome: string,
): void => {
  expect(result.stderr).toBe('');
  expect(result.stdout.split('\n')).toHaveLength(2);
  expect(JSON.parse(result.stdout)).toMatchObject({ command, outcome });
};

describe('native vox launcher stdio contract', () => {
  it('forwards every non-decline public command with exact stdout and exit semantics', async () => {
    const synthesizer = vi.fn(async () => recordedResponseFor(VALID_PLAN));
    const renderer = vi.fn(async () => ({
      bytes: VALID_MP4,
      container: 'mp4' as const,
      videoCodec: 'h264' as const,
      audioCodec: 'aac' as const,
    }));
    fixture = await createCommandFixture({ synthesizer, renderer, splitTrustedRoot: true });
    const executable = join(fixture.root, 'vox.exe');
    const runner = join(fixture.root, 'restricted-runner.exe');
    const pipeBridge = join(fixture.trustedRoot, 'vox-pipe-bridge.exe');
    await compileTestLauncher(executable);
    await compileRestrictedRunner(runner);
    await compilePipeBridge(pipeBridge);
    await grantRestrictedPrincipal(fixture.root);
    const name = pipeName();
    const trustedName = pipeName();
    host = createProductionIpcHost({
      pipePath: pipePath(trustedName),
      secret: IPC_SECRET,
      service: fixture.service,
    });
    await host.listen();
    bridge = await startProductionPipeBridge({
      executable: pipeBridge,
      publicPipeName: name,
      privatePipeName: trustedName,
    });

    const workRootProbe = await launch(runner, runner, name, fixture.root, [
      '--probe-readwrite',
      fixture.root,
    ]);
    expect(workRootProbe).toEqual({ exitCode: 0, stdout: 'readwrite\n', stderr: '' });

    for (const protectedPath of [
      join(import.meta.dirname, '../src/index.ts'),
      fixture.trustedRoot,
    ]) {
      const probe = await launch(runner, runner, name, fixture.root, [
        '--probe-denied',
        protectedPath,
      ]);
      expect(probe).toEqual({ exitCode: 0, stdout: 'denied\n', stderr: '' });
    }

    assertEnvelope(
      await launch(runner, executable, name, fixture.root, ['production', 'contract', 'index']),
      'contract.index',
      'succeeded',
    );
    for (const category of ['language', 'plan', 'catalog', 'checks', 'protocol']) {
      assertEnvelope(
        await launch(runner, executable, name, fixture.root, [
          'production',
          'contract',
          'show',
          category,
        ]),
        'contract.show',
        'succeeded',
      );
    }

    const commands: Array<{ argv: string[]; command: string }> = [
      {
        argv: ['production', 'run', 'init', '--request', 'request.json', '--out', 'public/run'],
        command: 'run.init',
      },
      {
        argv: ['production', 'run', 'status', '--run', 'public/run'],
        command: 'run.status',
      },
      {
        argv: ['production', 'run', 'validate', '--run', 'public/run', '--plan', 'plan.json'],
        command: 'run.validate',
      },
      {
        argv: ['production', 'run', 'preflight', '--run', 'public/run'],
        command: 'run.preflight',
      },
      {
        argv: ['production', 'run', 'record', '--run', 'public/run'],
        command: 'run.record',
      },
      {
        argv: ['production', 'run', 'compile', '--run', 'public/run'],
        command: 'run.compile',
      },
      {
        argv: ['production', 'run', 'render', '--run', 'public/run'],
        command: 'run.render',
      },
    ];
    for (const item of commands) {
      const result = await launch(runner, executable, name, fixture.root, item.argv);
      expect(result.exitCode).toBe(0);
      assertEnvelope(result, item.command, 'succeeded');
    }
    expect(synthesizer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(fixture.network.request).not.toHaveBeenCalled();

    const checkpoint = JSON.parse(await readFile(join(fixture.runRoot, 'run.json'), 'utf8')) as {
      bindings: { render: { preview: { path: string } } };
    };
    expect(await readFile(join(fixture.runRoot, checkpoint.bindings.render.preview.path))).toEqual(
      VALID_MP4,
    );
  }, 30_000);

  it('forwards decline and malformed-invocation process codes exactly', async () => {
    fixture = await createCommandFixture({ splitTrustedRoot: true });
    const executable = join(fixture.root, 'vox.exe');
    const runner = join(fixture.root, 'restricted-runner.exe');
    const pipeBridge = join(fixture.trustedRoot, 'vox-pipe-bridge.exe');
    await compileTestLauncher(executable);
    await compileRestrictedRunner(runner);
    await compilePipeBridge(pipeBridge);
    await grantRestrictedPrincipal(fixture.root);
    const name = pipeName();
    const trustedName = pipeName();
    host = createProductionIpcHost({
      pipePath: pipePath(trustedName),
      secret: IPC_SECRET,
      service: fixture.service,
    });
    await host.listen();
    bridge = await startProductionPipeBridge({
      executable: pipeBridge,
      publicPipeName: name,
      privatePipeName: trustedName,
    });
    await launch(runner, executable, name, fixture.root, [
      'production',
      'run',
      'init',
      '--request',
      'request.json',
      '--out',
      'public/run',
    ]);

    const declined = await launch(runner, executable, name, fixture.root, [
      'production',
      'run',
      'decline',
      '--run',
      'public/run',
      '--decision',
      'decline.json',
    ]);
    expect(declined.exitCode).toBe(0);
    assertEnvelope(declined, 'run.decline', 'declined');

    const malformed = await launch(runner, executable, name, fixture.root, [
      'production',
      'unknown',
    ]);
    expect(malformed.exitCode).toBe(2);
    assertEnvelope(malformed, null, 'failed');
  }, 30_000);
});
