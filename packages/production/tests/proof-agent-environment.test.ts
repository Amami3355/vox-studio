import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_SECRET_VARIABLES,
  credentialStoreCandidates,
  credentialStoreDenied,
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

  it("keeps the Codex runtime's own credentials so it can still start", () => {
    const scrubbed = scrubAgentEnvironment({
      CODEX_HOME: 'C:\\Users\\proof\\.codex',
      OPENAI_API_KEY: 'agent-runtime-key',
      ELEVENLABS_API_KEY: 'secret-eleven',
    });
    expect(scrubbed.CODEX_HOME).toBe('C:\\Users\\proof\\.codex');
    expect(scrubbed.OPENAI_API_KEY).toBe('agent-runtime-key');
    expect(scrubbed.ELEVENLABS_API_KEY).toBeUndefined();
  });

  it("keeps the crew's model credential so it can reach a model at all", () => {
    const scrubbed = scrubAgentEnvironment({
      GOOGLE_API_KEY: 'crew-model-key',
      GEMINI_API_KEY: 'crew-model-key-alternate',
      GOOGLE_APPLICATION_CREDENTIALS: 'C:\\Users\\proof\\adc.json',
      ELEVENLABS_API_KEY: 'secret-eleven',
    });
    expect(scrubbed.GOOGLE_API_KEY).toBe('crew-model-key');
    expect(scrubbed.GEMINI_API_KEY).toBe('crew-model-key-alternate');
    expect(scrubbed.GOOGLE_APPLICATION_CREDENTIALS).toBe('C:\\Users\\proof\\adc.json');
    expect(scrubbed.ELEVENLABS_API_KEY).toBeUndefined();
    expect(remainingSecretVariables(scrubbed)).toEqual([]);
  });

  it('does not let a production secret through by wearing a crew runtime prefix', () => {
    const scrubbed = scrubAgentEnvironment({
      ELEVENLABS_API_KEY: 'secret-eleven',
      GOOGLE_API_KEY: 'secret-eleven',
      GEMINI_PROJECT: 'kept',
    });
    expect(scrubbed.GOOGLE_API_KEY).toBeUndefined();
    expect(scrubbed.GEMINI_PROJECT).toBe('kept');
  });

  it('reports leftover secrets by name only, never by value', () => {
    const leftover = remainingSecretVariables({ ELEVENLABS_API_KEY: 'secret-eleven' });
    expect(leftover).toEqual(['ELEVENLABS_API_KEY']);
    expect(JSON.stringify(leftover)).not.toContain('secret-eleven');
  });
});

describe('credential stores the agent must be denied', () => {
  const home = 'C:\\Users\\proof';

  it("names the crew's store as well as the Codex one, so the probe can fail for a crew", () => {
    const candidates = credentialStoreCandidates({ APPDATA: 'C:\\Users\\proof\\AppData' }, home);
    expect(candidates).toContain(
      'C:\\Users\\proof\\AppData\\gcloud\\application_default_credentials.json',
    );
    expect(candidates).toContain('C:\\Users\\proof\\.codex\\auth.json');
  });

  it('follows the locations the runtimes themselves are configured with', () => {
    const candidates = credentialStoreCandidates(
      {
        GOOGLE_APPLICATION_CREDENTIALS: 'C:\\keys\\service-account.json',
        CLOUDSDK_CONFIG: 'D:\\gcloud-config',
        CODEX_HOME: 'D:\\codex-home',
      },
      home,
    );
    expect(candidates).toEqual([
      'C:\\keys\\service-account.json',
      'D:\\gcloud-config\\application_default_credentials.json',
      'D:\\codex-home\\auth.json',
    ]);
  });

  it('lists each store once even when two settings point at the same file', () => {
    const candidates = credentialStoreCandidates(
      {
        GOOGLE_APPLICATION_CREDENTIALS: 'D:\\gcloud-config\\application_default_credentials.json',
        CLOUDSDK_CONFIG: 'D:\\gcloud-config',
      },
      home,
    );
    expect(candidates.filter((path) => path.includes('application_default'))).toHaveLength(1);
  });

  it('fails when the credential is reachable, and refuses to conclude from a timeout', () => {
    expect(credentialStoreDenied({ exitCode: 1, timedOut: false })).toBe(true);
    // The store was read: this is the breach the probe exists to catch.
    expect(credentialStoreDenied({ exitCode: 0, timedOut: false })).toBe(false);
    // A probe that never returned proves nothing, so it may not report denial.
    expect(credentialStoreDenied({ exitCode: 1, timedOut: true })).toBe(false);
  });
});
