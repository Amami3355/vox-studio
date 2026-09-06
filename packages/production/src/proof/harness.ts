import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
import { CONTRACT_CATEGORIES } from '../contracts/protocol';
import { resultEnvelopeSchema } from '../contracts/schemas';
import { createProductionIpcHost } from '../ipc/host';
import { type ProductionPipeBridge, startProductionPipeBridge } from '../ipc/pipe-bridge';
import { DurationCalibrationStore, activeInitialCalibration } from '../preflight/calibration';
import { type RenderAdapter, createRemotionRenderAdapter } from '../render/remotion';
import { type RunCheckpoint, RunStore } from '../run-store/run-store';
import { credentialStoreCandidates } from './agent-environment';
import { evaluateNorthbridgeAssertions, machineVerdict } from './assertions';
import { catalogShowcasePlanViolations } from './catalog-showcase';
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
import { NORTHBRIDGE_FIXTURE_PLAN, NORTHBRIDGE_TASK_MESSAGE } from './northbridge';
import {
  type ProofScenarioKey,
  firstImageScene,
  imageSceneSpanningOpeningBeat,
  proofScenario,
} from './scenarios';
import { verifyWorkRoot } from './workroot';

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
  /** `null` when this machine holds no credential store to probe, so nothing was measured. */
  credentialsDenied: boolean | null;
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
  /**
   * Credential stores that exist on this machine and that the agent must be denied. Possibly
   * empty: a machine with no credential store cannot evidence this boundary, and the driver
   * says so with `credentialsDenied: null` rather than reporting a denial it never measured.
   */
  credentialStoreProbePaths: string[];
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
  /**
   * An agent that kept evidence of its own says where it left it, and the harness carries the
   * directory into the proof bundle before the work root is torn down. Absent for an agent
   * that kept none.
   *
   * It travels rather than being verified here on purpose: an agent's bundle is written to its
   * own shape and answers to its own verifier, and a harness that insisted on its own shape
   * would be asking every future runtime to imitate this one. What the harness guarantees is
   * that the bytes survive the run and are hashed into the index with everything else.
   */
  evidenceRoot?: string | null;
}>;

export type NorthbridgeProofOptions = {
  provider: 'fixture' | 'elevenlabs';
  /**
   * Which scenario to put in front of the agent. `short` is the 20–30 s Brief the paid proofs
   * ran; `long` is the ~3 minute variant; `showcase` is the full-catalogue Helios Bay Brief.
   * Defaults to `short` so no existing caller changes behaviour. Every value that differs
   * between them lives in one record — see `scenarios.ts`.
   */
  length?: ProofScenarioKey;
  evidenceRoot?: string;
  renderer?: RenderAdapter;
  mediaProbe?: MediaProbe;
  agentDriver?: AgentDriver;
  /**
   * Faults to seed, so a proof can demonstrate that its own detectors fire.
   *
   * Not all three are violations, and the name said they were. `leak` and `network` are things
   * an *agent* does that the proof must catch; `audit-crash` is the *harness* failing — the
   * audit hook throwing mid-command — and a proof that cannot show what happens then is a
   * proof trusting its own instrument. Grouping them under one honest word keeps the third
   * from reading as agent misbehaviour in the evidence it produces.
   */
  seededFaults?: Array<'leak' | 'network' | 'audit-crash'>;
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

/**
 * The plan a Run is bound to, read through the Run's own checkpoint.
 *
 * The harness used to read `plan.json` out of the work root, which worked only for as long as
 * every driver happened to leave its plan at that name. An agent that authors its plan inside
 * the Run — the crew, once a model writes one — leaves nothing there, and an agent free to name
 * its own file was never obliged to. The binding is the Run's own answer to which plan it is
 * about, so it is the only source that is true for every driver.
 *
 * Both of the harness's plan readers go through here — the scoring read below and the record
 * gate's pre-spend check — so there is one implementation of it rather than two that agree
 * until they don't. A Run with no plan binding is a harness bug rather than a plan to be found
 * elsewhere, so it refuses by name instead of falling back to a guess.
 */
export const readBoundPlan = async (
  runRoot: string,
  checkpoint: RunCheckpoint,
): Promise<VideoPlan> => {
  const snapshot = checkpoint.bindings.plan?.snapshot;
  if (!snapshot) throw new Error('PROOF_NO_BOUND_PLAN');
  return JSON.parse(await readFile(resolve(runRoot, snapshot.path), 'utf8')) as VideoPlan;
};

/**
 * The plan file the harness writes for its own zero-budget probe, alongside `request-paused.json`.
 *
 * The probe needs a plan on disk because `run validate` takes one by path, and the plan it
 * should validate is the one the agent actually bound — a probe run against some other plan
 * would be measuring a different Run. So the harness writes the bound plan out under a name it
 * owns, rather than reaching for whatever the agent may or may not have left behind.
 */
export const PAUSED_PROBE_PLAN = 'plan-paused.json';

const commandTargetsRun = (workRoot: string, record: CommandRecord, runRoot: string): boolean => {
  const candidate = runPathFrom(workRoot, record.argv);
  return candidate !== null && relative(runRoot, candidate) === '';
};

const defaultHumanVerdict = (
  previewSha256: string | null,
  takeId: string | null,
  rows: readonly string[],
) => ({
  humanVerdict: 'pending',
  evaluator: null,
  evaluatedAt: null,
  displayAndAudioSetup: null,
  previewSha256,
  takeId,
  verticalSliceReviewed: false,
  rows: rows.map((criterion) => ({ criterion, verdict: 'pending', note: null })),
  note: 'Pending is incomplete, never pass. This verdict does not close gap 8.',
});

export const runNorthbridgeProof = async (options: NorthbridgeProofOptions) => {
  if (options.provider === 'elevenlabs' && !options.agentDriver) {
    throw new Error('PROOF_FRESH_GENERALIST_REQUIRED');
  }
  const seeded = new Set(options.seededFaults ?? []);
  const scenario = proofScenario(options.length ?? 'short');
  const { proofId, slug: proofSlug, nonClaims, durationBounds, targetSeconds } = scenario;
  const proofRequest = scenario.request;
  // The elevated Windows sandbox runs as a separate local account. It cannot traverse this
  // user's Documents or AppData parents even when the leaf itself has a permissive ACL, so the
  // disposable agent workspace must live under a neutral root-level parent.
  const workingRootParent = 'C:\\vox-proof-workroots';
  await mkdir(workingRootParent, { recursive: true });
  const workingParent = await mkdtemp(join(workingRootParent, 'vox-proof-'));
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
        `${timestamp}-${proofSlug}`,
      ),
  );
  let host: ReturnType<typeof createProductionIpcHost> | null = null;
  let pipeBridge: ProductionPipeBridge | null = null;
  const networkEvents: Array<{ command: string; kind: string; provider: string }> = [];
  const commands: CommandRecord[] = [];
  const transcript: unknown[] = [];
  // Why the audit hook threw, kept because the transport cannot carry it: `ipc/host.ts`
  // destroys the socket on a throwing `before` and answers nothing, so the caller learns only
  // that the connection broke. These are harness bugs rather than anything a Run did, and the
  // failure record below is the one place they can still be read.
  const auditFailures: Array<{ command: string; at: string; message: string }> = [];
  try {
    const launcher = join(workRoot, 'vox.exe');
    const runner = join(trustedRoot, 'restricted-runner.exe');
    const pipeBridgeExecutable = join(trustedRoot, 'vox-pipe-bridge.exe');
    await cp(resolve(packageRoot, 'dist/agent/vox.exe'), launcher);
    await compileCSharp(runner, resolve(packageRoot, 'tests/fixtures/RestrictedRunner.cs'));
    await compileCSharp(pipeBridgeExecutable, resolve(packageRoot, 'service/PipeBridge.cs'));
    await writeJson(join(workRoot, 'request.json'), proofRequest);
    // The same invariant `bootstrap:workroot` enforces, checked at the point the work root is
    // built rather than only in the assertion sheet an hour later.
    await verifyWorkRoot(workRoot);
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
    const credentialStoreProbePaths = (
      await Promise.all(
        credentialStoreCandidates(process.env, homedir()).map(async (path) =>
          access(path).then(
            () => path,
            () => null,
          ),
        ),
      )
    ).filter((path): path is string => path !== null);
    const credentialStoreProbes = await Promise.all(
      credentialStoreProbePaths.map(async (path) => ({
        path,
        ...(await restrictedProbe('--probe-denied', path)),
      })),
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
      keyId: `${proofSlug}-proof-key-v1`,
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
      createRunId: () => `${proofSlug}-proof-${++runNumber}`,
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
          try {
            if (seeded.has('audit-crash') && activeCommand === 'production run record') {
              throw new Error('PROOF_SEEDED_AUDIT_CRASH');
            }
            return {
              inventory: await inventoryFiles(workRoot),
              revision: await revisionAt(runPathFrom(request.cwd, request.argv)),
              networkCount: networkEvents.length,
              inputHashes: await inputHashes(request.cwd, request.argv),
              actor: currentActor,
            };
          } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            auditFailures.push({
              command: activeCommand,
              at: new Date().toISOString(),
              message: failure.message,
            });
            throw failure;
          }
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
      credentialStoreProbePaths,
    });

    const mainRun = selectAgentRenderedRun(workRoot, commands);
    // The plan this proof is about, parsed once, here, and used twice: the zero-budget probe
    // below validates against it, and the scenario assertions are scored from it. Reading it
    // now rather than after the harness's own probes is safe and deliberate — the plan binding
    // is fixed once the agent stops running, and `verifyCompilePrerequisiteReports` refuses a
    // Run whose plan identity moved under it (`PLAN_BINDING_MISMATCH`).
    const authoredCheckpoint = JSON.parse(
      await readFile(join(mainRun.root, 'run.json'), 'utf8'),
    ) as RunCheckpoint;
    const plan = await readBoundPlan(mainRun.root, authoredCheckpoint);
    currentActor = 'harness';
    const categoriesSeenByAgent = new Set(
      commands
        .filter((record) => record.actor === 'agent')
        .map((record) => parseOutput(record))
        .filter((envelope) => envelope.command === 'contract.show')
        .map((envelope) => String((envelope.data as { category?: unknown } | null)?.category)),
    );
    // Read from the published table rather than restated here. This loop is an action, not an
    // expectation — it fills in whatever the agent did not ask for — and a hand-kept list left
    // a category unvisited on the day one was added, which the sheet then scored as a miss.
    for (const { id: category } of CONTRACT_CATEGORIES) {
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
    await writeJson(join(workRoot, PAUSED_PROBE_PLAN), plan);
    await invoke([
      'production',
      'run',
      'init',
      '--request',
      'request-paused.json',
      '--out',
      'run-paused',
    ]);
    await invoke([
      'production',
      'run',
      'validate',
      '--run',
      'run-paused',
      '--plan',
      PAUSED_PROBE_PLAN,
    ]);
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
      keyId: `${proofSlug}-proof-key-v1`,
    });
    let inspected: RunCheckpoint | null = null;
    try {
      inspected = await store.inspect();
    } catch {
      inspected = null;
    }
    const checkpoint =
      inspected ?? (JSON.parse(mainAfterInvalid.toString('utf8')) as RunCheckpoint);
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
        verifyRunTake(takeManifest, takeArtifacts, plan.beats, proofRequest.production.voice);
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
    const northbridgeScene = imageSceneSpanningOpeningBeat(plan);
    const northbridgeRequirement = northbridgeScene?.props.assetRequirement as
      | { type?: unknown; subject?: unknown }
      | undefined;
    const showcaseImageScene = firstImageScene(plan);
    const showcaseImageRequirement = showcaseImageScene?.props.assetRequirement as
      | { type?: unknown; subject?: unknown }
      | undefined;
    // Which image the Brief actually named is a scenario fact, not a branch: Northbridge names
    // the opening image, the showcase names one image among eight scenes.
    const scoredImageAsset = assetResolutions.find(
      (asset) => asset.sceneId === scenario.scoredImageScene(plan)?.id,
    );
    const takeDurationSeconds = fold?.timedBeats.length
      ? Number(fold.timedBeats.at(-1)?.toMs ?? 0) / 1000
      : null;

    const assertions = evaluateNorthbridgeAssertions(
      {
        authorship: {
          kind: authoring.authorship,
          unscripted: authoring.unscripted,
        },
        /**
         * Only what the agent's own sandbox measured counts here. These used to fall back to the
         * restricted-token probes below, which measure what *such a token* would be denied and
         * say nothing about the process that actually authored the plan — so a driver that
         * brought no sandbox passed the whole section while its process may have read the
         * repository at will. The probes are still recorded in `permissions.json`, where they
         * evidence the work root's ACL; they are no longer allowed to stand in for the agent.
         */
        isolation: {
          initialFiles: initialInventory.map((entry) => entry.path).sort(),
          workRootReadWrite: authoring.sandboxEvidence?.workRootReadWrite ?? null,
          repositoryDenied: authoring.sandboxEvidence?.repositoryDenied ?? null,
          serviceDenied: authoring.sandboxEvidence?.serviceDenied ?? null,
          credentialsDenied: authoring.sandboxEvidence?.credentialsDenied ?? null,
          credentialsEnvironmentDenied:
            authoring.sandboxEvidence?.credentialsEnvironmentDenied ?? null,
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
          // A driver reporting on its own egress is not evidence. Only a sandbox that actually
          // attempted a connection and was refused can settle this one.
          directDenied: authoring.sandboxEvidence?.directNetworkDenied ?? null,
        },
        limits: {
          planVersions,
          validateCalls: agentRecords.filter(({ envelope }) => envelope.command === 'run.validate')
            .length,
          preflightCalls: agentRecords.filter(
            ({ envelope }) => envelope.command === 'run.preflight',
          ).length,
          postRecordPlanVersions,
          humanHints: authoring.humanHints,
        },
        run: {
          stage: checkpoint.stage,
          bindingsFresh: Object.values(checkpoint.bindings).every(
            (binding) =>
              binding === null || !('freshness' in binding) || binding.freshness.state === 'fresh',
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
          sceneCount: scenes.length,
          eventDrivenCapabilities: [
            ...new Set(
              scenes
                .filter((scene) => (scene.events?.length ?? 0) > 0)
                .map((scene) => scene.component),
            ),
          ],
          showcaseAssetRequirement:
            showcaseImageRequirement?.type === 'image' &&
            typeof showcaseImageRequirement.subject === 'string' &&
            /(?:harbou?r|helios|wind|solar)/i.test(showcaseImageRequirement.subject),
          showcasePlanCompliant: catalogShowcasePlanViolations(plan).length === 0,
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
          northbridgeStatus: scoredImageAsset?.status ?? null,
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
      },
      {
        durationBounds,
        targetSeconds,
        scenario: scenario.assertionScenario,
        expectedCapabilities: scenario.expectedCapabilities,
      },
    );
    const verdict = machineVerdict(assertions);

    await cp(mainRunRoot, join(stagedEvidence, 'main-run'), { recursive: true });
    await cp(pausedRunRoot, join(stagedEvidence, 'paused-run'), { recursive: true });
    // Whatever the agent kept for itself, carried out of a work root that is about to be
    // deleted. Contained-path checked for the same reason every other agent-supplied locator
    // is: this one names a directory and the harness is about to copy it.
    if (authoring.evidenceRoot) {
      const agentEvidence = resolve(workRoot, authoring.evidenceRoot);
      if (!isContainedPath(workRoot, agentEvidence))
        throw new Error('PROOF_AGENT_EVIDENCE_ESCAPED');
      await cp(agentEvidence, join(stagedEvidence, 'agent-evidence'), { recursive: true });
    }
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
      credentialStoreProbes,
      identity: {
        restriction: 'SAFER_CONSTRAINED',
        output: identityProbe.stdout.trim(),
      },
      codexSandbox: authoring.sandboxEvidence,
    });
    await writeJson(join(stagedEvidence, 'leak-scan.json'), leakScan);
    await writeJson(join(stagedEvidence, 'network-audit.json'), {
      // What the driver says about its own egress, and whether anything actually measured it.
      // The two are separate fields on purpose: only the second one is evidence.
      directPolicyDenied: authoring.directNetworkDenied,
      directPolicyEvidencedBySandbox: authoring.sandboxEvidence !== null,
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
        scenario.humanVerdictRows,
      ),
    );
    const summary = `# ${scenario.title} proof evidence

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

${nonClaims.map((claim) => `- ${claim}`).join('\n')}
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
        auditFailures,
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

export type CatalogShowcaseProofOptions = Omit<NorthbridgeProofOptions, 'length'>;

export const runCatalogShowcaseProof = (options: CatalogShowcaseProofOptions) =>
  runNorthbridgeProof({ ...options, length: 'showcase' });
