import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_SECRET_VARIABLES,
  remainingSecretVariables,
  scrubAgentEnvironment,
} from '../src/proof/agent-environment';

describe('isolated agent environment', () => {
  it('removes production credentials the machine happens to export', () => {
    const scrubbed = scrubAgentEnvironment({
      ELEVENLABS_API_KEY: 'secret-eleven',
      VOX_GRANT_KEY: 'secret-grant',
      VOX_RUN_HMAC_KEY: 'secret-hmac',
      USERPROFILE: 'C:\\Users\\proof',
    });
    for (const name of PRODUCTION_SECRET_VARIABLES) expect(scrubbed[name]).toBeUndefined();
    expect(scrubbed.USERPROFILE).toBe('C:\\Users\\proof');
    expect(remainingSecretVariables(scrubbed)).toEqual([]);
  });

  it('removes unrelated credential-shaped variables without being told their names', () => {
    const scrubbed = scrubAgentEnvironment({
      BRAVE_API_KEY: 'other-secret',
      SOME_SERVICE_TOKEN: 'other-token',
      DB_PASSWORD: 'other-password',
      PATH: 'C:\\Windows\\System32',
    });
    expect(remainingSecretVariables(scrubbed)).toEqual([]);
    expect(Object.keys(scrubbed)).toEqual(['PATH']);
  });

  it('removes a secret aliased under an innocent name', () => {
    const scrubbed = scrubAgentEnvironment({
      ELEVENLABS_API_KEY: 'secret-eleven',
      HELPFUL_COPY: 'secret-eleven',
      UNRELATED: 'kept',
    });
    expect(scrubbed.HELPFUL_COPY).toBeUndefined();
    expect(scrubbed.UNRELATED).toBe('kept');
  });

  it("keeps the agent runtime's own credentials so Codex can still start", () => {
    const scrubbed = scrubAgentEnvironment({
      CODEX_HOME: 'C:\\Users\\proof\\.codex',
      OPENAI_API_KEY: 'agent-runtime-key',
      ELEVENLABS_API_KEY: 'secret-eleven',
    });
    expect(scrubbed.CODEX_HOME).toBe('C:\\Users\\proof\\.codex');
    expect(scrubbed.OPENAI_API_KEY).toBe('agent-runtime-key');
    expect(scrubbed.ELEVENLABS_API_KEY).toBeUndefined();
  });

  it('reports leftover secrets by name only, never by value', () => {
    const leftover = remainingSecretVariables({ ELEVENLABS_API_KEY: 'secret-eleven' });
    expect(leftover).toEqual(['ELEVENLABS_API_KEY']);
    expect(JSON.stringify(leftover)).not.toContain('secret-eleven');
  });
});
