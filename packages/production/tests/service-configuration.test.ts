import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProductionCommandService } from '../src/commands/service';
import {
  PRODUCTION_SERVICE_ENVIRONMENT,
  createConfiguredProductionService,
  deniedNetworkAdapter,
  resolveProductionServiceConfiguration,
} from '../src/ipc/service-configuration';

/**
 * Ticket 07's first implementation decision: *"A second entry point, not a branch in the first."*
 * The part both entry points share is the construction of `ProductionCommandService` from a
 * resolved configuration, and it lives here so that neither entry point owns it.
 */
const COMPLETE = {
  VOX_GRANT_KEY: 'grant-key',
  ELEVENLABS_API_KEY: 'eleven-key',
  VOX_LEDGER_ROOT: '/var/lib/vox/ledger',
  VOX_RUN_HMAC_KEY: 'run-hmac',
  VOX_RUN_KEY_ID: 'key-1',
  VOX_CALIBRATION_PATH: '/var/lib/vox/calibration.json',
  VOX_REMOTION_ENTRY: '/app/packages/video/src/remotion/index.ts',
} as const;

describe('the configuration both entry points resolve', () => {
  it('resolves every path to an absolute one', () => {
    const configuration = resolveProductionServiceConfiguration({ ...COMPLETE });

    expect(configuration.ledgerRoot).toBe(resolve('/var/lib/vox/ledger'));
    expect(configuration.calibrationPath).toBe(resolve('/var/lib/vox/calibration.json'));
    expect(configuration.remotionEntryPoint).toBe(
      resolve('/app/packages/video/src/remotion/index.ts'),
    );
  });

  it.each(Object.keys(COMPLETE))('refuses to resolve without %s', (name) => {
    const env: Record<string, string | undefined> = { ...COMPLETE };
    delete env[name];

    // The wording is load-bearing: it is what the operator sees and what the runbook greps for.
    expect(() => resolveProductionServiceConfiguration(env)).toThrow(
      `Missing trusted service configuration: ${name}`,
    );
  });

  it('treats an empty value as missing, not as a value', () => {
    expect(() =>
      resolveProductionServiceConfiguration({ ...COMPLETE, VOX_RUN_KEY_ID: '' }),
    ).toThrow('Missing trusted service configuration: VOX_RUN_KEY_ID');
  });

  /**
   * The pinned browser. Ticket 11 measured the failure this prevents: Remotion resolves Chrome
   * Headless Shell relative to the *working directory*, finds nothing at the repo root, and
   * downloads 92 MB from `remotion.media` at every start. It is optional here because the local
   * service on Windows has a working resolution and does not need pinning.
   */
  it('carries an optional pinned browser executable', () => {
    expect(
      resolveProductionServiceConfiguration({ ...COMPLETE }).browserExecutable,
    ).toBeUndefined();

    expect(
      resolveProductionServiceConfiguration({
        ...COMPLETE,
        VOX_BROWSER_EXECUTABLE: '/app/node_modules/.remotion/chrome-headless-shell',
      }).browserExecutable,
    ).toBe(resolve('/app/node_modules/.remotion/chrome-headless-shell'));
  });

  /**
   * Ticket 07: *"The cloud entry point does not read `VOX_PIPE_PATH` or `VOX_IPC_TOKEN`... A
   * configuration key that exists but is ignored is a key someone will set and expect to matter."*
   * The shared resolver is the place that would quietly acquire one, so it is pinned here.
   */
  it('names no pipe configuration at all', () => {
    expect(PRODUCTION_SERVICE_ENVIRONMENT).not.toContain('VOX_PIPE_PATH');
    expect(PRODUCTION_SERVICE_ENVIRONMENT).not.toContain('VOX_IPC_TOKEN');
    expect([...PRODUCTION_SERVICE_ENVIRONMENT].sort()).toEqual(Object.keys(COMPLETE).sort());
  });
});

describe('the service the configuration builds', () => {
  it('is a ProductionCommandService', () => {
    const service = createConfiguredProductionService(
      resolveProductionServiceConfiguration({ ...COMPLETE }),
    );

    expect(service).toBeInstanceOf(ProductionCommandService);
  });
});

/**
 * ADR-0007's rule, and ADR-0018 decision 5's *strong* lock. This asserts the adapter itself; that
 * the deployed service is wired to it is asserted from inside the container by the image suite,
 * because a test that passes only because the network was unavailable has not tested the adapter.
 */
describe('the denying network adapter', () => {
  it('rejects every request with NETWORK_POLICY_DENIED', async () => {
    await expect(deniedNetworkAdapter.request()).rejects.toThrow('NETWORK_POLICY_DENIED');
  });
});
