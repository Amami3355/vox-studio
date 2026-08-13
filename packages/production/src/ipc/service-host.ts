import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { createElevenLabsAdapter } from '@vox/voice';
import { type JsonValue, canonicalJson } from '../canonical-json';
import { ProductionCommandService } from '../commands/service';
import type { ReplacementGrant } from '../contracts/schemas';
import { DurationCalibrationStore } from '../preflight/calibration';
import { createRemotionRenderAdapter } from '../render/remotion';
import { createProductionIpcHost } from './host';
import { startProductionPipeBridge } from './pipe-bridge';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing trusted service configuration: ${name}`);
  return value;
};

const pipeNameFromPath = (value: string): string => {
  const prefix = '\\\\.\\pipe\\';
  if (!value.startsWith(prefix)) throw new TypeError('Production IPC pipe path is invalid.');
  return value.slice(prefix.length);
};

const publicPipePath = required('VOX_PIPE_PATH');
const publicPipeName = pipeNameFromPath(publicPipePath);
const privatePipeName = `vox-trusted-${randomUUID()}`;
const ipcSecret = required('VOX_IPC_TOKEN');
const grantKey = required('VOX_GRANT_KEY');
const apiKey = required('ELEVENLABS_API_KEY');
const ledgerRoot = resolve(required('VOX_LEDGER_ROOT'));
const runHmacKey = required('VOX_RUN_HMAC_KEY');
const runKeyId = required('VOX_RUN_KEY_ID');
const calibrationPath = resolve(required('VOX_CALIBRATION_PATH'));
const remotionEntryPoint = resolve(required('VOX_REMOTION_ENTRY'));

const verifyReplacementGrant = (grant: ReplacementGrant): boolean => {
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

const service = new ProductionCommandService({
  ledgerRoot,
  hmacKey: runHmacKey,
  keyId: runKeyId,
  calibrationStore: new DurationCalibrationStore(calibrationPath),
  network: { request: async () => Promise.reject(new Error('NETWORK_POLICY_DENIED')) },
  synthesizer: createElevenLabsAdapter({ apiKey }),
  verifyReplacementGrant,
  renderer: createRemotionRenderAdapter({ entryPoint: remotionEntryPoint }),
  compilerVersion: '1',
  rendererVersion: 'remotion-4.0.508',
});

const host = createProductionIpcHost({
  pipePath: `\\\\.\\pipe\\${privatePipeName}`,
  secret: ipcSecret,
  service,
});
await host.listen();
const pipeBridge = await startProductionPipeBridge({
  executable:
    process.env.VOX_PIPE_BRIDGE_HELPER ??
    resolve(import.meta.dirname, '../../dist/service/vox-pipe-bridge.exe'),
  publicPipeName,
  privatePipeName,
});
process.stderr.write('Vox Production service ready.\n');

const stop = async () => {
  await pipeBridge.close();
  await host.close();
  process.exitCode = 0;
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
