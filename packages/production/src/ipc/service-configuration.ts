import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { createElevenLabsAdapter } from '@vox/voice';
import { type JsonValue, canonicalJson } from '../canonical-json';
import { ProductionCommandService } from '../commands/service';
import type { NetworkAdapter } from '../commands/service';
import type { ReplacementGrant } from '../contracts/schemas';
import { DurationCalibrationStore } from '../preflight/calibration';
import { createRemotionRenderAdapter } from '../render/remotion';

/**
 * The environment variables **this resolver requires**, which is a narrower claim than the name it
 * used to carry. It is not every variable the trusted service reads: each topology's transport
 * configuration is its own — `VOX_PIPE_PATH` and `VOX_IPC_TOKEN` in `service-host.ts`,
 * `VOX_NETWORK_TOKEN`, `VOX_VOLUME_ROOT`, `VOX_RUNS_ROOT` and the bind/port pair in
 * `cloud-host.ts` — and `VOX_BROWSER_EXECUTABLE` is optional and so absent by design.
 *
 * It was `PRODUCTION_SERVICE_ENVIRONMENT`, documented as "every environment variable the trusted
 * service needs, in either topology", and it never was: five of the cloud host's keys were missing
 * from it. A list whose name and docstring claim more than its membership is the checklist failure
 * this phase keeps finding, in code rather than in Markdown.
 *
 * **No pipe key appears here and that is deliberate.** They stay in `service-host.ts`, so the
 * cloud entry point cannot acquire them by sharing this resolver. Ticket 07: *"A configuration key
 * that exists but is ignored is a key someone will set and expect to matter."*
 *
 * Its consumer is the test beside it, which pins the membership to what the resolver actually
 * demands — every name here must throw when removed, and no name may be missing from it.
 */
export const SHARED_SERVICE_ENVIRONMENT = [
  'VOX_GRANT_KEY',
  'ELEVENLABS_API_KEY',
  'VOX_LEDGER_ROOT',
  'VOX_RUN_HMAC_KEY',
  'VOX_RUN_KEY_ID',
  'VOX_CALIBRATION_PATH',
  'VOX_REMOTION_ENTRY',
] as const;

export type ProductionServiceConfiguration = {
  grantKey: string;
  apiKey: string;
  ledgerRoot: string;
  runHmacKey: string;
  runKeyId: string;
  calibrationPath: string;
  remotionEntryPoint: string;
  browserExecutable: string | undefined;
};

export type Environment = Record<string, string | undefined>;

/**
 * The one reader of a required variable, exported because there were three of it.
 *
 * `cloud-host.ts` and this file held byte-identical copies and `service-host.ts` a third over
 * `process.env`, all producing the same message. The message is the part that matters: it is what
 * the operator sees and what the runbook greps for, so three copies of it is three chances for one
 * of them to drift into a message no runbook matches.
 */
export const required = (env: Environment, name: string): string => {
  const value = env[name];
  if (!value) throw new Error(`Missing trusted service configuration: ${name}`);
  return value;
};

/**
 * Reads the configuration both entry points need. Secrets arrive in the environment; who put them
 * there — an operator's shell locally, Secret Manager bound by the runtime in the cloud — is
 * provisioning rather than a code path, which is why this function cannot tell the difference.
 */
export const resolveProductionServiceConfiguration = (
  env: Environment = process.env,
): ProductionServiceConfiguration => {
  const browserExecutable = env.VOX_BROWSER_EXECUTABLE;
  return {
    grantKey: required(env, 'VOX_GRANT_KEY'),
    apiKey: required(env, 'ELEVENLABS_API_KEY'),
    ledgerRoot: resolve(required(env, 'VOX_LEDGER_ROOT')),
    runHmacKey: required(env, 'VOX_RUN_HMAC_KEY'),
    runKeyId: required(env, 'VOX_RUN_KEY_ID'),
    calibrationPath: resolve(required(env, 'VOX_CALIBRATION_PATH')),
    remotionEntryPoint: resolve(required(env, 'VOX_REMOTION_ENTRY')),
    browserExecutable: browserExecutable ? resolve(browserExecutable) : undefined,
  };
};

/**
 * ADR-0007's rule, enforced in code rather than by a firewall: only `record` may reach outbound
 * network, and it does so through the synthesis adapter rather than through this one.
 *
 * ADR-0018 decision 5 calls this the *strong* lock, and in a container with egress it is the only
 * one the deployment actually enforces — a VPC firewall rule cannot name a host, so the two-host
 * allowlist beside it is documented intent. It matters more here than it did locally, not less.
 */
export const deniedNetworkAdapter: NetworkAdapter = {
  request: async () => Promise.reject(new Error('NETWORK_POLICY_DENIED')),
};

const replacementGrantVerifier =
  (grantKey: string) =>
  (grant: ReplacementGrant): boolean => {
    const unsigned = {
      protocolVersion: grant.protocolVersion,
      grantId: grant.grantId,
      runId: grant.runId,
      recordingInputSha256: grant.recordingInputSha256,
      issuedAt: grant.issuedAt,
    };
    const expected = createHmac('sha256', grantKey)
      .update(canonicalJson(unsigned as unknown as JsonValue))
      .digest();
    const actual = Buffer.from(grant.grant, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  };

/**
 * The construction both entry points perform, moved here unchanged so that neither topology can
 * drift from the other by editing its own copy. What differs between them is the transport bound
 * around this service, and nothing else.
 */
export const createConfiguredProductionService = (
  configuration: ProductionServiceConfiguration,
): ProductionCommandService =>
  new ProductionCommandService({
    ledgerRoot: configuration.ledgerRoot,
    hmacKey: configuration.runHmacKey,
    keyId: configuration.runKeyId,
    calibrationStore: new DurationCalibrationStore(configuration.calibrationPath),
    network: deniedNetworkAdapter,
    synthesizer: createElevenLabsAdapter({ apiKey: configuration.apiKey }),
    verifyReplacementGrant: replacementGrantVerifier(configuration.grantKey),
    renderer: createRemotionRenderAdapter({
      entryPoint: configuration.remotionEntryPoint,
      browserExecutable: configuration.browserExecutable,
    }),
    compilerVersion: '1',
    rendererVersion: 'remotion-4.0.508',
  });
