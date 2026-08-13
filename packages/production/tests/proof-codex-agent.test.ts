import { describe, expect, it } from 'vitest';
import { codexProofExecArguments } from '../src/proof/codex-agent';

describe('Codex proof agent arguments', () => {
  it('configures non-interactive approvals through supported exec configuration', () => {
    const args = codexProofExecArguments('C:\\proof-work', 'gpt-5.6-sol', 'author the plan');

    expect(args).not.toContain('--ask-for-approval');
    expect(args).not.toContain('tools.view_image=false');
    expect(args).toContain('approval_policy="never"');
  });
});
