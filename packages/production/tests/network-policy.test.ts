import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchProductionArgv } from '../src/commands/dispatch';
import { sanitizeBoundaryText } from '../src/ipc/sanitize';
import {
  type CommandFixture,
  VALID_PLAN,
  createCommandFixture,
  recordedResponseFor,
} from './command-fixture';

let fixture: CommandFixture | null = null;
afterEach(async () => fixture?.cleanup());

describe('Production boundary network policy', () => {
  it('bootstraps malformed invocations through the public contract index', async () => {
    fixture = await createCommandFixture();

    const result = await dispatchProductionArgv(fixture.service, fixture.root, [
      'production',
      'unknown',
    ]);
    const envelope = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(2);
    expect(envelope).toMatchObject({
      error: { code: 'INVALID_INVOCATION' },
      next: [
        {
          command: 'contract.index',
          args: [],
          reason: 'Discover the public Production contract.',
        },
      ],
    });
  });

  it('keeps every command except record away from the synthesis adapter', async () => {
    const synthesizer = vi.fn(async () => recordedResponseFor(VALID_PLAN));
    fixture = await createCommandFixture({ synthesizer });
    const cwd = fixture.root;

    await dispatchProductionArgv(fixture.service, cwd, ['production', 'contract', 'index']);
    await dispatchProductionArgv(fixture.service, cwd, [
      'production',
      'contract',
      'show',
      'protocol',
    ]);
    await dispatchProductionArgv(fixture.service, cwd, [
      'production',
      'run',
      'init',
      '--request',
      'request.json',
      '--out',
      'public/run',
    ]);
    await dispatchProductionArgv(fixture.service, cwd, [
      'production',
      'run',
      'status',
      '--run',
      'public/run',
    ]);
    await dispatchProductionArgv(fixture.service, cwd, [
      'production',
      'run',
      'validate',
      '--run',
      'public/run',
      '--plan',
      'plan.json',
    ]);
    await dispatchProductionArgv(fixture.service, cwd, [
      'production',
      'run',
      'preflight',
      '--run',
      'public/run',
    ]);
    await dispatchProductionArgv(fixture.service, cwd, [
      'production',
      'run',
      'compile',
      '--run',
      'public/run',
    ]);
    await dispatchProductionArgv(fixture.service, cwd, [
      'production',
      'run',
      'render',
      '--run',
      'public/run',
    ]);

    expect(synthesizer).not.toHaveBeenCalled();
    expect(fixture.network.request).not.toHaveBeenCalled();

    await dispatchProductionArgv(fixture.service, cwd, [
      'production',
      'run',
      'record',
      '--run',
      'public/run',
    ]);
    expect(synthesizer).toHaveBeenCalledTimes(1);
    expect(fixture.network.request).not.toHaveBeenCalled();
  });

  it('redacts host paths, stack lines and implementation directories at the IPC boundary', () => {
    const leaked =
      'failed at C:\\Users\\builder\\vox-studio\\packages\\production\\src\\host.ts\n' +
      '    at internalCall (C:\\repo\\node_modules\\x.js:1:2)';
    const sanitized = sanitizeBoundaryText(leaked);

    expect(sanitized).not.toContain('C:\\');
    expect(sanitized).not.toContain('node_modules');
    expect(sanitized).not.toContain('packages\\production');
    expect(sanitized).not.toMatch(/\bat\s+internalCall/);
    expect(sanitized).toContain('<redacted-path>');
  });
});
