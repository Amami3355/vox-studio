import { describe, expect, it } from 'vitest';
import { codexProofExecArguments, sandboxWorkRootIsUsable } from '../src/proof/codex-agent';

describe('Codex proof agent arguments', () => {
  it('configures non-interactive approvals through supported exec configuration', () => {
    const args = codexProofExecArguments('C:\\proof-work', 'gpt-5.6-sol', 'author the plan');

    expect(args).not.toContain('--ask-for-approval');
    expect(args).not.toContain('tools.view_image=false');
    expect(args).toContain('approval_policy="never"');
    expect(args).toContain('workspace-write');
  });

  it('rejects a successful write probe that actually ran from C drive', () => {
    const process = { exitCode: 0, stdout: '', stderr: '', timedOut: false };
    expect(
      sandboxWorkRootIsUsable({
        expectedRoot: 'C:\\proof-work',
        cwdProbe: { ...process, stdout: 'C:\\\r\n' },
        writeProbe: process,
        markerPresent: false,
      }),
    ).toBe(false);
    expect(
      sandboxWorkRootIsUsable({
        expectedRoot: 'C:\\proof-work',
        cwdProbe: { ...process, stdout: 'C:\\proof-work\r\n' },
        writeProbe: process,
        markerPresent: true,
      }),
    ).toBe(true);
  });
});
