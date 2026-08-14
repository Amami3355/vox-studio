import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, homedir, release, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import type { VideoPlan } from '@vox/video';
import {
  type Alignment,
  type ProviderSynthesisResponse,
  type RunTakeArtifacts,
  type RunTakeManifest,
  type TimedBeatFold,
  createElevenLabsAdapter,
  verifyRunTake,
  verifyTimedBeatFold,
} from '@vox/voice';
import { ProductionCommandService } from '../commands/service';
import { resultEnvelopeSchema } from '../contracts/schemas';
import { createProductionIpcHost } from '../ipc/host';
import { type ProductionPipeBridge, startProductionPipeBridge } from '../ipc/pipe-bridge';
import { DurationCalibrationStore, activeInitialCalibration } from '../preflight/calibration';
import { type RenderAdapter, createRemotionRenderAdapter } from '../render/remotion';
import { type RunCheckpoint, RunStore } from '../run-store/run-store';
import { remainingSecretVariables, scrubAgentEnvironment } from './agent-environment';
import { evaluateNorthbridgeAssertions, machineVerdict } from './assertions';
import {
  type FileInventoryEntry,
  inventoryFiles,
  scanReadableFiles,
  sha256,
  verifyProofBundle,
  writeHashIndex,
  writeJson,
  writeJsonLines,
} from './evidence';
import {
  NORTHBRIDGE_FIXTURE_PLAN,
  NORTHBRIDGE_LONG_PROOF_ID,
  NORTHBRIDGE_LONG_REQUEST,
  NORTHBRIDGE_NON_CLAIMS,
  NORTHBRIDGE_PROOF_ID,
  NORTHBRIDGE_REQUEST,
  NORTHBRIDGE_TASK_MESSAGE,
} from './northbridge';

const execFileAsync = promisify(execFile);
const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
const packageRoot = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(packageRoot, '../..');

type MediaProbe = (input: { previewPath: string; takePath: string }) => Promise<{
  raw: unknown;
  videoCodec: string | null;
  audioCodec: string | null;
  previewDurationSeconds: number | null;
  /** Measured on the rendered preview: this is what a human actually hears. */
  previewAudioNonSilent: boolean;
  /** Measured on the Take: proves the provider returned audio, not that the render kept it. */
  takeAudioNonSilent: boolean;
}>;

export type AgentSandboxEvidence = {
  backend: string;
  workRootReadWrite: boolean;
  repositoryDenied: boolean;
  serviceDenied: boolean;
  credentialsDenied: boolean;
  credentialsEnvironmentDenied: boolean;
  directNetworkDenied: boolean;
  probes: Record<string, { exitCode: number; stdout: string; stderr: string; timedOut: boolean }>;
};

export type AgentDriver = (input: {
  invoke: (argv: string[]) => Promise<ReturnType<typeof resultEnvelopeSchema.parse>>;
  workRoot: string;
  transcript: unknown[];
  launcherEnvironment: { VOX_PIPE_NAME: string; VOX_IPC_TOKEN: string };
  repositoryProbePath: string;
  serviceProbePath: string;
  credentialsProbePath: string;
}) => Promise<{
  authorship: 'fixture-scripted' | 'fresh-generalist';
  unscripted: boolean;
  humanHints: number;
  model: string;
  modelVersion: string;
  transcriptComplete: boolean;
  directNetworkDenied: boolean;
  directNetworkEvents: unknown[];
  sandboxEvidence: AgentSandboxEvidence | null;
}>;

export type NorthbridgeProofOptions = {
  provider: 'fixture' | 'elevenlabs';
  /**
   * Which frozen Brief to put in front of the agent. `short` is the 20–30 s Brief the paid
   * proofs ran; `long` is the ~3 minute variant. Defaults to `short` so no existing caller
   * changes behaviour.
   */
  length?: 'short' | 'long';
  evidenceRoot?: string;
  renderer?: RenderAdapter;
  mediaProbe?: MediaProbe;
  agentDriver?: AgentDriver;
  seededViolations?: Array<'leak' | 'network'>;
  keepWorkingRoots?: boolean;
};

type CommandRecord = {
  ordinal: number;
  actor: 'agent' | 'harness';
  startedAt: string;
  endedAt: string;
  cwd: string;
  argv: string[];
  inputHashes: Record<string, string>;
  exitCode: number;
  stdoutSha256: string;
  stderrSha256: string;
  stdoutBase64: string;
  stderrBase64: string;
  revisionBefore: number | null;
  revisionAfter: number | null;
  created: FileInventoryEntry[];
  changed: FileInventoryEntry[];
  networkDelta: number;
};

const compileCSharp = async (output: string, source: string, references: string[] = []) => {
  await execFileAsync(csc, [
    '/nologo',
    '/target:exe',
    '/platform:x64',
    '/optimize+',
    '/debug-',
    `/out:${output}`,
    ...references.map((reference) => `/reference:${reference}`),
    source,
  ]);
};

const alignmentFor = (text: string): Alignment => {
  const characters = text.split('');
  const unitSeconds = 0.06625;
  return {
    characters,
    character_start_times_seconds: characters.map((_, index) => index * unitSeconds),
    character_end_times_seconds: characters.map((_, index) => (index + 1) * unitSeconds),
  };
};

/**
 * The fixture clip is one fixed recording of about 27.8 s. A long Brief produces an alignment
 * running minutes past that, and a Take whose audio stops two minutes before its own alignment
 * ends is not a usable stand-in — it would render as a long silence and tell us nothing about
 * whether the pipeline survives the duration. So loop the clip up to the alignment's own length
 * whenever the alignment is longer.
 *
 * Briefs that already fit inside the clip return its exact bytes, so every existing fixture run
 * stays byte-identical.
 */
const fixtureSynthesis = async (text: string): Promise<ProviderSynthesisResponse> => {
  const alignment = alignmentFor(text);
  const clipPath = resolve(repositoryRoot, 'packages/video/public/vertical-slice.vo.mp3');
  const targetSeconds = alignment.character_end_times_seconds.at(-1) ?? 0;
  const probed = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1:nk=1',
    clipPath,
  ]);
  if (targetSeconds <= Number(probed.stdout.trim())) {
    return { audio: await readFile(clipPath), alignment };
  }
  const directory = await mkdtemp(join(tmpdir(), 'vox-fixture-audio-'));
  try {
    const output = join(directory, 'looped.mp3');
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-nostats',
      '-y',
      '-stream_loop',
      '-1',
      '-i',
      clipPath,
      '-t',
      targetSeconds.toFixed(3),
      '-c',
      'copy',
      output,
    ]);
    return { audio: await readFile(output), alignment };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

/**
 * Peak level in dBFS, or null when the file has no decodable audio at all. Digital silence
 * reports around -91 dB or -inf, so a peak is the honest discriminator between "carries a
 * voice" and "carries an audio track that happens to be empty".
 */
const silenceFloorDb = -50;

const maxVolumeDb = async (path: string): Promise<number | null> => {
  const measured = await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-i',
    path,
    '-af',
    'volumedetect',
    '-f',
    'null',
    'NUL',
  ]).catch((error) => error as { stderr?: string });
  const matched = /max_volume:\s*(-?\d+(?:\.\d+)?|-inf) dB/i.exec(measured.stderr ?? '')?.[1];
  if (matched === undefined || matched === '-inf') return null;
  return Number(matched);
};

const audible = (maxVolume: number | null): boolean =>
  maxVolume !== null && maxVolume > silenceFloorDb;

const defaultMediaProbe: MediaProbe = async ({ previewPath, takePath }) => {
  const probe = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_type,codec_name',
    '-of',
    'json',
    previewPath,
  ]);
  const parsed = JSON.parse(probe.stdout) as {
    streams?: Array<{ codec_type?: string; codec_name?: string }>;
    format?: { duration?: string };
  };
  const [previewVolume, takeVolume] = await Promise.all([
    maxVolumeDb(previewPath),
    maxVolumeDb(takePath),
  ]);
  return {
    raw: {
      ffprobe: parsed,
      volume: { previewMaxVolumeDb: previewVolume, takeMaxVolumeDb: takeVolume },
    },
    videoCodec: parsed.streams?.find((stream) => stream.codec_type === 'video')?.codec_name ?? null,
    audioCodec: parsed.streams?.find((stream) => stream.codec_type === 'audio')?.codec_name ?? null,
    previewDurationSeconds: parsed.format?.duration ? Number(parsed.format.duration) : null,
    previewAudioNonSilent: audible(previewVolume),
    takeAudioNonSilent: audible(takeVolume),
  };
};

const fixtureAgent: AgentDriver = async ({ invoke, workRoot, transcript }) => {
  const run = 'agent-selected-run';
  const runArgument = join(workRoot, run);
  transcript.push({ actor: 'system', kind: 'task', text: NORTHBRIDGE_TASK_MESSAGE });
  await invoke(['production', 'contract', 'index']);
  for (const category of ['plan', 'catalog', 'checks', 'protocol']) {
    await invoke(['production', 'contract', 'show', category]);
  }
  await invoke(['production', 'run', 'init', '--request', 'request.json', '--out', runArgument]);
  await writeFile(
    join(workRoot, 'plan.json'),
    `${JSON.stringify(NORTHBRIDGE_FIXTURE_PLAN, null, 2)}\n`,
  );
  transcript.push({
    actor: 'fixture-scripted',
    kind: 'write-plan',
    path: 'plan.json',
    sha256: sha256(await readFile(join(workRoot, 'plan.json'))),
    claimEligible: false,
  });
  await invoke(['production', 'run', 'validate', '--run', runArgument, '--plan', 'plan.json']);
  await invoke(['production', 'run', 'preflight', '--run', runArgument]);
  await invoke(['production', 'run', 'record', '--run', runArgument]);
  await invoke(['production', 'run', 'compile', '--run', runArgument]);
  await invoke(['production', 'run', 'render', '--run', runArgument]);
  transcript.push({ actor: 'fixture-scripted', kind: 'terminal', outcome: 'rendered' });
  return {
    authorship: 'fixture-scripted',
    unscripted: false,
    humanHints: 0,
    model: 'fixture-scripted',
    modelVersion: '1',
    transcriptComplete: true,
    directNetworkDenied: true,
    directNetworkEvents: [],
    sandboxEvidence: null,
  };
};

const runPathFrom = (cwd: string, argv: string[]): string | null => {
  const flag = argv.indexOf('--run');
  const run = flag >= 0 ? argv[flag + 1] : undefined;
  if (run) return resolve(cwd, run);
  const out = argv.indexOf('--out');
  const target = out >= 0 ? argv[out + 1] : undefined;
  if (target) return resolve(cwd, target);
  return null;
};

const revisionAt = async (runRoot: string | null): Promise<number | null> => {
  if (!runRoot) return null;
  const value = await readFile(join(runRoot, 'run.json'), 'utf8').catch(() => null);
  if (!value) return null;
  const revision = (JSON.parse(value) as { revision?: unknown }).revision;
  return typeof revision === 'number' ? revision : null;
};

const inputHashes = async (cwd: string, argv: string[]): Promise<Record<string, string>> => {
  const result: Record<string, string> = {};
  for (const flag of ['--request', '--plan', '--decision', '--replacement-authorisation']) {
    const index = argv.indexOf(flag);
    const value = index >= 0 ? argv[index + 1] : undefined;
    if (!value) continue;
    const path = resolve(cwd, value);
    const bytes = await readFile(path).catch(() => null);
    if (bytes) result[flag] = sha256(bytes);
  }
  return result;
};

const changedFiles = (
  before: FileInventoryEntry[],
  after: FileInventoryEntry[],
): { created: FileInventoryEntry[]; changed: FileInventoryEntry[] } => {
  const prior = new Map(before.map((entry) => [entry.path, entry.sha256]));
  return {
    created: after.filter((entry) => !prior.has(entry.path)),
    changed: after.filter(
      (entry) => prior.has(entry.path) && prior.get(entry.path) !== entry.sha256,
    ),
  };
};

const descriptorsOf = (checkpoint: RunCheckpoint) => {
  const bindings = checkpoint.bindings;
  return [
    checkpoint.request.artifact,
    bindings.plan?.snapshot,
    bindings.validation?.report,
    bindings.preflight?.report,
    bindings.take?.manifest,
    bindings.take?.audio,
    bindings.take?.alignment,
    bindings.take?.fold,
    bindings.compilation?.document,
    bindings.compilation?.report,
    bindings.render?.preview,
  ].filter((value): value is NonNullable<typeof value> => value !== null && value !== undefined);
};

const descriptorHashesValid = async (runRoot: string, checkpoint: RunCheckpoint) => {
  for (const descriptor of descriptorsOf(checkpoint)) {
    if (sha256(await readFile(resolve(runRoot, descriptor.path))) !== descriptor.sha256)
      return false;
  }
  return true;
};

const parseOutput = (record: CommandRecord) =>
  resultEnvelopeSchema.parse(
    JSON.parse(Buffer.from(record.stdoutBase64, 'base64').toString('utf8')),
  );

const isContainedPath = (root: string, candidate: string): boolean => {
  const child = relative(root, candidate);
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
};

const selectAgentRenderedRun = (workRoot: string, commands: CommandRecord[]) => {
  const rendered = [...commands].reverse().find((record) => {
    if (record.actor !== 'agent') return false;
    const envelope = parseOutput(record);
    return (
      envelope.command === 'run.render' &&
      envelope.outcome === 'succeeded' &&
      envelope.run?.stage === 'rendered'
    );
  });
  const flag = rendered?.argv.indexOf('--run') ?? -1;
  const argument = flag >= 0 ? rendered?.argv[flag + 1] : undefined;
  const root = rendered && argument ? runPathFrom(workRoot, rendered.argv) : null;
  if (!argument || !root || !isContainedPath(workRoot, root)) {
    throw new Error('PROOF_AGENT_RENDERED_RUN_NOT_FOUND');
  }
  return { argument, root };
};

const commandTargetsRun = (workRoot: string, record: CommandRecord, runRoot: string): boolean => {
  const candidate = runPathFrom(workRoot, record.argv);
  return candidate !== null && relative(runRoot, candidate) === '';
};

const defaultHumanVerdict = (previewSha256: string | null, takeId: string | null) => ({
  humanVerdict: 'pending',
  evaluator: null,
  evaluatedAt: null,
  displayAndAudioSetup: null,
  previewSha256,
  takeId,
  verticalSliceReviewed: false,
  rows: [
    'narration intelligible, complete, continuous and fact-matching',
    'March highlight perceptibly lands on the unique spoken word',
    'opening, chart, hierarchy, transitions and ending are legible',
    'placeholder is honest visible degradation',
    'composition, typography, motion and pace are system-premium',
    'complete preview is watchable and listenable without explanation',
  ].map((criterion) => ({ criterion, verdict: 'pending', note: null })),
  note: 'Pending is incomplete, never pass. This verdict does not close gap 8.',
});

export const runNorthbridgeProof = async (options: NorthbridgeProofOptions) => {
  if (options.provider === 'elevenlabs' && !options.agentDriver) {
    throw new Error('PROOF_FRESH_GENERALIST_REQUIRED');
  }
  const seeded = new Set(options.seededViolations ?? []);
  const long = options.length === 'long';
  const proofRequest = long ? NORTHBRIDGE_LONG_REQUEST : NORTHBRIDGE_REQUEST;
  const proofId = long ? NORTHBRIDGE_LONG_PROOF_ID : NORTHBRIDGE_PROOF_ID;
  /**
   * `durationBounds` is the acceptance window — the long Brief asks for 170–190 s and gets the
   * same proportional slack the short one gets. `targetSeconds` is what the Brief actually asks
   * for, and it sets the repair budget; the two are kept separate so widening the window for
   * slack never silently buys the agent more repair attempts.
   */
  const { durationBounds, targetSeconds } = long
    ? { durationBounds: [150, 210] as readonly [number, number], targetSeconds: 180 }
    : { durationBounds: [20, 30] as readonly [number, number], targetSeconds: 25 };
  const workingParent = await mkdtemp(join(tmpdir(), 'vox-northbridge-proof-'));
  const workRoot = join(workingParent, 'agent');
  const trustedRoot = join(workingParent, 'trusted');
  const stagedEvidence = join(workingParent, 'evidence');
  await Promise.all([mkdir(workRoot), mkdir(trustedRoot), mkdir(stagedEvidence)]);

  const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
  const evidenceRoot = resolve(
    options.evidenceRoot ??
      join(
        repositoryRoot,
        '.scratch/agent-production-interface/proofs',
        `${timestamp}-northbridge-night-bus`,
      ),
  );
  let host: ReturnType<typeof createProductionIpcHost> | null = null;
  let pipeBridge: ProductionPipeBridge | null = null;
  const networkEvents: Array<{ command: string; kind: string; provider: string }> = [];
  const commands: CommandRecord[] = [];
  const transcript: unknown[] = [];
  try {
    const launcher = join(workRoot, 'vox.exe');
    const runner = join(trustedRoot, 'restricted-runner.exe');
    const pipeBridgeExecutable = join(trustedRoot, 'vox-pipe-bridge.exe');
    await cp(resolve(packageRoot, 'dist/agent/vox.exe'), launcher);
    await compileCSharp(runner, resolve(packageRoot, 'tests/fixtures/RestrictedRunner.cs'));
    await compileCSharp(pipeBridgeExecutable, resolve(packageRoot, 'service/PipeBridge.cs'));
    await writeJson(join(workRoot, 'request.json'), proofRequest);
    const initialInventory = await inventoryFiles(workRoot);

    const acl = await execFileAsync('icacls.exe', [
      workRoot,
      '/grant',
      '*S-1-5-32-545:(OI)(CI)(F)',
      '*S-1-5-12:(OI)(CI)(F)',
      '/inheritance:e',
    ]);
    const restrictedProbe = async (mode: '--probe-denied' | '--probe-readwrite', path: string) => {
      try {
        const result = await execFileAsync(runner, [mode, path], {
          cwd: workRoot,
          windowsHide: true,
        });
        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
      } catch (error) {
        const failed = error as { code?: number; stdout?: string; stderr?: string };
        return {
          exitCode: typeof failed.code === 'number' ? failed.code : 1,
          stdout: failed.stdout ?? '',
          stderr: failed.stderr ?? '',
        };
      }
    };
    const workRootProbe = await restrictedProbe('--probe-readwrite', workRoot);
    const repositoryProbe = await restrictedProbe(
      '--probe-denied',
      resolve(repositoryRoot, 'CONTEXT.md'),
    );
    const serviceProbe = await restrictedProbe('--probe-denied', trustedRoot);
    const credentialsProbe = await restrictedProbe(
      '--probe-denied',
      resolve(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'auth.json'),
    );
    const identityProbe = await execFileAsync(runner, ['--identity'], {
      cwd: workRoot,
      windowsHide: true,
    });

    const calibrationStore = new DurationCalibrationStore(join(trustedRoot, 'duration.json'));
    await calibrationStore.save(activeInitialCalibration());
    let activeCommand = '';
    let runNumber = 0;
    const providerAdapter =
      options.provider === 'elevenlabs'
        ? createElevenLabsAdapter({ apiKey: process.env.ELEVENLABS_API_KEY ?? '' })
        : async ({ text }: { text: string }) => fixtureSynthesis(text);
    const synthesizer = async (request: Parameters<typeof providerAdapter>[0]) => {
      networkEvents.push({
        command: activeCommand,
        kind: 'provider-dispatch',
        provider: options.provider,
      });
      return providerAdapter(request);
    };
    const runHmacKey = randomBytes(32);
    const service = new ProductionCommandService({
      ledgerRoot: join(trustedRoot, 'ledger'),
      hmacKey: runHmacKey,
      keyId: 'northbridge-proof-key-v1',
      calibrationStore,
      network: {
        request: async () => {
          networkEvents.push({
            command: activeCommand,
            kind: 'unauthorized-network',
            provider: 'generic',
          });
          throw new Error('NETWORK_POLICY_DENIED');
        },
      },
      synthesizer,
      verifyReplacementGrant: () => false,
      renderer:
        options.renderer ??
        createRemotionRenderAdapter({
          entryPoint: resolve(repositoryRoot, 'packages/video/src/remotion-entry.ts'),
          temporaryRoot: trustedRoot,
        }),
      rendererVersion: 'remotion-4.0.508',
      createRunId: () => `northbridge-proof-${++runNumber}`,
    });

    let currentActor: 'agent' | 'harness' = 'agent';
    const ipcSecret = randomBytes(32).toString('hex');
    const pipeName = `vox-proof-${randomUUID()}`;
    const trustedPipeName = `${pipeName}-trusted`;
    host = createProductionIpcHost({
      pipePath: `\\\\.\\pipe\\${trustedPipeName}`,
      secret: ipcSecret,
      service,
      audit: {
        before: async (request) => {
          activeCommand = request.argv.slice(0, 3).join(' ');
          return {
            inventory: await inventoryFiles(workRoot),
            revision: await revisionAt(runPathFrom(request.cwd, request.argv)),
            networkCount: networkEvents.length,
            inputHashes: await inputHashes(request.cwd, request.argv),
            actor: currentActor,
          };
        },
        after: async ({ request, result, context, startedAtMs, endedAtMs }) => {
          const before = context as {
            inventory: FileInventoryEntry[];
            revision: number | null;
            networkCount: number;
            inputHashes: Record<string, string>;
            actor: 'agent' | 'harness';
          };
          const after = await inventoryFiles(workRoot);
          const delta = changedFiles(before.inventory, after);
          commands.push({
            ordinal: commands.length + 1,
            actor: before.actor,
            startedAt: new Date(startedAtMs).toISOString(),
            endedAt: new Date(endedAtMs).toISOString(),
            cwd: '.',
            argv: request.argv,
            inputHashes: before.inputHashes,
            exitCode: result.exitCode,
            stdoutSha256: sha256(result.stdout),
            stderrSha256: sha256(result.stderr),
            stdoutBase64: Buffer.from(result.stdout).toString('base64'),
            stderrBase64: Buffer.from(result.stderr).toString('base64'),
            revisionBefore: before.revision,
            revisionAfter: await revisionAt(runPathFrom(request.cwd, request.argv)),
            ...delta,
            networkDelta: networkEvents.length - before.networkCount,
          });
          activeCommand = '';
        },
      },
    });
    await host.listen();
    pipeBridge = await startProductionPipeBridge({
      executable: pipeBridgeExecutable,
      publicPipeName: pipeName,
      privatePipeName: trustedPipeName,
    });

    const invoke = async (argv: string[]) => {
      let output: { code: number; stdout: string; stderr: string };
      try {
        const result = await execFileAsync(runner, ['--launch', workRoot, launcher, ...argv], {
          cwd: workRoot,
          env: { ...process.env, VOX_PIPE_NAME: pipeName, VOX_IPC_TOKEN: ipcSecret },
          windowsHide: true,
        });
        output = { code: 0, stdout: result.stdout, stderr: result.stderr };
      } catch (error) {
        const failed = error as { code?: number; stdout?: string; stderr?: string };
        output = {
          code: typeof failed.code === 'number' ? failed.code : 1,
          stdout: failed.stdout ?? '',
          stderr: failed.stderr ?? '',
        };
      }
      if (output.stderr !== '') throw new Error(`PROOF_COMMAND_STDERR:${argv.join(' ')}`);
      const envelope = resultEnvelopeSchema.parse(JSON.parse(output.stdout));
      if (output.code !== commands.at(-1)?.exitCode) throw new Error('PROOF_EXIT_CAPTURE_MISMATCH');
      return envelope;
    };

    const authoring = await (options.agentDriver ?? fixtureAgent)({
      invoke,
      workRoot,
      transcript,
      launcherEnvironment: { VOX_PIPE_NAME: pipeName, VOX_IPC_TOKEN: ipcSecret },
      repositoryProbePath: resolve(repositoryRoot, 'CONTEXT.md'),
      serviceProbePath: trustedRoot,
      credentialsProbePath: resolve(
        process.env.CODEX_HOME ?? join(homedir(), '.codex'),
        'auth.json',
      ),
    });

    const mainRun = selectAgentRenderedRun(workRoot, commands);
    currentActor = 'harness';
    const categoriesSeenByAgent = new Set(
      commands
        .filter((record) => record.actor === 'agent')
        .map((record) => parseOutput(record))
        .filter((envelope) => envelope.command === 'contract.show')
        .map((envelope) => String((envelope.data as { category?: unknown } | null)?.category)),
    );
    for (const category of ['language', 'plan', 'catalog', 'checks', 'protocol']) {
      if (!categoriesSeenByAgent.has(category)) {
        await invoke(['production', 'contract', 'show', category]);
      }
    }
    const reuseEnvelope = await invoke(['production', 'run', 'record', '--run', mainRun.argument]);
    const mainBeforeStatus = await readFile(join(mainRun.root, 'run.json'));
    await invoke(['production', 'run', 'status', '--run', mainRun.argument]);
    const mainAfterStatus = await readFile(join(mainRun.root, 'run.json'));
    const pausedRequest = {
      ...proofRequest,
      production: { ...proofRequest.production, maxNewTakes: 0 },
    };
    await writeJson(join(workRoot, 'request-paused.json'), pausedRequest);
    await invoke([
      'production',
      'run',
      'init',
      '--request',
      'request-paused.json',
      '--out',
      'run-paused',
    ]);
    await invoke(['production', 'run', 'validate', '--run', 'run-paused', '--plan', 'plan.json']);
    await invoke(['production', 'run', 'preflight', '--run', 'run-paused']);
    const pausedEnvelope = await invoke(['production', 'run', 'record', '--run', 'run-paused']);
    const pausedCheckpoint = JSON.parse(
      await readFile(join(workRoot, 'run-paused', 'run.json'), 'utf8'),
    ) as RunCheckpoint;

    const mainRunRoot = mainRun.root;
    const pausedRunRoot = join(workRoot, 'run-paused');
    const mainBeforeInvalid = await readFile(join(mainRunRoot, 'run.json'));
    const mainBefore = JSON.parse(mainBeforeInvalid.toString('utf8')) as RunCheckpoint;
    const invalidGrant = {
      protocolVersion: 1,
      grantId: randomUUID(),
      runId: mainBefore.runId,
      recordingInputSha256: mainBefore.bindings.take?.recordingInputSha256,
      issuedAt: new Date().toISOString(),
      grant: 'unauthenticated-proof-probe',
    };
    await writeJson(join(workRoot, 'invalid-grant.json'), invalidGrant);
    const invalidEnvelope = await invoke([
      'production',
      'run',
      'record',
      '--run',
      mainRun.argument,
      '--replacement-authorisation',
      'invalid-grant.json',
    ]);
    const mainAfterInvalid = await readFile(join(mainRunRoot, 'run.json'));

    if (seeded.has('network')) {
      networkEvents.push({
        command: 'production run compile',
        kind: 'unauthorized-network',
        provider: 'seeded-test',
      });
    }
    if (seeded.has('leak')) {
      await writeFile(join(workRoot, 'seeded-leak.ts'), 'export const leaked = true;\n');
    }

    const store = new RunStore({
      runRoot: mainRunRoot,
      ledgerRoot: join(trustedRoot, 'ledger'),
      runId: mainBefore.runId,
      hmacKey: runHmacKey,
      keyId: 'northbridge-proof-key-v1',
    });
    let inspected: RunCheckpoint | null = null;
    try {
      inspected = await store.inspect();
    } catch {
      inspected = null;
    }
    const checkpoint =
      inspected ?? (JSON.parse(mainAfterInvalid.toString('utf8')) as RunCheckpoint);
    const plan = JSON.parse(await readFile(join(workRoot, 'plan.json'), 'utf8')) as VideoPlan;
    const preflightDescriptor = checkpoint.bindings.preflight?.report;
    const compileDescriptor = checkpoint.bindings.compilation?.report;
    const foldDescriptor = checkpoint.bindings.take?.fold;
    const preflight = preflightDescriptor
      ? (JSON.parse(await readFile(resolve(mainRunRoot, preflightDescriptor.path), 'utf8')) as {
          authority?: string;
          limitations?: string[];
          duration?: { scenes?: Array<{ minimum?: { assessment?: string } }> };
        })
      : null;
    const compileReport = compileDescriptor
      ? (JSON.parse(await readFile(resolve(mainRunRoot, compileDescriptor.path), 'utf8')) as {
          ok?: boolean;
          errors?: unknown[];
        })
      : null;
    const fold = foldDescriptor
      ? (JSON.parse(
          await readFile(resolve(mainRunRoot, foldDescriptor.path), 'utf8'),
        ) as TimedBeatFold)
      : null;
    const takeBinding = checkpoint.bindings.take;
    const takeManifest = takeBinding
      ? (JSON.parse(
          await readFile(resolve(mainRunRoot, takeBinding.manifest.path), 'utf8'),
        ) as RunTakeManifest)
      : null;
    const takeArtifacts: RunTakeArtifacts | null =
      takeBinding === null
        ? null
        : {
            audio: await readFile(resolve(mainRunRoot, takeBinding.audio.path)),
            alignment: JSON.parse(
              await readFile(resolve(mainRunRoot, takeBinding.alignment.path), 'utf8'),
            ) as Alignment,
          };
    let takeVerified = false;
    let foldCurrent = false;
    try {
      if (takeManifest && takeArtifacts) {
        verifyRunTake(
          takeManifest,
          takeArtifacts,
          plan.beats,
          proofRequest.production.voice,
        );
        takeVerified = true;
        if (fold) {
          verifyTimedBeatFold(fold, takeManifest, takeArtifacts, plan.beats);
          foldCurrent = true;
        }
      }
    } catch {
      takeVerified = false;
      foldCurrent = false;
    }
    const previewPath = checkpoint.bindings.render?.preview.path
      ? resolve(mainRunRoot, checkpoint.bindings.render.preview.path)
      : '';
    const takePath = checkpoint.bindings.take?.audio.path
      ? resolve(mainRunRoot, checkpoint.bindings.take.audio.path)
      : '';
    const media = await (options.mediaProbe ?? defaultMediaProbe)({ previewPath, takePath });
    const finalInventory = await inventoryFiles(workRoot);
    const leakScan = await scanReadableFiles(workRoot, repositoryRoot);
    const publicOutputLeak =
      /(?:packages[\\/]|node_modules|sourceMappingURL|sourcesContent|\.tsx?\b|\.mts\b)/i;
    for (const record of commands) {
      const publicBytes = `${Buffer.from(record.stdoutBase64, 'base64').toString('utf8')}\n${Buffer.from(
        record.stderrBase64,
        'base64',
      ).toString('utf8')}`;
      if (
        publicOutputLeak.test(publicBytes) ||
        publicBytes.toLowerCase().includes(repositoryRoot.toLowerCase())
      ) {
        leakScan.violations.push(`command-${record.ordinal}:public-output-marker`);
      }
      leakScan.scanned.push(`command-${record.ordinal}:stdout-stderr`);
    }
    leakScan.pass = leakScan.violations.length === 0;
    const records = commands.map((record) => ({ record, envelope: parseOutput(record) }));
    const agentRecords = records.filter(({ record }) => record.actor === 'agent');
    const agentRecordEnvelope = agentRecords
      .filter(
        ({ record, envelope }) =>
          envelope.command === 'run.record' && commandTargetsRun(workRoot, record, mainRunRoot),
      )
      .map(({ envelope }) => envelope)
      .find(
        (envelope) =>
          (envelope.data as { disposition?: unknown } | null)?.disposition === 'recorded',
      );
    const recordEnvelopes = agentRecordEnvelope
      ? [agentRecordEnvelope, reuseEnvelope]
      : [reuseEnvelope];
    const categories = records
      .filter(({ envelope }) => envelope.command === 'contract.show')
      .map(({ envelope }) => String((envelope.data as { category?: unknown } | null)?.category));
    const observedCommands = new Set(records.map(({ envelope }) => envelope.command));
    const expectedCommands = [
      'contract.index',
      'contract.show',
      'run.init',
      'run.status',
      'run.validate',
      'run.preflight',
      'run.record',
      'run.compile',
      'run.render',
    ] as const;
    const validateRecords = agentRecords.filter(
      ({ envelope }) => envelope.command === 'run.validate',
    );
    const submittedPlanHashes = validateRecords
      .map(({ record }) => record.inputHashes['--plan'])
      .filter((hash): hash is string => typeof hash === 'string');
    const planVersions = new Set(submittedPlanHashes).size;
    const firstRecordOrdinal = agentRecords.find(
      ({ envelope }) => envelope.command === 'run.record',
    )?.record.ordinal;
    const postRecordPlanVersions = new Set(
      validateRecords
        .filter(
          ({ record }) => firstRecordOrdinal !== undefined && record.ordinal > firstRecordOrdinal,
        )
        .map(({ record }) => record.inputHashes['--plan'])
        .filter((hash): hash is string => typeof hash === 'string'),
    ).size;
    const scenes = plan.sections.flatMap((section) => section.scenes);
    const marchCount = plan.beats.flatMap((beat) => beat.text.match(/\bMarch\b/g) ?? []).length;
    const assetResolutions = checkpoint.bindings.compilation?.assetResolutions ?? [];
    const openingBeatId = plan.beats[0]?.id;
    const northbridgeScene = scenes.find(
      (scene) =>
        scene.component === 'image_context' &&
        openingBeatId !== undefined &&
        scene.spansBeats.includes(openingBeatId),
    );
    const northbridgeRequirement = northbridgeScene?.props.assetRequirement as
      | { type?: unknown; subject?: unknown }
      | undefined;
    const northbridgeAsset = assetResolutions.find(
      (asset) => asset.sceneId === northbridgeScene?.id,
    );
    const takeDurationSeconds = fold?.timedBeats.length
      ? Number(fold.timedBeats.at(-1)?.toMs ?? 0) / 1000
      : null;

    const assertions = evaluateNorthbridgeAssertions({
      authorship: {
        kind: authoring.authorship,
        unscripted: authoring.unscripted,
      },
      isolation: {
        initialFiles: initialInventory.map((entry) => entry.path).sort(),
        workRootReadWrite:
          authoring.sandboxEvidence?.workRootReadWrite ??
          (workRootProbe.exitCode === 0 && workRootProbe.stdout === 'readwrite\n'),
        repositoryDenied:
          authoring.sandboxEvidence?.repositoryDenied ??
          (repositoryProbe.exitCode === 0 && repositoryProbe.stdout === 'denied\n'),
        serviceDenied:
          authoring.sandboxEvidence?.serviceDenied ??
          (serviceProbe.exitCode === 0 && serviceProbe.stdout === 'denied\n'),
        credentialsDenied:
          authoring.sandboxEvidence?.credentialsDenied ??
          (credentialsProbe.exitCode === 0 && credentialsProbe.stdout === 'denied\n'),
        // Without a spawned sandbox to interrogate, the honest fallback is to check the
        // environment the harness would have handed over.
        credentialsEnvironmentDenied:
          authoring.sandboxEvidence?.credentialsEnvironmentDenied ??
          remainingSecretVariables(scrubAgentEnvironment(process.env)).length === 0,
        writesContained: commands.every((record) =>
          [...record.created, ...record.changed].every((entry) => !entry.path.startsWith('../')),
        ),
      },
      leakScan,
      contracts: {
        categories: [...new Set(categories)],
        allCommandsObserved: expectedCommands.every((command) => observedCommands.has(command)),
        agentDiscoveryObserved:
          agentRecords.some(({ envelope }) => envelope.command === 'contract.index') &&
          agentRecords.some(({ envelope }) => envelope.command === 'contract.show'),
      },
      processContract: {
        envelopesValid: records.every(({ record }) => record.stdoutBase64.length > 0),
        stderrValid: records.every(({ record }) => record.stderrBase64 === ''),
        exitsValid: records.every(({ record, envelope }) =>
          envelope.outcome === 'failed'
            ? record.exitCode === 1 || record.exitCode === 2
            : record.exitCode === 0,
        ),
      },
      network: {
        providerDispatchCount: networkEvents.filter((event) => event.kind === 'provider-dispatch')
          .length,
        commandViolations: [
          ...networkEvents
            .filter(
              (event) =>
                event.kind === 'unauthorized-network' ||
                (event.kind === 'provider-dispatch' && event.command !== 'production run record'),
            )
            .map((event) => event.command),
          ...authoring.directNetworkEvents.map(() => 'agent-direct-network'),
        ],
        directDenied: authoring.directNetworkDenied,
      },
      limits: {
        planVersions,
        validateCalls: agentRecords.filter(({ envelope }) => envelope.command === 'run.validate')
          .length,
        preflightCalls: agentRecords.filter(({ envelope }) => envelope.command === 'run.preflight')
          .length,
        postRecordPlanVersions,
        humanHints: authoring.humanHints,
      },
      run: {
        stage: checkpoint.stage,
        bindingsFresh: Object.values(checkpoint.bindings).every(
          (binding) => binding === null || binding.freshness.state === 'fresh',
        ),
        receiptChainValid: inspected !== null,
        attestationsValid: inspected !== null,
        artifactHashesValid: await descriptorHashesValid(mainRunRoot, checkpoint),
        recordingInputBound:
          takeManifest?.recordingInputSha256 === checkpoint.bindings.take?.recordingInputSha256,
        takeVerified,
        foldCurrent,
        recordDispositions: recordEnvelopes.map((envelope) =>
          String((envelope.data as { disposition?: unknown } | null)?.disposition),
        ),
        recordTakeIds: recordEnvelopes.map((envelope) =>
          String((envelope.data as { takeId?: unknown } | null)?.takeId),
        ),
        newTakesUsed: checkpoint.quota.newTakesUsed,
      },
      scenario: {
        capabilities: [...new Set(scenes.map((scene) => scene.component))],
        highlightMarch: scenes.some((scene) =>
          scene.events?.some(
            (event) => event.action === 'highlightBar' && event.payload?.label === 'March',
          ),
        ),
        uniqueMarchWordAnchor:
          marchCount === 1 &&
          scenes.some((scene) =>
            scene.events?.some(
              (event) => event.at.endsWith('.word:March') && event.payload?.label === 'March',
            ),
          ),
        northbridgeAssetRequirement:
          northbridgeRequirement?.type === 'image' &&
          typeof northbridgeRequirement.subject === 'string' &&
          /bus/i.test(northbridgeRequirement.subject) &&
          /(?:stop|northbridge|dawn)/i.test(northbridgeRequirement.subject),
      },
      preflight: {
        advisory:
          preflight?.authority === 'advisory' &&
          Boolean(preflight.limitations?.some((value) => value.includes('advisory'))),
        minimumRiskCleared: Boolean(
          preflight?.duration?.scenes?.every(
            (scene) => scene.minimum?.assessment === 'margin_clear',
          ),
        ),
      },
      assets: {
        northbridgeStatus: northbridgeAsset?.status ?? null,
        failedCount: assetResolutions.filter((asset) => asset.status === 'failed').length,
      },
      compilation: {
        ok: compileReport?.ok === true,
        errorCount: compileReport?.errors?.length ?? -1,
      },
      media: {
        videoCodec: media.videoCodec,
        audioCodec: media.audioCodec,
        previewAudioNonSilent: media.previewAudioNonSilent,
        takeAudioNonSilent: media.takeAudioNonSilent,
        takeDurationSeconds,
        previewDurationSeconds: media.previewDurationSeconds,
      },
      probes: {
        statusReadOnly: Buffer.compare(mainBeforeStatus, mainAfterStatus) === 0,
        paused:
          pausedEnvelope.outcome === 'paused' &&
          pausedEnvelope.run?.stage === 'preflighted' &&
          pausedCheckpoint.quota.newTakesUsed === 0 &&
          pausedCheckpoint.bindings.take === null,
        invalidGrantFailed:
          invalidEnvelope.outcome === 'failed' &&
          invalidEnvelope.error?.code === 'REPLACEMENT_AUTHORIZATION_INVALID',
        preservedMainRun: Buffer.compare(mainBeforeInvalid, mainAfterInvalid) === 0,
      },
      evidence: { transcriptRecords: transcript.length, commandRecords: commands.length },
    }, { durationBounds, targetSeconds });
    const verdict = machineVerdict(assertions);

    await cp(mainRunRoot, join(stagedEvidence, 'main-run'), { recursive: true });
    await cp(pausedRunRoot, join(stagedEvidence, 'paused-run'), { recursive: true });
    await cp(join(workRoot, 'invalid-grant.json'), join(stagedEvidence, 'invalid-grant.json'));
    await writeJson(join(stagedEvidence, 'environment.json'), {
      proofId,
      executedAt: new Date().toISOString(),
      provider: options.provider,
      agent: authoring.unscripted ? 'fresh-generalist' : 'fixture-scripted-v1',
      model: { name: authoring.model, version: authoring.modelVersion },
      transcriptComplete: authoring.transcriptComplete,
      directNetworkPolicy: {
        denied: authoring.directNetworkDenied,
        events: authoring.directNetworkEvents,
      },
      measurementGateEligible: false,
      measurementGateReason: 'catalog_informed_interface_proof',
      claimEligible: authoring.unscripted && options.provider === 'elevenlabs',
      taskMessageSha256: sha256(NORTHBRIDGE_TASK_MESSAGE),
      launcherSha256: sha256(await readFile(launcher)),
      serviceBuildId: sha256(await readFile(resolve(packageRoot, 'src/commands/service.ts'))),
      contractHashes: Object.fromEntries(
        await Promise.all(
          ['index', 'language', 'plan', 'catalog', 'checks', 'protocol'].map(async (name) => [
            name,
            sha256(await readFile(resolve(packageRoot, `src/contracts/generated/${name}.json`))),
          ]),
        ),
      ),
      os: { platform: process.platform, release: release(), arch: arch() },
      container: { kind: 'windows-host', restrictedToken: 'SAFER_CONSTRAINED' },
      ipc: { transport: 'windows-named-pipe', identity: pipeName },
    });
    await writeJson(join(stagedEvidence, 'initial-inventory.json'), initialInventory);
    await writeJson(join(stagedEvidence, 'final-inventory.json'), finalInventory);
    await writeJson(join(stagedEvidence, 'permissions.json'), {
      acl: acl.stdout,
      workRootProbe,
      repositoryProbe,
      serviceProbe,
      credentialsProbe,
      identity: {
        restriction: 'SAFER_CONSTRAINED',
        output: identityProbe.stdout.trim(),
      },
      codexSandbox: authoring.sandboxEvidence,
    });
    await writeJson(join(stagedEvidence, 'leak-scan.json'), leakScan);
    await writeJson(join(stagedEvidence, 'network-audit.json'), {
      directPolicyDenied: authoring.directNetworkDenied,
      directEvents: authoring.directNetworkEvents,
      serviceEvents: networkEvents,
    });
    await writeJsonLines(join(stagedEvidence, 'agent-transcript.jsonl'), transcript);
    await writeJsonLines(join(stagedEvidence, 'commands.jsonl'), commands);
    await writeJson(join(stagedEvidence, 'ffprobe.json'), {
      ...media,
      takeDurationSeconds,
    });
    await writeJson(join(stagedEvidence, 'assertions.json'), {
      machineVerdict: verdict,
      assertions,
    });
    await writeJson(
      join(stagedEvidence, 'human-verdict.json'),
      defaultHumanVerdict(
        checkpoint.bindings.render?.preview.sha256 ?? null,
        checkpoint.bindings.take?.takeId ?? null,
      ),
    );
    const summary = `# Northbridge production-interface proof evidence

- Proof id: ${proofId}
- Provider: ${options.provider}
- Agent mode: ${authoring.unscripted ? 'fresh-generalist' : 'fixture-scripted (regression only)'}
- Machine verdict: ${verdict}
- Human verdict: pending
- Code-blind end-to-end claim: no
- Measurement-gate eligible: no (catalog-informed interface proof)

${
  authoring.unscripted
    ? 'Fresh-agent execution remains claim-ineligible until the independent human verdict is complete. Pending human review is incomplete, never pass.'
    : 'The fixture mode validates the harness but cannot establish unscripted agent authorship. Pending human review is incomplete, never pass.'
} Ticket 03 and automated tests are supporting evidence only.

## Explicit non-claims

${NORTHBRIDGE_NON_CLAIMS.map((claim) => `- ${claim}`).join('\n')}
`;
    await writeFile(join(stagedEvidence, 'SUMMARY.md'), summary, 'utf8');
    await writeHashIndex(stagedEvidence);
    await verifyProofBundle(stagedEvidence, { requirePass: false });
    await mkdir(dirname(evidenceRoot), { recursive: true });
    await cp(stagedEvidence, evidenceRoot, { recursive: true, errorOnExist: true, force: false });
    return {
      evidenceRoot,
      machineVerdict: verdict,
      humanVerdict: 'pending' as const,
      assertions,
    };
  } catch (error) {
    if (options.keepWorkingRoots) {
      const failure = error instanceof Error ? error : new Error(String(error));
      await writeJson(join(stagedEvidence, 'failure.json'), {
        proofId,
        failedAt: new Date().toISOString(),
        provider: options.provider,
        error: { name: failure.name, message: failure.message },
        workingParent,
        workingRootsPreserved: true,
      });
      await writeJsonLines(join(stagedEvidence, 'agent-transcript.jsonl'), transcript);
      await writeJsonLines(join(stagedEvidence, 'commands.jsonl'), commands);
      await writeJson(join(stagedEvidence, 'network-audit.json'), { serviceEvents: networkEvents });
      await writeHashIndex(stagedEvidence);
      await mkdir(dirname(evidenceRoot), { recursive: true });
      await cp(stagedEvidence, evidenceRoot, { recursive: true, errorOnExist: true, force: false });
      throw new Error(`PROOF_FAILED_EVIDENCE_PRESERVED:${evidenceRoot}:${failure.message}`);
    }
    throw error;
  } finally {
    await pipeBridge?.close().catch(() => undefined);
    await host?.close().catch(() => undefined);
    if (!options.keepWorkingRoots) await rm(workingParent, { recursive: true, force: true });
  }
};
