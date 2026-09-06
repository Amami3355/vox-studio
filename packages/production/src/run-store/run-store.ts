import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  constants,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { type JsonValue, canonicalJson, hashCanonicalJson, sha256Bytes } from '../canonical-json';
import {
  type ArtifactDescriptor,
  type CommandId,
  type CommandOutcome,
  type ImageJob,
  PROTOCOL_VERSION,
  type ProductionRequest,
  type ResultEnvelope,
  type RunStage,
  artifactDescriptorSchema,
  imageJobSchema,
  productionRequestSchema,
  resultEnvelopeSchema,
} from '../contracts/schemas';
import { RUN_PATHS } from './paths';

type JsonObject = { [key: string]: JsonValue };

export type Freshness = { state: 'fresh' | 'stale'; reasons: string[] };

export type AssetResolution = {
  sectionId: string;
  sceneId: string | null;
  field: string;
  status: 'ready' | 'placeholder' | 'failed';
  uri: string | null;
  pendingRequirementId: string | null;
  requirementId: string | null;
  reason: string | null;
};

export type RunBindings = {
  plan: {
    planSha256: string;
    snapshot: ArtifactDescriptor;
    freshness: Freshness;
  } | null;
  validation: {
    validationInputSha256: string;
    planSha256: string;
    report: ArtifactDescriptor;
    freshness: Freshness;
  } | null;
  preflight: {
    preflightInputSha256: string;
    planSha256: string;
    report: ArtifactDescriptor;
    freshness: Freshness;
  } | null;
  take: {
    recordingInputSha256: string;
    takeId: string;
    takeSha256: string;
    beatShapeSha256: string;
    manifest: ArtifactDescriptor;
    audio: ArtifactDescriptor;
    alignment: ArtifactDescriptor;
    fold: ArtifactDescriptor;
    freshness: Freshness;
  } | null;
  compilation: {
    compileInputSha256: string;
    planSha256: string;
    takeSha256: string;
    document: ArtifactDescriptor;
    report: ArtifactDescriptor;
    assetResolutions: AssetResolution[];
    freshness: Freshness;
  } | null;
  render: {
    renderInputSha256: string;
    compileInputSha256: string;
    preview: ArtifactDescriptor;
    assetResolutions: AssetResolution[];
    freshness: Freshness;
  } | null;
  images: {
    jobs: ImageJob[];
    consumedGrantIds: string[];
  };
};

export const EMPTY_RUN_BINDINGS: RunBindings = {
  plan: null,
  validation: null,
  preflight: null,
  take: null,
  compilation: null,
  render: null,
  images: { jobs: [], consumedGrantIds: [] },
};

export type RunQuota = {
  maxNewTakes: number;
  newTakesUsed: number;
  replacementGrantIdsUsed: string[];
};

export type RunCheckpointState = {
  protocolVersion: 1;
  runId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  stage: RunStage;
  lastOutcome: CommandOutcome;
  request: {
    requestSha256: string;
    artifact: ArtifactDescriptor;
  };
  quota: RunQuota;
  bindings: RunBindings;
  terminal: JsonValue | null;
};

export type Attestation = {
  keyId: string;
  algorithm: 'HMAC-SHA256';
  value: string;
};

export type RunCheckpoint = RunCheckpointState & {
  headReceiptSha256: string;
  attestation: Attestation;
};

type Receipt = {
  protocolVersion: 1;
  runId: string;
  sequence: number;
  command: CommandId;
  operationSha256: string;
  previousReceiptSha256: string | null;
  previousReceiptPath: string | null;
  state: RunCheckpointState;
  envelope: ResultEnvelope;
  attestation: Attestation;
};

type Ledger = {
  protocolVersion: 1;
  runId: string;
  revision: number;
  headReceiptSha256: string;
  headReceiptPath: string;
  maxNewTakes: number;
  newTakesUsed: number;
  consumedGrantIds: string[];
  recordingAttempts: RecordingAttempt[];
  projectionPending: boolean;
};

export type RecordingAttemptStatus =
  | 'dispatching'
  | 'response_received'
  | 'uncertain'
  | 'failed'
  | 'published';

export type RecordingAttempt = {
  attemptId: string;
  recordingInputSha256: string;
  status: RecordingAttemptStatus;
  replacement: boolean;
  grantId: string | null;
  response: { audioSha256: string; alignmentSha256: string } | null;
  takeSha256: string | null;
};

export type PrivateRecordingResponse = {
  audio: Uint8Array;
  alignment: JsonValue;
};

export type RunStoreExclusiveSession = {
  inspect: () => Promise<RunCheckpoint>;
  commit: (input: CommitInput) => Promise<RunCheckpoint>;
  recordingAttempts: (recordingInputSha256: string) => Promise<RecordingAttempt[]>;
  quota: () => Promise<RunQuota>;
  historicalTakeBindings: () => Promise<NonNullable<RunBindings['take']>[]>;
  beginRecordingDispatch: (input: {
    expectedRevision: number;
    recordingInputSha256: string;
    replacement: boolean;
    grantId?: string;
  }) => Promise<RecordingAttempt>;
  persistRecordingResponse: (
    attemptId: string,
    response: PrivateRecordingResponse,
  ) => Promise<void>;
  readRecordingResponse: (attemptId: string) => Promise<PrivateRecordingResponse>;
  markRecordingAttempt: (
    attemptId: string,
    status: Extract<RecordingAttemptStatus, 'uncertain' | 'failed' | 'published'>,
    takeSha256?: string,
  ) => Promise<void>;
};

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const attestationSchema = z
  .object({
    keyId: z.string().min(1),
    algorithm: z.literal('HMAC-SHA256'),
    value: sha256Schema,
  })
  .strict();
const freshnessSchema = z
  .object({ state: z.enum(['fresh', 'stale']), reasons: z.array(z.string()) })
  .strict();
const assetResolutionSchema = z
  .object({
    sectionId: z.string(),
    sceneId: z.string().nullable(),
    field: z.string(),
    status: z.enum(['ready', 'placeholder', 'failed']),
    uri: z.string().nullable(),
    pendingRequirementId: z.string().nullable(),
    requirementId: z.string().nullable(),
    reason: z.string().nullable(),
  })
  .strict();
const runBindingsSchema = z
  .object({
    plan: z
      .object({
        planSha256: sha256Schema,
        snapshot: artifactDescriptorSchema,
        freshness: freshnessSchema,
      })
      .strict()
      .nullable(),
    validation: z
      .object({
        validationInputSha256: sha256Schema,
        planSha256: sha256Schema,
        report: artifactDescriptorSchema,
        freshness: freshnessSchema,
      })
      .strict()
      .nullable(),
    preflight: z
      .object({
        preflightInputSha256: sha256Schema,
        planSha256: sha256Schema,
        report: artifactDescriptorSchema,
        freshness: freshnessSchema,
      })
      .strict()
      .nullable(),
    take: z
      .object({
        recordingInputSha256: sha256Schema,
        takeId: z.string().regex(/^[0-9a-f]{12}$/),
        takeSha256: sha256Schema,
        beatShapeSha256: sha256Schema,
        manifest: artifactDescriptorSchema,
        audio: artifactDescriptorSchema,
        alignment: artifactDescriptorSchema,
        fold: artifactDescriptorSchema,
        freshness: freshnessSchema,
      })
      .strict()
      .nullable(),
    compilation: z
      .object({
        compileInputSha256: sha256Schema,
        planSha256: sha256Schema,
        takeSha256: sha256Schema,
        document: artifactDescriptorSchema,
        report: artifactDescriptorSchema,
        assetResolutions: z.array(assetResolutionSchema),
        freshness: freshnessSchema,
      })
      .strict()
      .nullable(),
    render: z
      .object({
        renderInputSha256: sha256Schema,
        compileInputSha256: sha256Schema,
        preview: artifactDescriptorSchema,
        assetResolutions: z.array(assetResolutionSchema),
        freshness: freshnessSchema,
      })
      .strict()
      .nullable(),
    images: z
      .object({
        jobs: z.array(imageJobSchema),
        consumedGrantIds: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict();
const quotaSchema = z
  .object({
    maxNewTakes: z.number().int().nonnegative(),
    newTakesUsed: z.number().int().nonnegative(),
    replacementGrantIdsUsed: z.array(z.string().min(1)),
  })
  .strict();
const checkpointStateSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    runId: z.string().min(1),
    revision: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    stage: z.enum([
      'initialized',
      'validated',
      'preflighted',
      'recorded',
      'compiled',
      'rendered',
      'declined',
    ]),
    lastOutcome: z.enum(['succeeded', 'needs_repair', 'paused', 'declined', 'failed']),
    request: z.object({ requestSha256: sha256Schema, artifact: artifactDescriptorSchema }).strict(),
    quota: quotaSchema,
    bindings: runBindingsSchema,
    terminal: z.json().nullable(),
  })
  .strict();
const checkpointSchema = checkpointStateSchema
  .extend({ headReceiptSha256: sha256Schema, attestation: attestationSchema })
  .strict();
const receiptSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    runId: z.string().min(1),
    sequence: z.number().int().positive(),
    command: z.enum([
      'run.init',
      'run.decline',
      'run.validate',
      'run.preflight',
      'run.record',
      'run.compile',
      'run.render',
      'run.image.start',
      'run.image.accept',
      'run.image.reject',
    ]),
    operationSha256: sha256Schema,
    previousReceiptSha256: sha256Schema.nullable(),
    previousReceiptPath: z.string().min(1).nullable(),
    state: checkpointStateSchema,
    envelope: resultEnvelopeSchema,
    attestation: attestationSchema,
  })
  .strict();
const ledgerSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    runId: z.string().min(1),
    revision: z.number().int().positive(),
    headReceiptSha256: sha256Schema,
    headReceiptPath: z.string().min(1),
    maxNewTakes: z.number().int().nonnegative(),
    newTakesUsed: z.number().int().nonnegative(),
    consumedGrantIds: z.array(z.string().min(1)),
    recordingAttempts: z
      .array(
        z
          .object({
            attemptId: z.uuid(),
            recordingInputSha256: sha256Schema,
            status: z.enum([
              'dispatching',
              'response_received',
              'uncertain',
              'failed',
              'published',
            ]),
            replacement: z.boolean(),
            grantId: z.string().min(1).nullable(),
            response: z
              .object({ audioSha256: sha256Schema, alignmentSha256: sha256Schema })
              .strict()
              .nullable(),
            takeSha256: sha256Schema.nullable(),
          })
          .strict(),
      )
      .default([]),
    projectionPending: z.boolean(),
  })
  .strict();

export type CrashPoint = 'after_publication' | 'after_ledger' | 'after_checkpoint';

export type RunStoreOptions = {
  runRoot: string;
  ledgerRoot: string;
  runId: string;
  hmacKey: string | Uint8Array;
  keyId: string;
  lockTimeoutMs?: number;
  leaseMs?: number;
  now?: () => Date;
  crashAt?: (point: CrashPoint) => void;
};

export type ImmutableArtifactInput = {
  kind: string;
  path: string;
  bytes: string | Uint8Array;
};

export type CommitInput = {
  expectedRevision: number;
  command: Exclude<CommandId, 'contract.index' | 'contract.show' | 'run.status'>;
  outcome: CommandOutcome;
  stage?: RunStage;
  artifacts?: ImmutableArtifactInput[];
  bindings?: RunBindings | ((artifacts: ArtifactDescriptor[]) => RunBindings);
  terminal?: JsonValue | null;
  data?: JsonObject | null;
  error?: ResultEnvelope['error'];
  next?: ResultEnvelope['next'];
  quota?: { newTakesDelta?: number; consumeGrantId?: string };
};

export class RunStoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RunStoreError';
  }
}

const asBytes = (value: string | Uint8Array): Uint8Array =>
  typeof value === 'string' ? Buffer.from(value, 'utf8') : value;

const parseJson = <T>(bytes: Uint8Array, label: string): T => {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as T;
  } catch {
    throw new RunStoreError('RUN_INTEGRITY_ERROR', `${label} is not valid JSON.`);
  }
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const pathInside = (parent: string, candidate: string): boolean => {
  const child = relative(parent, candidate);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child));
};

export class RunStore {
  private readonly runRoot: string;
  private readonly ledgerRoot: string;
  private readonly hmacKey: string | Uint8Array;
  private readonly keyId: string;
  private readonly lockTimeoutMs: number;
  private readonly leaseMs: number;
  private readonly now: () => Date;
  private readonly crashAt?: (point: CrashPoint) => void;
  private canonicalRunRoot: string | null = null;

  constructor(private readonly options: RunStoreOptions) {
    if (options.runId.length === 0) throw new TypeError('runId must be non-empty.');
    this.runRoot = resolve(options.runRoot);
    this.ledgerRoot = resolve(options.ledgerRoot);
    if (pathInside(this.runRoot, this.ledgerRoot)) {
      throw new RunStoreError(
        'PRIVATE_LEDGER_EXPOSED',
        'The private ledger may not be inside the Run root.',
      );
    }
    this.hmacKey = options.hmacKey;
    this.keyId = options.keyId;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 500;
    this.leaseMs = options.leaseMs ?? 30_000;
    this.now = options.now ?? (() => new Date());
    this.crashAt = options.crashAt;
  }

  async initialize(requestInput: unknown): Promise<RunCheckpoint> {
    const request = productionRequestSchema.parse(requestInput);
    await mkdir(this.ledgerRoot, { recursive: true });
    await this.createRunRoot();

    return this.withLease(async () => {
      if (await this.fileExists(this.ledgerPath())) {
        throw new RunStoreError(
          'RUN_ALREADY_EXISTS',
          `Run "${this.options.runId}" already exists.`,
        );
      }

      const requestBytes = Buffer.from(canonicalJson(request as JsonValue), 'utf8');
      const requestArtifact = await this.publishImmutable({
        kind: 'production_request',
        path: RUN_PATHS.request,
        bytes: requestBytes,
      });
      const at = this.isoNow();
      const state: RunCheckpointState = {
        protocolVersion: PROTOCOL_VERSION,
        runId: this.options.runId,
        revision: 1,
        createdAt: at,
        updatedAt: at,
        stage: 'initialized',
        lastOutcome: 'succeeded',
        request: {
          requestSha256: hashCanonicalJson('production-request', request as JsonValue),
          artifact: requestArtifact,
        },
        quota: {
          maxNewTakes: request.production.maxNewTakes,
          newTakesUsed: 0,
          replacementGrantIdsUsed: [],
        },
        bindings: structuredClone(EMPTY_RUN_BINDINGS),
        terminal: null,
      };
      const envelope = resultEnvelopeSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        command: 'run.init',
        outcome: 'succeeded',
        run: { id: this.options.runId, stage: 'initialized' },
        data: { created: true },
        artifacts: [requestArtifact],
        error: null,
        next: [
          {
            command: 'run.validate',
            args: ['--run', '.', '--plan', '<plan.json>'],
            reason: 'Run initialized.',
          },
        ],
      });
      const operationSha256 = hashCanonicalJson('run-operation', {
        command: 'run.init',
        requestSha256: state.request.requestSha256,
      });

      return this.publishCommit({
        previous: null,
        state,
        command: 'run.init',
        operationSha256,
        envelope,
      });
    });
  }

  async commit(input: CommitInput): Promise<RunCheckpoint> {
    return this.withLease(() => this.commitUnderLease(input));
  }

  async exclusive<T>(work: (session: RunStoreExclusiveSession) => Promise<T>): Promise<T> {
    return this.withLease(() =>
      work({
        inspect: () => this.inspect(),
        commit: (input) => this.commitUnderLease(input),
        recordingAttempts: (recordingInputSha256) =>
          this.recordingAttemptsUnderLease(recordingInputSha256),
        quota: async () => this.quotaFromLedger(await this.readLedger()),
        historicalTakeBindings: () => this.historicalTakeBindingsUnderLease(),
        beginRecordingDispatch: (input) => this.beginRecordingDispatchUnderLease(input),
        persistRecordingResponse: (attemptId, response) =>
          this.persistRecordingResponseUnderLease(attemptId, response),
        readRecordingResponse: (attemptId) => this.readRecordingResponseUnderLease(attemptId),
        markRecordingAttempt: (attemptId, status, takeSha256) =>
          this.markRecordingAttemptUnderLease(attemptId, status, takeSha256),
      }),
    );
  }

  private async commitUnderLease(input: CommitInput): Promise<RunCheckpoint> {
    await this.assertRunRoot();
    let ledger = await this.readLedger();
    ledger = await this.recoverProjectionUnderLease(ledger);
    if (ledger.revision !== input.expectedRevision) {
      throw new RunStoreError(
        'RUN_REVISION_CONFLICT',
        `Expected revision ${input.expectedRevision}; private ledger is ${ledger.revision}.`,
      );
    }

    const previousReceipt = await this.verifyReceiptChain(ledger);
    const previousState = previousReceipt.state;
    const artifacts: ArtifactDescriptor[] = [];
    for (const artifact of input.artifacts ?? [])
      artifacts.push(await this.publishImmutable(artifact));

    const nextQuota = this.applyQuota(this.quotaFromLedger(ledger), input.quota);
    const bindings =
      typeof input.bindings === 'function'
        ? input.bindings(artifacts)
        : (input.bindings ?? previousState.bindings);
    const stage = input.stage ?? previousState.stage;
    const intent: JsonObject = {
      expectedRevision: input.expectedRevision,
      command: input.command,
      outcome: input.outcome,
      stage,
      artifacts: artifacts as unknown as JsonValue,
      bindings: bindings as unknown as JsonValue,
      terminal: input.terminal === undefined ? previousState.terminal : input.terminal,
      quota: nextQuota as unknown as JsonValue,
      data: input.data ?? null,
      error: (input.error ?? null) as JsonValue,
      next: (input.next ?? []) as unknown as JsonValue,
    };
    const operationSha256 = hashCanonicalJson('run-operation', intent);
    const receiptPath = RUN_PATHS.receipt(ledger.revision + 1, input.command);
    const existing = await this.readOptionalSecure(receiptPath);
    if (existing) {
      const receipt = this.verifyReceiptBytes(existing, receiptPath);
      if (
        receipt.operationSha256 !== operationSha256 ||
        receipt.previousReceiptSha256 !== ledger.headReceiptSha256
      ) {
        throw new RunStoreError(
          'RUN_FORK_DETECTED',
          `Receipt slot ${receiptPath} belongs to another operation.`,
        );
      }
      return this.advanceFromReceipt(ledger, receiptPath, existing, receipt);
    }

    const state: RunCheckpointState = {
      ...previousState,
      revision: ledger.revision + 1,
      updatedAt: this.isoNow(),
      stage,
      lastOutcome: input.outcome,
      quota: nextQuota,
      bindings,
      terminal: input.terminal === undefined ? previousState.terminal : input.terminal,
    };
    const envelope = resultEnvelopeSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      command: input.command,
      outcome: input.outcome,
      run: { id: this.options.runId, stage },
      data: input.data ?? null,
      artifacts,
      error:
        input.outcome === 'failed'
          ? (input.error ?? {
              code: 'COMMAND_FAILED',
              message: 'Command failed.',
              details: null,
            })
          : null,
      next: input.next ?? [],
    });

    return this.publishCommit({
      previous: { ledger, receipt: previousReceipt },
      state,
      command: input.command,
      operationSha256,
      envelope,
    });
  }

  async inspect(): Promise<RunCheckpoint> {
    await this.assertRunRoot();
    const ledger = await this.readLedger();
    const receipt = await this.verifyReceiptChain(ledger);
    const authoritative = this.checkpointFrom(receipt.state, ledger.headReceiptSha256);
    const publicCheckpoint = await this.readPublicCheckpoint();

    if (!publicCheckpoint) {
      if (ledger.projectionPending) return authoritative;
      throw new RunStoreError(
        'RUN_ROLLBACK_DETECTED',
        'run.json is missing after a completed commit.',
      );
    }
    this.assertCheckpoint(publicCheckpoint);
    if (
      publicCheckpoint.revision === authoritative.revision &&
      publicCheckpoint.headReceiptSha256 === authoritative.headReceiptSha256
    ) {
      this.assertSameState(publicCheckpoint, authoritative);
      await this.readArtifact(authoritative.request.artifact);
      await this.verifyBoundArtifacts(publicCheckpoint.bindings);
      return authoritative;
    }
    if (publicCheckpoint.revision < authoritative.revision && ledger.projectionPending)
      return authoritative;
    if (publicCheckpoint.revision < authoritative.revision) {
      throw new RunStoreError(
        'RUN_ROLLBACK_DETECTED',
        'run.json is an older valid checkpoint than the private head.',
      );
    }
    throw new RunStoreError(
      'RUN_FORK_DETECTED',
      'run.json does not match the private receipt-chain head.',
    );
  }

  async recoverCheckpoint(): Promise<RunCheckpoint> {
    return this.withLease(async () => {
      await this.assertRunRoot();
      const ledger = await this.readLedger();
      return this.checkpointFromLedger(await this.recoverProjectionUnderLease(ledger));
    });
  }

  async publishImmutable(input: ImmutableArtifactInput): Promise<ArtifactDescriptor> {
    await this.assertRunRoot();
    const bytes = asBytes(input.bytes);
    const target = await this.secureTarget(input.path, true);
    const existing = await this.readOptionalSecure(input.path);
    const expectedSha256 = sha256Bytes(bytes);

    if (existing) {
      if (
        sha256Bytes(existing) !== expectedSha256 ||
        !Buffer.from(existing).equals(Buffer.from(bytes))
      ) {
        throw new RunStoreError(
          'IMMUTABLE_ARTIFACT_MISMATCH',
          `${input.path} already contains different bytes.`,
        );
      }
      return { kind: input.kind, path: input.path, sha256: expectedSha256 };
    }

    const temporary = await this.writePrivateTemporary(bytes);
    try {
      await link(temporary, target);
      await this.syncDirectory(dirname(target));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const raced = await this.readSecure(input.path);
        if (
          sha256Bytes(raced) !== expectedSha256 ||
          !Buffer.from(raced).equals(Buffer.from(bytes))
        ) {
          throw new RunStoreError(
            'IMMUTABLE_ARTIFACT_MISMATCH',
            `${input.path} won a race with different bytes.`,
          );
        }
      } else if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
        throw new RunStoreError(
          'PRIVATE_TEMP_CROSS_DEVICE',
          'Private temporary storage must share a filesystem with the Run for atomic publication.',
        );
      } else {
        throw error;
      }
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return { kind: input.kind, path: input.path, sha256: expectedSha256 };
  }

  async publishCanonicalSnapshot(
    kind: string,
    path: string,
    value: JsonValue,
  ): Promise<ArtifactDescriptor> {
    return this.publishImmutable({ kind, path, bytes: canonicalJson(value) });
  }

  async readArtifact(descriptor: ArtifactDescriptor): Promise<Uint8Array> {
    const parsed = artifactDescriptorSchema.parse(descriptor);
    const bytes = await this.readSecure(parsed.path);
    if (sha256Bytes(bytes) !== parsed.sha256) {
      throw new RunStoreError(
        'RUN_ARTIFACT_CHANGED',
        `${parsed.path} no longer matches its descriptor.`,
      );
    }
    return bytes;
  }

  artifactDescriptors(bindings: RunBindings): ArtifactDescriptor[] {
    return this.collectArtifactDescriptors(bindings as unknown as JsonValue);
  }

  private async publishCommit(input: {
    previous: { ledger: Ledger; receipt: Receipt } | null;
    state: RunCheckpointState;
    command: CommitInput['command'];
    operationSha256: string;
    envelope: ResultEnvelope;
  }): Promise<RunCheckpoint> {
    const previousHash = input.previous?.ledger.headReceiptSha256 ?? null;
    const previousPath = input.previous?.ledger.headReceiptPath ?? null;
    const unsignedReceipt = {
      protocolVersion: PROTOCOL_VERSION,
      runId: this.options.runId,
      sequence: input.state.revision,
      command: input.command,
      operationSha256: input.operationSha256,
      previousReceiptSha256: previousHash,
      previousReceiptPath: previousPath,
      state: input.state,
      envelope: input.envelope,
    };
    const receipt: Receipt = {
      ...unsignedReceipt,
      attestation: this.attest('run-receipt', unsignedReceipt as unknown as JsonValue),
    };
    const receiptBytes = Buffer.from(canonicalJson(receipt as unknown as JsonValue), 'utf8');
    const receiptPath = RUN_PATHS.receipt(input.state.revision, input.command);
    await this.publishImmutable({
      kind: 'command_receipt',
      path: receiptPath,
      bytes: receiptBytes,
    });
    this.crashAt?.('after_publication');

    const ledger: Ledger = {
      protocolVersion: PROTOCOL_VERSION,
      runId: this.options.runId,
      revision: input.state.revision,
      headReceiptSha256: sha256Bytes(receiptBytes),
      headReceiptPath: receiptPath,
      maxNewTakes: input.state.quota.maxNewTakes,
      newTakesUsed: input.state.quota.newTakesUsed,
      consumedGrantIds: [...input.state.quota.replacementGrantIdsUsed],
      recordingAttempts: input.previous?.ledger.recordingAttempts ?? [],
      projectionPending: true,
    };
    await this.writeLedger(ledger);
    this.crashAt?.('after_ledger');

    const checkpoint = this.checkpointFrom(input.state, ledger.headReceiptSha256);
    await this.writeCheckpoint(checkpoint);
    this.crashAt?.('after_checkpoint');

    await this.writeLedger({ ...ledger, projectionPending: false });
    return checkpoint;
  }

  private async advanceFromReceipt(
    ledger: Ledger,
    receiptPath: string,
    receiptBytes: Uint8Array,
    receipt: Receipt,
  ): Promise<RunCheckpoint> {
    const next: Ledger = {
      protocolVersion: PROTOCOL_VERSION,
      runId: this.options.runId,
      revision: receipt.sequence,
      headReceiptSha256: sha256Bytes(receiptBytes),
      headReceiptPath: receiptPath,
      maxNewTakes: receipt.state.quota.maxNewTakes,
      newTakesUsed: receipt.state.quota.newTakesUsed,
      consumedGrantIds: [...receipt.state.quota.replacementGrantIdsUsed],
      recordingAttempts: ledger.recordingAttempts,
      projectionPending: true,
    };
    if (receipt.previousReceiptSha256 !== ledger.headReceiptSha256) {
      throw new RunStoreError(
        'RUN_FORK_DETECTED',
        'Orphan receipt does not extend the private head.',
      );
    }
    await this.writeLedger(next);
    this.crashAt?.('after_ledger');
    const checkpoint = this.checkpointFrom(receipt.state, next.headReceiptSha256);
    await this.writeCheckpoint(checkpoint);
    this.crashAt?.('after_checkpoint');
    await this.writeLedger({ ...next, projectionPending: false });
    return checkpoint;
  }

  private quotaFromLedger(ledger: Ledger): RunQuota {
    return {
      maxNewTakes: ledger.maxNewTakes,
      newTakesUsed: ledger.newTakesUsed,
      replacementGrantIdsUsed: [...ledger.consumedGrantIds],
    };
  }

  private async recordingAttemptsUnderLease(
    recordingInputSha256: string,
  ): Promise<RecordingAttempt[]> {
    const ledger = await this.readLedger();
    return ledger.recordingAttempts
      .filter((attempt) => attempt.recordingInputSha256 === recordingInputSha256)
      .map((attempt) => structuredClone(attempt));
  }

  private async historicalTakeBindingsUnderLease(): Promise<NonNullable<RunBindings['take']>[]> {
    const ledger = await this.readLedger();
    let path: string | null = ledger.headReceiptPath;
    let expectedHash: string | null = ledger.headReceiptSha256;
    let expectedSequence = ledger.revision;
    const takes: NonNullable<RunBindings['take']>[] = [];
    const identities = new Set<string>();

    while (path && expectedHash) {
      const bytes = await this.readSecure(path);
      if (sha256Bytes(bytes) !== expectedHash) {
        throw new RunStoreError('RUN_RECEIPT_CHAIN_INVALID', `${path} changed in Take history.`);
      }
      const receipt = this.verifyReceiptBytes(bytes, path);
      if (receipt.sequence !== expectedSequence) {
        throw new RunStoreError(
          'RUN_RECEIPT_CHAIN_INVALID',
          `${path} has a non-monotonic sequence.`,
        );
      }
      const take = receipt.state.bindings.take;
      if (take) {
        const identity = `${take.takeSha256}:${take.beatShapeSha256}`;
        if (!identities.has(identity)) {
          identities.add(identity);
          takes.push(structuredClone(take));
        }
      }
      path = receipt.previousReceiptPath;
      expectedHash = receipt.previousReceiptSha256;
      expectedSequence -= 1;
    }
    if (expectedSequence !== 0 || path !== null || expectedHash !== null) {
      throw new RunStoreError(
        'RUN_RECEIPT_CHAIN_INVALID',
        'Receipt chain does not terminate while reading Take history.',
      );
    }
    return takes;
  }

  private async beginRecordingDispatchUnderLease(input: {
    expectedRevision: number;
    recordingInputSha256: string;
    replacement: boolean;
    grantId?: string;
  }): Promise<RecordingAttempt> {
    let ledger = await this.readLedger();
    ledger = await this.recoverProjectionUnderLease(ledger);
    if (ledger.revision !== input.expectedRevision) {
      throw new RunStoreError(
        'RUN_REVISION_CONFLICT',
        `Expected revision ${input.expectedRevision}; private ledger is ${ledger.revision}.`,
      );
    }
    const priorDispatch = ledger.recordingAttempts.some(
      (attempt) => attempt.recordingInputSha256 === input.recordingInputSha256,
    );
    if (priorDispatch !== input.replacement) {
      throw new RunStoreError(
        'RECORDING_DISPATCH_STATE_CHANGED',
        'Recording replacement state changed before dispatch.',
      );
    }
    if (input.replacement && !input.grantId) {
      throw new RunStoreError(
        'REPLACEMENT_AUTHORISATION_REQUIRED',
        'A later dispatch for this Recording input requires a replacement grant.',
      );
    }
    if (input.grantId && ledger.consumedGrantIds.includes(input.grantId)) {
      throw new RunStoreError('GRANT_REPLAYED', `Grant "${input.grantId}" was already consumed.`);
    }
    if (ledger.newTakesUsed >= ledger.maxNewTakes) {
      throw new RunStoreError('QUOTA_EXHAUSTED', 'Recording dispatch would exceed maxNewTakes.');
    }

    const attempt: RecordingAttempt = {
      attemptId: randomUUID(),
      recordingInputSha256: input.recordingInputSha256,
      status: 'dispatching',
      replacement: input.replacement,
      grantId: input.replacement ? (input.grantId ?? null) : null,
      response: null,
      takeSha256: null,
    };
    const consumedGrantIds = [...ledger.consumedGrantIds];
    if (attempt.grantId) consumedGrantIds.push(attempt.grantId);
    await this.writeLedger({
      ...ledger,
      newTakesUsed: ledger.newTakesUsed + 1,
      consumedGrantIds,
      recordingAttempts: [...ledger.recordingAttempts, attempt],
    });
    return structuredClone(attempt);
  }

  private async persistRecordingResponseUnderLease(
    attemptId: string,
    response: PrivateRecordingResponse,
  ): Promise<void> {
    const ledger = await this.readLedger();
    const index = ledger.recordingAttempts.findIndex(
      (candidate) => candidate.attemptId === attemptId,
    );
    const attempt = ledger.recordingAttempts[index];
    if (!attempt || attempt.status !== 'dispatching') {
      throw new RunStoreError(
        'RECORDING_ATTEMPT_STATE_INVALID',
        'Only a dispatching attempt may accept a provider response.',
      );
    }
    const paths = this.recordingResponsePaths(attemptId);
    const audio = Buffer.from(response.audio);
    const alignment = Buffer.from(canonicalJson(response.alignment), 'utf8');
    await mkdir(dirname(paths.audio), { recursive: true });
    await this.writePrivateImmutable(paths.audio, audio);
    await this.writePrivateImmutable(paths.alignment, alignment);
    const next = structuredClone(ledger.recordingAttempts);
    next[index] = {
      ...attempt,
      status: 'response_received',
      response: { audioSha256: sha256Bytes(audio), alignmentSha256: sha256Bytes(alignment) },
    };
    await this.writeLedger({ ...ledger, recordingAttempts: next });
  }

  private async readRecordingResponseUnderLease(
    attemptId: string,
  ): Promise<PrivateRecordingResponse> {
    const ledger = await this.readLedger();
    const attempt = ledger.recordingAttempts.find((candidate) => candidate.attemptId === attemptId);
    if (!attempt?.response || attempt.status !== 'response_received') {
      throw new RunStoreError(
        'RECORDING_RESPONSE_UNAVAILABLE',
        'No complete private provider response is available for recovery.',
      );
    }
    const paths = this.recordingResponsePaths(attemptId);
    const [audio, alignmentBytes] = await Promise.all([
      readFile(paths.audio),
      readFile(paths.alignment),
    ]);
    if (
      sha256Bytes(audio) !== attempt.response.audioSha256 ||
      sha256Bytes(alignmentBytes) !== attempt.response.alignmentSha256
    ) {
      throw new RunStoreError(
        'RECORDING_RESPONSE_CHANGED',
        'Private provider response no longer matches the authoritative ledger.',
      );
    }
    return {
      audio,
      alignment: parseJson<JsonValue>(alignmentBytes, 'private recording alignment'),
    };
  }

  private async markRecordingAttemptUnderLease(
    attemptId: string,
    status: Extract<RecordingAttemptStatus, 'uncertain' | 'failed' | 'published'>,
    takeSha256?: string,
  ): Promise<void> {
    const ledger = await this.readLedger();
    const index = ledger.recordingAttempts.findIndex(
      (candidate) => candidate.attemptId === attemptId,
    );
    const attempt = ledger.recordingAttempts[index];
    if (!attempt) {
      throw new RunStoreError('RECORDING_ATTEMPT_MISSING', 'Recording attempt is missing.');
    }
    const valid =
      (status === 'uncertain' && attempt.status === 'dispatching') ||
      (status === 'failed' &&
        (attempt.status === 'dispatching' || attempt.status === 'response_received')) ||
      (status === 'published' && attempt.status === 'response_received' && takeSha256);
    if (!valid) {
      throw new RunStoreError(
        'RECORDING_ATTEMPT_STATE_INVALID',
        `Cannot move recording attempt from ${attempt.status} to ${status}.`,
      );
    }
    const next = structuredClone(ledger.recordingAttempts);
    next[index] = {
      ...attempt,
      status,
      takeSha256: status === 'published' ? (takeSha256 ?? null) : null,
    };
    await this.writeLedger({ ...ledger, recordingAttempts: next });
  }

  private recordingResponsePaths(attemptId: string): { audio: string; alignment: string } {
    if (!/^[0-9a-f-]{36}$/.test(attemptId)) {
      throw new RunStoreError('RECORDING_ATTEMPT_ID_INVALID', 'Recording attempt id is invalid.');
    }
    const directory = resolve(
      this.ledgerRoot,
      'recording-responses',
      sha256Bytes(this.options.runId),
      attemptId,
    );
    return {
      audio: resolve(directory, 'audio.bin'),
      alignment: resolve(directory, 'alignment.json'),
    };
  }

  private async writePrivateImmutable(path: string, bytes: Uint8Array): Promise<void> {
    try {
      const handle = await open(path, 'wx', 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.syncDirectory(dirname(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readFile(path);
      if (!Buffer.from(existing).equals(Buffer.from(bytes))) {
        throw new RunStoreError(
          'PRIVATE_RESPONSE_IMMUTABLE_MISMATCH',
          'Private response path already contains different bytes.',
        );
      }
    }
  }

  private applyQuota(current: RunQuota, mutation: CommitInput['quota']): RunQuota {
    const next = structuredClone(current);
    const delta = mutation?.newTakesDelta ?? 0;
    if (!Number.isSafeInteger(delta) || delta < 0)
      throw new RunStoreError('INVALID_QUOTA_DELTA', 'Quota delta is invalid.');
    if (next.newTakesUsed + delta > next.maxNewTakes) {
      throw new RunStoreError('QUOTA_EXHAUSTED', 'Recording dispatch would exceed maxNewTakes.');
    }
    if (mutation?.consumeGrantId) {
      if (next.replacementGrantIdsUsed.includes(mutation.consumeGrantId)) {
        throw new RunStoreError(
          'GRANT_REPLAYED',
          `Grant "${mutation.consumeGrantId}" was already consumed.`,
        );
      }
      next.replacementGrantIdsUsed.push(mutation.consumeGrantId);
    }
    next.newTakesUsed += delta;
    return next;
  }

  private checkpointFrom(state: RunCheckpointState, headReceiptSha256: string): RunCheckpoint {
    const unsigned = { ...state, headReceiptSha256 };
    return {
      ...unsigned,
      attestation: this.attest('run-checkpoint', unsigned as unknown as JsonValue),
    };
  }

  private attest(purpose: string, value: JsonValue): Attestation {
    const canonical = canonicalJson({ protocolVersion: PROTOCOL_VERSION, purpose, value });
    return {
      keyId: this.keyId,
      algorithm: 'HMAC-SHA256',
      value: createHmac('sha256', this.hmacKey).update(canonical).digest('hex'),
    };
  }

  private assertAttestation(purpose: string, value: JsonValue, attestation: Attestation): void {
    if (attestation.keyId !== this.keyId || attestation.algorithm !== 'HMAC-SHA256') {
      throw new RunStoreError(
        'RUN_ATTESTATION_INVALID',
        `${purpose} uses an unknown attestation key.`,
      );
    }
    const expected = this.attest(purpose, value).value;
    const actualBuffer = Buffer.from(attestation.value, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new RunStoreError('RUN_ATTESTATION_INVALID', `${purpose} attestation does not verify.`);
    }
  }

  private assertCheckpoint(checkpoint: RunCheckpoint): void {
    const { attestation, ...unsigned } = checkpoint;
    this.assertAttestation('run-checkpoint', unsigned as unknown as JsonValue, attestation);
    if (checkpoint.runId !== this.options.runId) {
      throw new RunStoreError('RUN_ID_MISMATCH', 'Checkpoint belongs to another Run.');
    }
  }

  private assertSameState(actual: RunCheckpoint, expected: RunCheckpoint): void {
    if (
      canonicalJson(actual as unknown as JsonValue) !==
      canonicalJson(expected as unknown as JsonValue)
    ) {
      throw new RunStoreError(
        'RUN_FORK_DETECTED',
        'Checkpoint state differs from its attested receipt.',
      );
    }
  }

  private verifyReceiptBytes(bytes: Uint8Array, path: string): Receipt {
    const parsed = receiptSchema.safeParse(parseJson<unknown>(bytes, path));
    if (!parsed.success) {
      throw new RunStoreError('RUN_INTEGRITY_ERROR', `${path} does not match the receipt schema.`);
    }
    const receipt = parsed.data as Receipt;
    const { attestation, ...unsigned } = receipt;
    this.assertAttestation('run-receipt', unsigned as unknown as JsonValue, attestation);
    if (receipt.runId !== this.options.runId) {
      throw new RunStoreError('RUN_ID_MISMATCH', `${path} belongs to another Run.`);
    }
    return receipt;
  }

  private async verifyReceiptChain(ledger: Ledger): Promise<Receipt> {
    let path: string | null = ledger.headReceiptPath;
    let expectedHash: string | null = ledger.headReceiptSha256;
    let expectedSequence = ledger.revision;
    let head: Receipt | null = null;

    while (path && expectedHash) {
      const bytes = await this.readSecure(path);
      if (sha256Bytes(bytes) !== expectedHash) {
        throw new RunStoreError(
          'RUN_RECEIPT_CHAIN_INVALID',
          `${path} does not match its chained SHA-256.`,
        );
      }
      const receipt = this.verifyReceiptBytes(bytes, path);
      if (receipt.sequence !== expectedSequence) {
        throw new RunStoreError(
          'RUN_RECEIPT_CHAIN_INVALID',
          `${path} has a non-monotonic sequence.`,
        );
      }
      head ??= receipt;
      path = receipt.previousReceiptPath;
      expectedHash = receipt.previousReceiptSha256;
      expectedSequence -= 1;
    }
    if (!head || expectedSequence !== 0 || path !== null || expectedHash !== null) {
      throw new RunStoreError(
        'RUN_RECEIPT_CHAIN_INVALID',
        'Receipt chain does not terminate at revision one.',
      );
    }
    return head;
  }

  private async recoverProjectionUnderLease(ledger: Ledger): Promise<Ledger> {
    const receipt = await this.verifyReceiptChain(ledger);
    const authoritative = this.checkpointFrom(receipt.state, ledger.headReceiptSha256);
    const current = await this.readPublicCheckpoint();

    if (current) {
      this.assertCheckpoint(current);
      if (
        current.revision === authoritative.revision &&
        current.headReceiptSha256 === authoritative.headReceiptSha256
      ) {
        this.assertSameState(current, authoritative);
        if (ledger.projectionPending) {
          const settled = { ...ledger, projectionPending: false };
          await this.writeLedger(settled);
          return settled;
        }
        return ledger;
      }
      if (current.revision >= authoritative.revision || !ledger.projectionPending) {
        throw new RunStoreError(
          'RUN_FORK_DETECTED',
          'Public checkpoint conflicts with private authority.',
        );
      }
    } else if (!ledger.projectionPending) {
      throw new RunStoreError('RUN_ROLLBACK_DETECTED', 'Completed public checkpoint is missing.');
    }

    await this.writeCheckpoint(authoritative);
    const settled = { ...ledger, projectionPending: false };
    await this.writeLedger(settled);
    return settled;
  }

  private async checkpointFromLedger(ledger: Ledger): Promise<RunCheckpoint> {
    const receipt = await this.verifyReceiptChain(ledger);
    return this.checkpointFrom(receipt.state, ledger.headReceiptSha256);
  }

  private async verifyBoundArtifacts(bindings: RunBindings): Promise<void> {
    for (const descriptor of this.collectArtifactDescriptors(bindings as unknown as JsonValue)) {
      const bytes = await this.readSecure(descriptor.path);
      if (sha256Bytes(bytes) !== descriptor.sha256) {
        throw new RunStoreError(
          'RUN_ARTIFACT_CHANGED',
          `${descriptor.path} no longer matches its descriptor.`,
        );
      }
    }
  }

  private collectArtifactDescriptors(value: JsonValue): ArtifactDescriptor[] {
    if (value === null || typeof value !== 'object') return [];
    if (Array.isArray(value))
      return value.flatMap((entry) => this.collectArtifactDescriptors(entry));
    const candidate = value as JsonObject;
    if (
      typeof candidate.kind === 'string' &&
      typeof candidate.path === 'string' &&
      typeof candidate.sha256 === 'string'
    ) {
      return [candidate as unknown as ArtifactDescriptor];
    }
    return Object.values(candidate).flatMap((entry) => this.collectArtifactDescriptors(entry));
  }

  private async createRunRoot(): Promise<void> {
    const parent = dirname(this.runRoot);
    const canonicalParent = await realpath(parent);
    const expected = resolve(canonicalParent, this.runRoot.slice(parent.length + 1));
    if (await this.fileExists(this.runRoot)) {
      throw new RunStoreError('RUN_ROOT_EXISTS', 'Run output root already exists.');
    }
    await mkdir(expected);
    this.canonicalRunRoot = await realpath(expected);
  }

  private async assertRunRoot(): Promise<void> {
    const stats = await lstat(this.runRoot).catch(() => null);
    if (!stats?.isDirectory() || stats.isSymbolicLink()) {
      throw new RunStoreError(
        'RUN_ROOT_INVALID',
        'Run root is missing or is a link/reparse point.',
      );
    }
    const canonical = await realpath(this.runRoot);
    if (this.canonicalRunRoot && canonical !== this.canonicalRunRoot) {
      throw new RunStoreError(
        'RUN_ROOT_CHANGED',
        'Run root resolved to a different canonical path.',
      );
    }
    this.canonicalRunRoot = canonical;
  }

  private async secureTarget(runRelativePath: string, createParents: boolean): Promise<string> {
    if (
      runRelativePath.length === 0 ||
      runRelativePath.includes('\\') ||
      runRelativePath.startsWith('/') ||
      runRelativePath.split('/').some((part) => part === '' || part === '.' || part === '..')
    ) {
      throw new RunStoreError('RUN_PATH_ESCAPE', `Invalid Run-relative path: ${runRelativePath}`);
    }
    await this.assertRunRoot();
    const target = resolve(this.runRoot, ...runRelativePath.split('/'));
    if (!pathInside(this.runRoot, target))
      throw new RunStoreError('RUN_PATH_ESCAPE', `${runRelativePath} escapes the Run.`);
    const parent = dirname(target);

    let current = this.runRoot;
    for (const segment of relative(this.runRoot, parent).split(sep).filter(Boolean)) {
      current = resolve(current, segment);
      let stats = await lstat(current).catch(() => null);
      if (!stats && createParents) {
        await mkdir(current);
        stats = await lstat(current);
      }
      if (!stats) throw new RunStoreError('RUN_ARTIFACT_MISSING', `${runRelativePath} is missing.`);
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new RunStoreError(
          'RUN_PATH_ESCAPE',
          `${runRelativePath} crosses a link/reparse point.`,
        );
      }
    }
    const canonicalParent = await realpath(parent);
    if (!pathInside(this.canonicalRunRoot as string, canonicalParent)) {
      throw new RunStoreError(
        'RUN_PATH_ESCAPE',
        `${runRelativePath} resolves outside the Run root.`,
      );
    }
    return target;
  }

  private async readSecure(path: string): Promise<Uint8Array> {
    const target = await this.secureTarget(path, false);
    const stats = await lstat(target).catch(() => null);
    if (!stats?.isFile() || stats.isSymbolicLink()) {
      throw new RunStoreError(
        'RUN_ARTIFACT_MISSING',
        `${path} is missing or is not a regular file.`,
      );
    }
    return readFile(target);
  }

  private async readOptionalSecure(path: string): Promise<Uint8Array | null> {
    try {
      return await this.readSecure(path);
    } catch (error) {
      if (error instanceof RunStoreError && error.code === 'RUN_ARTIFACT_MISSING') return null;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private async readPublicCheckpoint(): Promise<RunCheckpoint | null> {
    const bytes = await this.readOptionalSecure(RUN_PATHS.checkpoint);
    if (!bytes) return null;
    const parsed = checkpointSchema.safeParse(parseJson<unknown>(bytes, RUN_PATHS.checkpoint));
    if (!parsed.success) {
      throw new RunStoreError(
        'RUN_INTEGRITY_ERROR',
        'run.json does not match the checkpoint schema.',
      );
    }
    return parsed.data as RunCheckpoint;
  }

  private async writeCheckpoint(checkpoint: RunCheckpoint): Promise<void> {
    const target = await this.secureTarget(RUN_PATHS.checkpoint, true);
    await this.writeReplace(
      target,
      Buffer.from(canonicalJson(checkpoint as unknown as JsonValue), 'utf8'),
    );
  }

  private async readLedger(): Promise<Ledger> {
    const bytes = await readFile(this.ledgerPath()).catch(() => null);
    if (!bytes) throw new RunStoreError('RUN_LEDGER_MISSING', 'Private Run ledger is missing.');
    const parsed = ledgerSchema.safeParse(parseJson<unknown>(bytes, 'private Run ledger'));
    if (!parsed.success) {
      throw new RunStoreError(
        'RUN_INTEGRITY_ERROR',
        'Private Run ledger does not match its schema.',
      );
    }
    const ledger = parsed.data as Ledger;
    if (ledger.runId !== this.options.runId)
      throw new RunStoreError('RUN_ID_MISMATCH', 'Ledger belongs to another Run.');
    return ledger;
  }

  private async writeLedger(ledger: Ledger): Promise<void> {
    await mkdir(this.ledgerRoot, { recursive: true });
    await this.writeReplace(
      this.ledgerPath(),
      Buffer.from(canonicalJson(ledger as unknown as JsonValue), 'utf8'),
    );
  }

  private ledgerPath(): string {
    return resolve(this.ledgerRoot, `${sha256Bytes(this.options.runId)}.ledger.json`);
  }

  private lockPath(): string {
    return resolve(this.ledgerRoot, `${sha256Bytes(this.options.runId)}.lease`);
  }

  private async withLease<T>(work: () => Promise<T>): Promise<T> {
    await mkdir(this.ledgerRoot, { recursive: true });
    const started = Date.now();
    const token = randomUUID();
    const path = this.lockPath();

    while (true) {
      try {
        const handle = await open(path, 'wx');
        await handle.writeFile(
          JSON.stringify({
            token,
            processId: process.pid,
            expiresAt: new Date(Date.now() + this.leaseMs).toISOString(),
          }),
        );
        await handle.sync();
        await handle.close();
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (Date.now() - started >= this.lockTimeoutMs) {
          throw new RunStoreError('RUN_BUSY', 'Timed out waiting for the private per-Run lease.');
        }
        await this.breakExpiredLease(path);
        await delay(10);
      }
    }

    try {
      return await work();
    } finally {
      const current = await readFile(path, 'utf8').catch(() => '');
      if (current.includes(token)) await unlink(path).catch(() => undefined);
    }
  }

  private async breakExpiredLease(path: string): Promise<void> {
    const value = await readFile(path, 'utf8').catch(() => '');
    try {
      const parsed = JSON.parse(value) as { expiresAt?: string; processId?: number };
      if (
        parsed.expiresAt &&
        Date.parse(parsed.expiresAt) < Date.now() &&
        typeof parsed.processId === 'number' &&
        !this.processIsAlive(parsed.processId)
      ) {
        await rename(path, `${path}.expired-${randomUUID()}`).catch(() => undefined);
      }
    } catch {
      // An unreadable private lease is not safe to break; the bounded wait returns RUN_BUSY.
    }
  }

  private processIsAlive(processId: number): boolean {
    try {
      process.kill(processId, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== 'ESRCH';
    }
  }

  private async writePrivateTemporary(bytes: Uint8Array): Promise<string> {
    const temporaryRoot = resolve(this.ledgerRoot, 'tmp');
    await mkdir(temporaryRoot, { recursive: true });
    const path = resolve(temporaryRoot, randomUUID());
    const handle = await open(path, 'wx', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return path;
  }

  private async writeReplace(target: string, bytes: Uint8Array): Promise<void> {
    const temporary = await this.writePrivateTemporary(bytes);
    try {
      await rename(temporary, target);
      await this.syncDirectory(dirname(target));
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  private async syncDirectory(path: string): Promise<void> {
    const handle = await open(path, constants.O_RDONLY).catch(() => null);
    if (!handle) return;
    try {
      await handle.sync().catch(() => undefined);
    } finally {
      await handle.close();
    }
  }

  private isoNow(): string {
    const value = this.now();
    if (Number.isNaN(value.getTime()))
      throw new RunStoreError('CLOCK_INVALID', 'Clock returned an invalid Date.');
    return value.toISOString();
  }

  private async fileExists(path: string): Promise<boolean> {
    return (await lstat(path).catch(() => null)) !== null;
  }
}
