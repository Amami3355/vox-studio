import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type AssetRequirement,
  type CompileReport,
  type CompileResult,
  type CompiledDocument,
  type LocalAssetEntry,
  PLACEHOLDER_ASSET_URI,
  type VideoPlan,
  assetRequirementId,
  assetRequirementSchema,
  compile,
  compileReportSchema,
  compiledDocumentSchema,
  createAssetResolver,
  repositoryAssetLibrary,
  validateVideoPlan,
  videoPlanSchema,
} from '@vox/video';
import {
  type Alignment,
  type RunTakeArtifacts,
  type RunTakeManifest,
  type SynthesisAdapter,
  type TimedBeatFold,
  createRunTake,
  foldRunTake,
  requestSynthesis,
  verifyRunTake,
  verifyTimedBeatFold,
} from '@vox/voice';
import { ZodError } from 'zod';
import { type JsonValue, canonicalJson, hashCanonicalJson, sha256Bytes } from '../canonical-json';
import {
  type CommandId,
  type Decline,
  type ImageAcceptance,
  type ImageGenerationGrant,
  type ImageGenerationRequest,
  type ImageJob,
  type ImageRejection,
  PROTOCOL_VERSION,
  type ProductionRequest,
  type ReplacementGrant,
  type ResultEnvelope,
  type RunStage,
  declineSchema,
  imageAcceptanceSchema,
  imageGenerationGrantSchema,
  imageGenerationRequestSchema,
  imageRejectionSchema,
  productionRequestSchema,
  replacementGrantSchema,
  resultEnvelopeSchema,
} from '../contracts/schemas';
import {
  type DurationCalibrationState,
  type DurationCalibrationStore,
  activeInitialCalibration,
} from '../preflight/calibration';
import { buildPreflightReport } from '../preflight/preflight';
import { assetResolutionView, verifyServiceReadableAssets } from '../render/assets';
import { type RenderAdapter, assertMp4 } from '../render/remotion';
import {
  acceptedAssetSetIdentity,
  beatShapeIdentity,
  compileInputIdentity,
  imageGenerationRequestIdentity,
  imageJobIdOf,
  planIdentity,
  preflightInputIdentity,
  recordingInputIdentity,
  renderInputIdentity,
  validationInputIdentity,
} from '../run-store/identities';
import { RUN_PATHS } from '../run-store/paths';
import {
  type AssetResolution,
  type RunBindings,
  type RunCheckpoint,
  RunStore,
  RunStoreError,
  type RunStoreExclusiveSession,
} from '../run-store/run-store';

export type CommandExecution = { envelope: ResultEnvelope; exitCode: 0 | 1 | 2 };

export type NetworkAdapter = {
  request: (...args: never[]) => Promise<never>;
};

export type ImageGenerationAdapter = {
  mode: 'recorded' | 'live';
  generate: (request: {
    prompt: string;
    aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
    outputMimeType: 'image/png';
    seed: number;
  }) => Promise<{ bytes: Uint8Array; mediaType: 'image/png' }>;
};

export class ImageDispatchUncertain extends Error {
  constructor(message = 'The image provider dispatch outcome is uncertain.') {
    super(message);
    this.name = 'ImageDispatchUncertain';
  }
}

export type ProductionCommandServiceOptions = {
  ledgerRoot: string;
  hmacKey: string | Uint8Array;
  keyId: string;
  calibrationStore?: DurationCalibrationStore;
  network: NetworkAdapter;
  compiler?: (input: Parameters<typeof compile>[0]) => CompileResult;
  renderer?: RenderAdapter;
  compilerVersion?: string;
  rendererVersion?: string;
  synthesizer?: SynthesisAdapter;
  verifyReplacementGrant?: (grant: ReplacementGrant) => boolean | Promise<boolean>;
  imageGenerator?: ImageGenerationAdapter;
  verifyImageGrant?: (grant: ImageGenerationGrant) => boolean | Promise<boolean>;
  recordingCrashAt?: (point: 'after_dispatch' | 'after_response_received') => void;
  now?: () => Date;
  createRunId?: () => string;
};

const stageRank: Record<RunStage, number> = {
  initialized: 0,
  validated: 1,
  preflighted: 2,
  recorded: 3,
  compiled: 4,
  rendered: 5,
  declined: 6,
};

const fresh = { state: 'fresh' as const, reasons: [] as string[] };
const stale = (reason: string) => ({ state: 'stale' as const, reasons: [reason] });

const reportBytes = (report: unknown): string => canonicalJson(report as JsonValue);

export class ProductionCommandService {
  private readonly createRunId: () => string;
  private readonly calibrationStore?: DurationCalibrationStore;
  private readonly compiler: (input: Parameters<typeof compile>[0]) => CompileResult;
  private readonly now: () => Date;

  constructor(private readonly options: ProductionCommandServiceOptions) {
    this.createRunId = options.createRunId ?? randomUUID;
    this.calibrationStore = options.calibrationStore;
    this.compiler = options.compiler ?? compile;
    this.now = options.now ?? (() => new Date());
  }

  async init(input: { requestPath: string; out: string }): Promise<CommandExecution> {
    return this.execute('run.init', null, async () => {
      const request = productionRequestSchema.parse(await this.readJson(input.requestPath));
      const runId = this.createRunId();
      const store = this.store(input.out, runId);
      const checkpoint = await store.initialize(request);
      return this.success(
        'run.init',
        checkpoint,
        { created: true },
        [checkpoint.request.artifact],
        [
          {
            command: 'run.validate',
            args: ['--run', '.', '--plan', '<plan.json>'],
            reason: 'Run initialized.',
          },
        ],
      );
    });
  }

  async status(input: { runRoot: string }): Promise<CommandExecution> {
    return this.execute('run.status', input.runRoot, async (store) => {
      const checkpoint = await store.inspect();
      const artifacts = [
        checkpoint.request.artifact,
        ...store.artifactDescriptors(checkpoint.bindings),
      ];
      const staleStages = Object.entries(checkpoint.bindings)
        .filter(
          ([, binding]) =>
            binding !== null && 'freshness' in binding && binding.freshness.state === 'stale',
        )
        .map(([name]) => this.stageForBinding(name));
      return this.success(
        'run.status',
        checkpoint,
        { staleStages: [...new Set(staleStages)], lastOutcome: checkpoint.lastOutcome, artifacts },
        [],
        [],
      );
    });
  }

  async imageStart(input: {
    runRoot: string;
    request: unknown;
    authorization?: unknown;
  }): Promise<CommandExecution> {
    return this.execute('run.image.start', input.runRoot, async (store) => {
      const request = imageGenerationRequestSchema.parse(input.request);
      let checkpoint = await store.inspect();
      this.assertNonTerminal(checkpoint);
      const requirement = await this.requireImageWorkItem(store, checkpoint, request);
      const providerRequest = {
        prompt: request.prompt,
        aspectRatio: request.aspectRatio,
        outputMimeType: request.outputMimeType,
        seed: request.seed,
      } as const;
      if (imageGenerationRequestIdentity(providerRequest) !== request.requestSha256) {
        throw new RunStoreError(
          'IMAGE_REQUEST_DIGEST_MISMATCH',
          'The image generation request does not match its digest.',
        );
      }

      const existing = checkpoint.bindings.images.jobs.find(
        (job) => job.identityKey === request.identityKey,
      );
      if (existing) {
        return this.success(
          'run.image.start',
          checkpoint,
          { disposition: 'reused', providerMode: existing.providerMode, job: existing },
          existing.candidate ? [existing.candidate.artifact] : [],
          [],
        );
      }

      const generator = this.imageGenerator();
      if (generator.mode === 'live') {
        if (input.authorization === undefined) {
          const next = await store.commit({
            expectedRevision: checkpoint.revision,
            command: 'run.image.start',
            outcome: 'paused',
            data: { reason: 'IMAGE_AUTHORIZATION_REQUIRED' },
            next: [
              {
                command: 'run.image.start',
                args: [
                  '--run',
                  '.',
                  '--request',
                  '<image-request.json>',
                  '--authorisation',
                  '<grant.json>',
                ],
                reason: 'A live image call requires an explicit request-bound grant.',
              },
            ],
          });
          return this.success(
            'run.image.start',
            next,
            { reason: 'IMAGE_AUTHORIZATION_REQUIRED' },
            [],
            next.bindings.images.jobs.length === 0
              ? [
                  {
                    command: 'run.image.start',
                    args: [
                      '--run',
                      '.',
                      '--request',
                      '<image-request.json>',
                      '--authorisation',
                      '<grant.json>',
                    ],
                    reason: 'A live image call requires an explicit request-bound grant.',
                  },
                ]
              : [],
            'paused',
          );
        }
        const grant = imageGenerationGrantSchema.parse(input.authorization);
        await this.requireImageGrant(grant, checkpoint, request);
      } else if (input.authorization !== undefined) {
        throw new RunStoreError(
          'IMAGE_AUTHORIZATION_NOT_APPLICABLE',
          'Recorded image generation does not consume a live authorization grant.',
        );
      }

      const job: ImageJob = {
        schemaVersion: 1,
        id: imageJobIdOf(request.identityKey, request.requestSha256),
        requirementId: request.requirementId,
        identityKey: request.identityKey,
        requestSha256: request.requestSha256,
        providerMode: generator.mode,
        status: 'dispatching',
        candidate: null,
        failure: null,
      };
      const consumedGrantId =
        generator.mode === 'live'
          ? imageGenerationGrantSchema.parse(input.authorization).grantId
          : null;
      checkpoint = await store.commit({
        expectedRevision: checkpoint.revision,
        command: 'run.image.start',
        outcome: 'succeeded',
        bindings: {
          ...checkpoint.bindings,
          images: {
            jobs: [...checkpoint.bindings.images.jobs, job],
            consumedGrantIds: consumedGrantId
              ? [...checkpoint.bindings.images.consumedGrantIds, consumedGrantId]
              : checkpoint.bindings.images.consumedGrantIds,
          },
        },
        data: { disposition: 'created', providerMode: generator.mode, job },
        next: [
          {
            command: 'run.image.status',
            args: ['--run', '.', '--job', job.id],
            reason: 'Observe this job; never start a replacement implicitly.',
          },
        ],
      });

      try {
        const generated = await generator.generate(providerRequest);
        const { width, height } = this.assertGeneratedPng(generated.bytes, generated.mediaType);
        const candidateSha256 = sha256Bytes(generated.bytes);
        const candidatePath = RUN_PATHS.generatedImageCandidate(job.id, candidateSha256);
        const current = await store.inspect();
        const currentJob = this.requireImageJob(current, job.id);
        if (currentJob.status !== 'dispatching') {
          return this.success(
            'run.image.start',
            current,
            { disposition: 'reused', providerMode: generator.mode, job: currentJob },
            currentJob.candidate ? [currentJob.candidate.artifact] : [],
            [],
          );
        }
        const next = await store.commit({
          expectedRevision: current.revision,
          command: 'run.image.start',
          outcome: 'succeeded',
          artifacts: [
            {
              kind: 'generated_image_candidate',
              path: candidatePath,
              bytes: generated.bytes,
            },
          ],
          bindings: ([artifact]) => {
            if (!artifact) throw new Error('The generated image candidate was not published.');
            const candidate = {
              id: `image-candidate-${candidateSha256.slice(0, 20)}`,
              requirementId: request.requirementId,
              identityKey: request.identityKey,
              promptSha256: createHash('sha256').update(request.prompt).digest('hex'),
              artifact,
              width,
              height,
            };
            return this.replaceImageJob(current.bindings, job.id, {
              ...currentJob,
              status: 'candidate',
              candidate,
              failure: null,
            });
          },
          data: null,
          next: [],
        });
        const completed = this.requireImageJob(next, job.id);
        return this.success(
          'run.image.start',
          next,
          { disposition: 'created', providerMode: generator.mode, job: completed },
          completed.candidate ? [completed.candidate.artifact] : [],
          [
            {
              command: 'run.image.accept',
              args: ['--run', '.', '--decision', '<acceptance.json>'],
              reason: 'Inspect the candidate and bind an explicit decision to its digest.',
            },
          ],
        );
      } catch (error) {
        const current = await store.inspect();
        const currentJob = this.requireImageJob(current, job.id);
        const uncertain = error instanceof ImageDispatchUncertain;
        const ended: ImageJob = {
          ...currentJob,
          status: uncertain ? 'uncertain' : 'failed',
          candidate: null,
          failure: uncertain
            ? 'Image dispatch outcome is uncertain; observe this job before any replacement.'
            : 'Image generation did not produce a valid candidate.',
        };
        const next = await store.commit({
          expectedRevision: current.revision,
          command: 'run.image.start',
          outcome: 'succeeded',
          bindings: this.replaceImageJob(
            this.staleAssetConsumers(
              current.bindings,
              uncertain ? null : 'ASSET_GENERATION_FAILED',
            ),
            job.id,
            ended,
          ),
          data: { disposition: 'created', providerMode: generator.mode, job: ended },
        });
        return this.success(
          'run.image.start',
          next,
          { disposition: 'created', providerMode: generator.mode, job: ended },
          [],
          [],
        );
      }
    });
  }

  async imageStatus(input: { runRoot: string; jobId: string }): Promise<CommandExecution> {
    return this.execute('run.image.status', input.runRoot, async (store) => {
      const checkpoint = await store.inspect();
      const job = this.requireImageJob(checkpoint, input.jobId);
      return this.success(
        'run.image.status',
        checkpoint,
        { job },
        job.candidate ? [job.candidate.artifact] : [],
        [],
      );
    });
  }

  async imageAccept(input: { runRoot: string; decision: unknown }): Promise<CommandExecution> {
    return this.execute('run.image.accept', input.runRoot, async (store) => {
      const decision = imageAcceptanceSchema.parse(input.decision);
      const checkpoint = await store.inspect();
      this.assertNonTerminal(checkpoint);
      const job = this.requireImageJob(checkpoint, decision.jobId);
      if (job.status !== 'candidate' || job.candidate === null) {
        throw new RunStoreError(
          'IMAGE_CANDIDATE_REQUIRED',
          'Only an inspectable image candidate can be accepted.',
        );
      }
      if (job.candidate.artifact.sha256 !== decision.candidateSha256) {
        throw new RunStoreError(
          'IMAGE_DIGEST_MISMATCH',
          'Image acceptance must bind the candidate exact digest.',
        );
      }
      await store.readArtifact(job.candidate.artifact);
      const accepted: ImageJob = { ...job, status: 'accepted' };
      const next = await store.commit({
        expectedRevision: checkpoint.revision,
        command: 'run.image.accept',
        outcome: 'succeeded',
        bindings: this.replaceImageJob(
          this.staleAssetConsumers(checkpoint.bindings, 'ASSET_SET_CHANGED'),
          job.id,
          accepted,
        ),
        data: { job: accepted },
        next: [
          {
            command: 'run.compile',
            args: ['--run', '.'],
            reason: 'Recompile to bind the accepted image bytes.',
          },
        ],
      });
      return this.success(
        'run.image.accept',
        next,
        { job: accepted },
        [job.candidate.artifact],
        [
          {
            command: 'run.compile',
            args: ['--run', '.'],
            reason: 'Recompile to bind the accepted image bytes.',
          },
        ],
      );
    });
  }

  async imageReject(input: { runRoot: string; decision: unknown }): Promise<CommandExecution> {
    return this.execute('run.image.reject', input.runRoot, async (store) => {
      const decision = imageRejectionSchema.parse(input.decision);
      const checkpoint = await store.inspect();
      this.assertNonTerminal(checkpoint);
      const job = this.requireImageJob(checkpoint, decision.jobId);
      if (job.status !== 'candidate' || job.candidate === null) {
        throw new RunStoreError(
          'IMAGE_CANDIDATE_REQUIRED',
          'Only an inspectable image candidate can be rejected.',
        );
      }
      const rejected: ImageJob = { ...job, status: 'rejected' };
      const next = await store.commit({
        expectedRevision: checkpoint.revision,
        command: 'run.image.reject',
        outcome: 'succeeded',
        bindings: this.replaceImageJob(checkpoint.bindings, job.id, rejected),
        data: { job: rejected },
      });
      return this.success(
        'run.image.reject',
        next,
        { job: rejected },
        [job.candidate.artifact],
        [],
      );
    });
  }

  async decline(input: { runRoot: string; decisionPath: string }): Promise<CommandExecution> {
    return this.execute('run.decline', input.runRoot, async (store) => {
      const checkpoint = await store.inspect();
      this.assertNonTerminal(checkpoint);
      if (checkpoint.bindings.take !== null) {
        throw new RunStoreError(
          'DECLINE_AFTER_TAKE',
          'A Run cannot decline after recording or reusing a Take.',
        );
      }
      const decision = declineSchema.parse(await this.readJson(input.decisionPath));
      const next = await store.commit({
        expectedRevision: checkpoint.revision,
        command: 'run.decline',
        outcome: 'declined',
        stage: 'declined',
        terminal: decision as JsonValue,
        data: decision as unknown as Record<string, JsonValue>,
      });
      return this.success('run.decline', next, decision, [], [], 'declined');
    });
  }

  async validate(input: { runRoot: string; planPath: string }): Promise<CommandExecution> {
    return this.execute('run.validate', input.runRoot, async (store) => {
      const checkpoint = await store.inspect();
      this.assertNonTerminal(checkpoint);
      const raw = await this.readJson(input.planPath);
      const planSha256 = hashCanonicalJson('plan', raw as JsonValue);
      const report = validateVideoPlan(raw as VideoPlan);
      const validationInputSha256 = validationInputIdentity({
        planSha256,
        catalogManifestVersion: 4,
        videoPlanContractVersion: 1,
      });

      if (!report.ok) {
        const path = RUN_PATHS.validationReport(validationInputSha256);
        const next = await store.commit({
          expectedRevision: checkpoint.revision,
          command: 'run.validate',
          outcome: 'needs_repair',
          artifacts: [{ kind: 'validation_report', path, bytes: reportBytes(report) }],
          data: { report: this.summary(report) },
          next: [
            {
              command: 'run.validate',
              args: ['--run', '.', '--plan', input.planPath],
              reason: 'Repair the reported plan errors and validate again.',
            },
          ],
        });
        return this.success(
          'run.validate',
          next,
          { report: this.summary(report) },
          [{ kind: 'validation_report', path, sha256: sha256Bytes(reportBytes(report)) }],
          [
            {
              command: 'run.validate',
              args: ['--run', '.', '--plan', input.planPath],
              reason: 'Repair the reported plan errors and validate again.',
            },
          ],
          'needs_repair',
        );
      }

      const plan = videoPlanSchema.parse(raw);
      const semanticPlanSha256 = planIdentity(plan);
      const planPath = RUN_PATHS.plan(semanticPlanSha256);
      const reportPath = RUN_PATHS.validationReport(validationInputSha256);
      const request = await this.requestOf(store, checkpoint);
      const previous = checkpoint.bindings;
      const recordingInputSha256 = recordingInputIdentity(plan, request);
      const beatShapeSha256 = beatShapeIdentity(plan);

      const next = await store.commit({
        expectedRevision: checkpoint.revision,
        command: 'run.validate',
        outcome: 'succeeded',
        stage: this.sameFreshPlan(previous, semanticPlanSha256) ? checkpoint.stage : 'validated',
        artifacts: [
          { kind: 'plan_snapshot', path: planPath, bytes: canonicalJson(plan as JsonValue) },
          { kind: 'validation_report', path: reportPath, bytes: reportBytes(report) },
        ],
        bindings: ([snapshot, validationReport]) => {
          if (!snapshot || !validationReport)
            throw new Error('Validation artifacts were not published.');
          return this.bindValidatedPlan(
            previous,
            semanticPlanSha256,
            validationInputSha256,
            recordingInputSha256,
            beatShapeSha256,
            snapshot,
            validationReport,
          );
        },
        data: { report: this.summary(report) },
        next: [
          { command: 'run.preflight', args: ['--run', '.'], reason: 'Plan validation is green.' },
        ],
      });
      return this.success(
        'run.validate',
        next,
        { report: this.summary(report) },
        store
          .artifactDescriptors(next.bindings)
          .filter((artifact) => [planPath, reportPath].includes(artifact.path)),
        [{ command: 'run.preflight', args: ['--run', '.'], reason: 'Plan validation is green.' }],
      );
    });
  }

  async preflight(input: { runRoot: string }): Promise<CommandExecution> {
    return this.execute('run.preflight', input.runRoot, async (store) => {
      const checkpoint = await store.inspect();
      this.assertNonTerminal(checkpoint);
      const planBinding = checkpoint.bindings.plan;
      const validation = checkpoint.bindings.validation;
      if (!planBinding || !validation || validation.freshness.state !== 'fresh') {
        throw new RunStoreError(
          'PREFLIGHT_REQUIRES_VALIDATION',
          'Preflight requires a fresh green validation.',
        );
      }
      const plan = videoPlanSchema.parse(
        JSON.parse(Buffer.from(await store.readArtifact(planBinding.snapshot)).toString('utf8')),
      );
      const request = await this.requestOf(store, checkpoint);
      const calibration = await this.calibrationState();
      const report = buildPreflightReport(plan, calibration, {
        calibrationKey: { ...request.production.voice, language: 'en' },
      });
      const preflightInputSha256 = preflightInputIdentity({
        planSha256: planBinding.planSha256,
        validationInputSha256: validation.validationInputSha256,
        calibrationVersion:
          calibration.status === 'missing' ? null : calibration.calibration.calibrationVersion,
      });
      const path = RUN_PATHS.preflightReport(preflightInputSha256);
      const previous = checkpoint.bindings;
      const next = await store.commit({
        expectedRevision: checkpoint.revision,
        command: 'run.preflight',
        outcome: 'succeeded',
        stage:
          stageRank[checkpoint.stage] > stageRank.preflighted ? checkpoint.stage : 'preflighted',
        artifacts: [{ kind: 'preflight_report', path, bytes: reportBytes(report) }],
        bindings: ([artifact]) => {
          if (!artifact) throw new Error('Preflight report was not published.');
          return {
            ...previous,
            preflight: {
              preflightInputSha256,
              planSha256: planBinding.planSha256,
              report: artifact,
              freshness: structuredClone(fresh),
            },
          };
        },
        data: { report: report as unknown as JsonValue },
        next: [
          {
            command: 'run.record',
            args: ['--run', '.'],
            reason: 'Preflight is complete and advisory.',
          },
        ],
      });
      return this.success(
        'run.preflight',
        next,
        { report },
        [next.bindings.preflight!.report],
        [
          {
            command: 'run.record',
            args: ['--run', '.'],
            reason: 'Preflight is complete and advisory.',
          },
        ],
      );
    });
  }

  async record(input: {
    runRoot: string;
    replacementAuthorisationPath?: string;
  }): Promise<CommandExecution> {
    return this.execute('run.record', input.runRoot, async (store) =>
      store.exclusive(async (session) => {
        const checkpoint = await session.inspect();
        this.assertNonTerminal(checkpoint);
        const { planBinding, validation, preflight } = this.requireRecordBindings(checkpoint);
        const plan = videoPlanSchema.parse(
          this.parseArtifact(await store.readArtifact(planBinding.snapshot)),
        );
        const request = await this.requestOf(store, checkpoint);
        await this.verifyCompilePrerequisiteReports(
          store,
          { planBinding, validation, preflight },
          plan,
          request,
        );
        const recordingInputSha256 = recordingInputIdentity(plan, request);

        let reusable:
          | {
              manifest: RunTakeManifest;
              artifacts: RunTakeArtifacts;
              currentFold: TimedBeatFold;
            }
          | undefined;
        for (const candidate of await session.historicalTakeBindings()) {
          if (candidate.recordingInputSha256 !== recordingInputSha256) continue;
          reusable = await this.verifyHistoricalTake(store, candidate, plan, request);
          break;
        }
        if (reusable && !input.replacementAuthorisationPath) {
          return this.publishTakeSelection({
            session,
            checkpoint,
            plan,
            manifest: reusable.manifest,
            artifacts: reusable.artifacts,
            fold: reusable.currentFold,
            disposition: 'reused',
          });
        }

        const attempts = await session.recordingAttempts(recordingInputSha256);
        const recoverable = [...attempts]
          .reverse()
          .find((attempt) => attempt.status === 'response_received');
        if (recoverable) {
          const response = await session.readRecordingResponse(recoverable.attemptId);
          return this.finishProviderResponse({
            session,
            checkpoint,
            plan,
            request,
            attemptId: recoverable.attemptId,
            replacement: recoverable.replacement,
            response: { audio: response.audio, alignment: response.alignment as Alignment },
          });
        }

        const incomplete = [...attempts]
          .reverse()
          .find((attempt) => attempt.status === 'dispatching');
        if (incomplete) {
          await session.markRecordingAttempt(incomplete.attemptId, 'uncertain');
          return this.pauseRecording(
            session,
            checkpoint,
            'The previous provider dispatch has no complete durable response. A replacement grant is required; no automatic retry was attempted.',
          );
        }

        const replacement = attempts.length > 0 || reusable !== undefined;
        let grant: ReplacementGrant | undefined;
        if (replacement) {
          if (!input.replacementAuthorisationPath) {
            return this.pauseRecording(
              session,
              checkpoint,
              'A later dispatch for this Recording input requires a replacement grant.',
            );
          }
          grant = await this.readAndVerifyReplacementGrant(
            input.replacementAuthorisationPath,
            checkpoint,
            recordingInputSha256,
          );
        }
        if (checkpoint.quota.newTakesUsed >= checkpoint.quota.maxNewTakes) {
          return this.pauseRecording(
            session,
            checkpoint,
            'The Run has no remaining recording budget.',
          );
        }
        if (!this.options.synthesizer) {
          throw new RunStoreError(
            'SYNTHESIS_PROVIDER_NOT_CONFIGURED',
            'Production synthesis provider is unavailable.',
          );
        }

        const attempt = await session.beginRecordingDispatch({
          expectedRevision: checkpoint.revision,
          recordingInputSha256,
          replacement,
          grantId: grant?.grantId,
        });
        this.options.recordingCrashAt?.('after_dispatch');

        let response: { audio: Uint8Array; alignment: Alignment };
        try {
          response = await requestSynthesis(
            plan.beats,
            request.production.voice,
            this.options.synthesizer,
          );
        } catch (error) {
          await session.markRecordingAttempt(attempt.attemptId, 'failed');
          return this.failRecording(
            session,
            checkpoint,
            'SYNTHESIS_PROVIDER_FAILED',
            error instanceof Error ? error.message : String(error),
          );
        }

        try {
          await session.persistRecordingResponse(attempt.attemptId, {
            audio: response.audio,
            alignment: response.alignment as unknown as JsonValue,
          });
        } catch (error) {
          await session.markRecordingAttempt(attempt.attemptId, 'failed');
          return this.failRecording(
            session,
            checkpoint,
            'SYNTHESIS_RESPONSE_PERSISTENCE_FAILED',
            error instanceof Error ? error.message : String(error),
          );
        }
        this.options.recordingCrashAt?.('after_response_received');
        return this.finishProviderResponse({
          session,
          checkpoint,
          plan,
          request,
          attemptId: attempt.attemptId,
          replacement,
          response,
        });
      }),
    );
  }

  async compile(input: { runRoot: string }): Promise<CommandExecution> {
    return this.execute('run.compile', input.runRoot, async (store) => {
      const checkpoint = await store.inspect();
      this.assertNonTerminal(checkpoint);
      const { planBinding, validation, preflight, take } = this.requireCompileBindings(checkpoint);
      const plan = videoPlanSchema.parse(
        this.parseArtifact(await store.readArtifact(planBinding.snapshot)),
      );
      const request = await this.requestOf(store, checkpoint);
      const verifiedTake = await this.verifyTakeBinding(store, take, plan, request);
      await this.verifyCompilePrerequisiteReports(
        store,
        { planBinding, validation, preflight },
        plan,
        request,
      );
      const compileInputSha256 = compileInputIdentity({
        planSha256: planBinding.planSha256,
        validationInputSha256: validation.validationInputSha256,
        preflightInputSha256: preflight.preflightInputSha256,
        takeSha256: take.takeSha256,
        beatShapeSha256: take.beatShapeSha256,
        compilerVersion: this.options.compilerVersion ?? '1',
        catalogManifestVersion: 4,
        acceptedAssetSetSha256: acceptedAssetSetIdentity(checkpoint.bindings.images.jobs),
      });
      const previous = checkpoint.bindings;
      const existing = previous.compilation;

      if (
        existing?.freshness.state === 'fresh' &&
        existing.compileInputSha256 === compileInputSha256
      ) {
        const documentBytes = await store.readArtifact(existing.document);
        const existingReportBytes = await store.readArtifact(existing.report);
        const document = compiledDocumentSchema.parse(this.parseArtifact(documentBytes));
        const report = compileReportSchema.parse(this.parseArtifact(existingReportBytes));
        if (!report.ok) {
          throw new RunStoreError(
            'COMPILE_REUSE_NOT_GREEN',
            'The reusable compilation report is not green.',
          );
        }
        if (
          canonicalJson(assetResolutionView(document) as unknown as JsonValue) !==
          canonicalJson(existing.assetResolutions as unknown as JsonValue)
        ) {
          throw new RunStoreError(
            'ASSET_RESOLUTION_VIEW_CHANGED',
            'Reusable compilation asset-resolution view does not match its binding.',
          );
        }
        const artifacts = [existing.document, existing.report];
        const assetWorklist = this.assetWorklist(existing.assetResolutions);
        const nextActions = [
          { command: 'run.render' as const, args: ['--run', '.'], reason: 'Compilation is green.' },
        ];
        const next = await store.commit({
          expectedRevision: checkpoint.revision,
          command: 'run.compile',
          outcome: 'succeeded',
          stage: checkpoint.stage,
          artifacts: [
            { kind: existing.document.kind, path: existing.document.path, bytes: documentBytes },
            { kind: existing.report.kind, path: existing.report.path, bytes: existingReportBytes },
          ],
          bindings: previous,
          data: { report: this.summary(report), assetWorklist },
          next: nextActions,
        });
        return this.success(
          'run.compile',
          next,
          { report: this.summary(report), assetWorklist },
          artifacts,
          nextActions,
        );
      }

      const resolver = await this.projectAssetResolver(store, checkpoint, plan);
      const result = this.compiler({
        plan,
        beats: verifiedTake.fold.timedBeats,
        audio: { voiceover: 'voiceover.mp3' },
        resolver,
      });
      compileReportSchema.parse(result.report);
      const reportPath = RUN_PATHS.compileReport(compileInputSha256);
      if (!result.ok) {
        const bytes = reportBytes(result.report);
        const artifacts = [
          { kind: 'compile_report', path: reportPath, sha256: sha256Bytes(bytes) },
        ];
        const nextActions = [
          {
            command: 'run.validate' as const,
            args: ['--run', '.', '--plan', '<plan.json>'],
            reason:
              'Repair the authoritative compile errors while preserving the Take when possible.',
          },
        ];
        const next = await store.commit({
          expectedRevision: checkpoint.revision,
          command: 'run.compile',
          outcome: 'needs_repair',
          stage: checkpoint.stage,
          artifacts: [{ kind: 'compile_report', path: reportPath, bytes }],
          data: { report: this.summary(result.report), assetWorklist: [] },
          next: nextActions,
        });
        return this.success(
          'run.compile',
          next,
          { report: this.summary(result.report), assetWorklist: [] },
          artifacts,
          nextActions,
          'needs_repair',
        );
      }

      const documentPath = RUN_PATHS.compiledDocument(compileInputSha256);
      const documentBytes = canonicalJson(result.document as unknown as JsonValue);
      const compileReportBytes = reportBytes(result.report);
      const resolutions = assetResolutionView(result.document);
      const assetWorklist = this.assetWorklist(resolutions);
      const nextActions = [
        { command: 'run.render' as const, args: ['--run', '.'], reason: 'Compilation is green.' },
      ];
      const next = await store.commit({
        expectedRevision: checkpoint.revision,
        command: 'run.compile',
        outcome: 'succeeded',
        stage: 'compiled',
        artifacts: [
          { kind: 'compiled_document', path: documentPath, bytes: documentBytes },
          { kind: 'compile_report', path: reportPath, bytes: compileReportBytes },
        ],
        bindings: ([document, report]) => {
          if (!document || !report) throw new Error('Compilation artifacts were not published.');
          return {
            ...previous,
            compilation: {
              compileInputSha256,
              planSha256: planBinding.planSha256,
              takeSha256: take.takeSha256,
              document,
              report,
              assetResolutions: resolutions,
              freshness: structuredClone(fresh),
            },
            render: previous.render
              ? { ...previous.render, freshness: stale('COMPILATION_CHANGED') }
              : null,
          };
        },
        data: { report: this.summary(result.report), assetWorklist },
        next: nextActions,
      });
      return this.success(
        'run.compile',
        next,
        { report: this.summary(result.report), assetWorklist },
        [next.bindings.compilation!.document, next.bindings.compilation!.report],
        nextActions,
      );
    });
  }

  async render(input: { runRoot: string }): Promise<CommandExecution> {
    return this.execute('run.render', input.runRoot, async (store) => {
      const checkpoint = await store.inspect();
      this.assertNonTerminal(checkpoint);
      const { planBinding, validation, preflight, take, compilation } =
        this.requireRenderBindings(checkpoint);
      const plan = videoPlanSchema.parse(
        this.parseArtifact(await store.readArtifact(planBinding.snapshot)),
      );
      const request = await this.requestOf(store, checkpoint);
      const verifiedTake = await this.verifyTakeBinding(store, take, plan, request);
      await this.verifyCompilePrerequisiteReports(
        store,
        { planBinding, validation, preflight },
        plan,
        request,
      );
      const expectedCompileInputSha256 = compileInputIdentity({
        planSha256: planBinding.planSha256,
        validationInputSha256: validation.validationInputSha256,
        preflightInputSha256: preflight.preflightInputSha256,
        takeSha256: take.takeSha256,
        beatShapeSha256: take.beatShapeSha256,
        compilerVersion: this.options.compilerVersion ?? '1',
        catalogManifestVersion: 4,
        acceptedAssetSetSha256: acceptedAssetSetIdentity(checkpoint.bindings.images.jobs),
      });
      if (compilation.compileInputSha256 !== expectedCompileInputSha256) {
        throw new RunStoreError(
          'COMPILE_INPUT_BINDING_MISMATCH',
          'Compilation is not bound to the complete current compile input.',
        );
      }
      const documentBytes = await store.readArtifact(compilation.document);
      const compileReportBytes = await store.readArtifact(compilation.report);
      const document = compiledDocumentSchema.parse(this.parseArtifact(documentBytes));
      const report = compileReportSchema.parse(this.parseArtifact(compileReportBytes));
      if (!report.ok) {
        throw new RunStoreError(
          'RENDER_REQUIRES_GREEN_COMPILE',
          'Bound compile report is not green.',
        );
      }
      const resolutions = assetResolutionView(document);
      if (
        canonicalJson(resolutions as unknown as JsonValue) !==
        canonicalJson(compilation.assetResolutions as unknown as JsonValue)
      ) {
        throw new RunStoreError(
          'ASSET_RESOLUTION_VIEW_CHANGED',
          'Compiled asset-resolution view does not match its binding.',
        );
      }
      try {
        await verifyServiceReadableAssets(resolutions);
      } catch (error) {
        throw new RunStoreError(
          'ASSET_NOT_SERVICE_READABLE',
          error instanceof Error ? error.message : String(error),
        );
      }
      const renderInputSha256 = renderInputIdentity({
        compileInputSha256: compilation.compileInputSha256,
        documentSha256: compilation.document.sha256,
        reportSha256: compilation.report.sha256,
        audioSha256: take.audio.sha256,
        assetResolutions: resolutions as unknown as JsonValue,
        rendererVersion: this.options.rendererVersion ?? '1',
      });
      const previous = checkpoint.bindings;
      const existing = previous.render;

      if (
        existing?.freshness.state === 'fresh' &&
        existing.renderInputSha256 === renderInputSha256
      ) {
        const previewBytes = await store.readArtifact(existing.preview);
        const next = await store.commit({
          expectedRevision: checkpoint.revision,
          command: 'run.render',
          outcome: 'succeeded',
          stage: 'rendered',
          artifacts: [
            { kind: existing.preview.kind, path: existing.preview.path, bytes: previewBytes },
          ],
          bindings: previous,
          data: { preview: existing.preview as unknown as JsonValue },
        });
        return this.success(
          'run.render',
          next,
          { preview: existing.preview },
          [existing.preview],
          [],
        );
      }

      if (!this.options.renderer) {
        throw new RunStoreError('RENDERER_NOT_CONFIGURED', 'Production renderer is unavailable.');
      }
      const preview = await this.options.renderer({
        document,
        audio: verifiedTake.artifacts.audio,
      });
      assertMp4(preview);
      const path = RUN_PATHS.preview(renderInputSha256);
      const descriptor = { kind: 'preview', path, sha256: sha256Bytes(preview.bytes) };
      const next = await store.commit({
        expectedRevision: checkpoint.revision,
        command: 'run.render',
        outcome: 'succeeded',
        stage: 'rendered',
        artifacts: [{ kind: 'preview', path, bytes: preview.bytes }],
        bindings: ([artifact]) => {
          if (!artifact) throw new Error('Preview was not published.');
          return {
            ...previous,
            render: {
              renderInputSha256,
              compileInputSha256: compilation.compileInputSha256,
              preview: artifact,
              assetResolutions: resolutions,
              freshness: structuredClone(fresh),
            },
          };
        },
        data: { preview: descriptor as unknown as JsonValue },
      });
      return this.success('run.render', next, { preview: descriptor }, [descriptor], []);
    });
  }

  private requireRecordBindings(checkpoint: RunCheckpoint): {
    planBinding: NonNullable<RunBindings['plan']>;
    validation: NonNullable<RunBindings['validation']>;
    preflight: NonNullable<RunBindings['preflight']>;
  } {
    const { plan, validation, preflight } = checkpoint.bindings;
    if (
      !plan ||
      !validation ||
      !preflight ||
      [plan.freshness, validation.freshness, preflight.freshness].some(
        (value) => value.state !== 'fresh',
      ) ||
      validation.planSha256 !== plan.planSha256 ||
      preflight.planSha256 !== plan.planSha256
    ) {
      throw new RunStoreError(
        'RECORD_PREREQUISITES_STALE',
        'Record requires fresh validation and Preflight for the current plan.',
      );
    }
    return { planBinding: plan, validation, preflight };
  }

  private async verifyHistoricalTake(
    store: RunStore,
    binding: NonNullable<RunBindings['take']>,
    plan: VideoPlan,
    request: ProductionRequest,
  ): Promise<{
    manifest: RunTakeManifest;
    artifacts: RunTakeArtifacts;
    currentFold: TimedBeatFold;
  }> {
    const manifest = this.parseArtifact(
      await store.readArtifact(binding.manifest),
    ) as RunTakeManifest;
    const artifacts: RunTakeArtifacts = {
      audio: await store.readArtifact(binding.audio),
      alignment: this.parseArtifact(await store.readArtifact(binding.alignment)) as Alignment,
    };
    const historicalFold = this.parseArtifact(
      await store.readArtifact(binding.fold),
    ) as TimedBeatFold;
    try {
      verifyRunTake(manifest, artifacts, plan.beats, request.production.voice);
      verifyTimedBeatFold(
        historicalFold,
        manifest,
        artifacts,
        historicalFold.timedBeats.map(({ id, text }) => ({ id, text })),
      );
    } catch (error) {
      throw new RunStoreError(
        'TAKE_ARTIFACT_MISMATCH',
        error instanceof Error ? error.message : String(error),
      );
    }
    if (
      binding.recordingInputSha256 !== manifest.recordingInputSha256 ||
      binding.takeId !== manifest.takeId ||
      binding.takeSha256 !== manifest.takeSha256 ||
      binding.takeSha256 !== historicalFold.takeSha256 ||
      binding.beatShapeSha256 !== historicalFold.beatShapeSha256
    ) {
      throw new RunStoreError(
        'TAKE_BINDING_MISMATCH',
        'Historical Take binding does not match its verified artifacts.',
      );
    }
    return { manifest, artifacts, currentFold: foldRunTake(manifest, artifacts, plan.beats) };
  }

  private async finishProviderResponse(input: {
    session: RunStoreExclusiveSession;
    checkpoint: RunCheckpoint;
    plan: VideoPlan;
    request: ProductionRequest;
    attemptId: string;
    replacement: boolean;
    response: { audio: Uint8Array; alignment: Alignment };
  }): Promise<CommandExecution> {
    try {
      const recordedAt = this.now();
      if (Number.isNaN(recordedAt.getTime())) throw new Error('Recording clock is invalid.');
      const { manifest, artifacts } = createRunTake({
        beats: input.plan.beats,
        voice: input.request.production.voice,
        response: input.response,
        recordedAt: recordedAt.toISOString(),
      });
      const fold = foldRunTake(manifest, artifacts, input.plan.beats);
      const result = await this.publishTakeSelection({
        session: input.session,
        checkpoint: input.checkpoint,
        plan: input.plan,
        manifest,
        artifacts,
        fold,
        disposition: input.replacement ? 'replacement_recorded' : 'recorded',
      });
      await input.session.markRecordingAttempt(input.attemptId, 'published', manifest.takeSha256);
      return result;
    } catch (error) {
      await input.session.markRecordingAttempt(input.attemptId, 'failed');
      return this.failRecording(
        input.session,
        input.checkpoint,
        'SYNTHESIS_RESPONSE_INVALID',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async publishTakeSelection(input: {
    session: RunStoreExclusiveSession;
    checkpoint: RunCheckpoint;
    plan: VideoPlan;
    manifest: RunTakeManifest;
    artifacts: RunTakeArtifacts;
    fold: TimedBeatFold;
    disposition: 'reused' | 'recorded' | 'replacement_recorded';
  }): Promise<CommandExecution> {
    const previous = input.checkpoint.bindings;
    const exactCurrent =
      previous.take?.takeSha256 === input.manifest.takeSha256 &&
      previous.take.beatShapeSha256 === input.fold.beatShapeSha256 &&
      previous.take.freshness.state === 'fresh';
    const quota = await input.session.quota();
    const data = {
      disposition: input.disposition,
      takeId: input.manifest.takeId,
      newTakesUsed: quota.newTakesUsed,
      maxNewTakes: quota.maxNewTakes,
    } as const;
    const nextActions = [
      {
        command: 'run.compile' as const,
        args: ['--run', '.'],
        reason: 'A verified Take is bound.',
      },
    ];
    const next = await input.session.commit({
      expectedRevision: input.checkpoint.revision,
      command: 'run.record',
      outcome: 'succeeded',
      stage: exactCurrent ? input.checkpoint.stage : 'recorded',
      artifacts: [
        {
          kind: 'take_manifest',
          path: RUN_PATHS.takeManifest(input.manifest.takeSha256),
          bytes: canonicalJson(input.manifest as unknown as JsonValue),
        },
        {
          kind: 'take_audio',
          path: RUN_PATHS.takeAudio(input.manifest.takeSha256),
          bytes: input.artifacts.audio,
        },
        {
          kind: 'take_alignment',
          path: RUN_PATHS.takeAlignment(input.manifest.takeSha256),
          bytes: canonicalJson(input.artifacts.alignment as unknown as JsonValue),
        },
        {
          kind: 'timed_beat_fold',
          path: RUN_PATHS.timedBeatFold(input.manifest.takeSha256, input.fold.beatShapeSha256),
          bytes: canonicalJson(input.fold as unknown as JsonValue),
        },
      ],
      bindings: ([manifest, audio, alignment, fold]) => {
        if (!manifest || !audio || !alignment || !fold) {
          throw new Error('Take artifacts were not published.');
        }
        return {
          ...previous,
          take: {
            recordingInputSha256: input.manifest.recordingInputSha256,
            takeId: input.manifest.takeId,
            takeSha256: input.manifest.takeSha256,
            beatShapeSha256: input.fold.beatShapeSha256,
            manifest,
            audio,
            alignment,
            fold,
            freshness: structuredClone(fresh),
          },
          compilation:
            exactCurrent || !previous.compilation
              ? previous.compilation
              : { ...previous.compilation, freshness: stale('TAKE_CHANGED') },
          render:
            exactCurrent || !previous.render
              ? previous.render
              : { ...previous.render, freshness: stale('TAKE_CHANGED') },
        };
      },
      data,
      next: nextActions,
    });
    return this.success(
      'run.record',
      next,
      data,
      [
        next.bindings.take!.manifest,
        next.bindings.take!.audio,
        next.bindings.take!.alignment,
        next.bindings.take!.fold,
      ],
      nextActions,
    );
  }

  private async pauseRecording(
    session: RunStoreExclusiveSession,
    checkpoint: RunCheckpoint,
    reason: string,
  ): Promise<CommandExecution> {
    const nextActions = [
      {
        command: 'run.record' as const,
        args: ['--run', '.', '--replacement-authorisation', '<grant.json>'],
        reason,
      },
    ];
    const next = await session.commit({
      expectedRevision: checkpoint.revision,
      command: 'run.record',
      outcome: 'paused',
      stage: checkpoint.stage,
      data: null,
      next: nextActions,
    });
    return this.success('run.record', next, null, [], nextActions, 'paused');
  }

  private async failRecording(
    session: RunStoreExclusiveSession,
    checkpoint: RunCheckpoint,
    code: string,
    message: string,
  ): Promise<CommandExecution> {
    const error = { code, message, details: null };
    const next = await session.commit({
      expectedRevision: checkpoint.revision,
      command: 'run.record',
      outcome: 'failed',
      stage: checkpoint.stage,
      data: null,
      error,
    });
    return {
      envelope: resultEnvelopeSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        command: 'run.record',
        outcome: 'failed',
        run: { id: next.runId, stage: next.stage },
        data: null,
        artifacts: [],
        error,
        next: [],
      }),
      exitCode: 1,
    };
  }

  private async readAndVerifyReplacementGrant(
    path: string,
    checkpoint: RunCheckpoint,
    recordingInputSha256: string,
  ): Promise<ReplacementGrant> {
    let grant: ReplacementGrant;
    try {
      grant = replacementGrantSchema.parse(await this.readJson(path));
    } catch {
      throw new RunStoreError(
        'REPLACEMENT_GRANT_INVALID',
        'Replacement authorisation is malformed.',
      );
    }
    if (grant.runId !== checkpoint.runId || grant.recordingInputSha256 !== recordingInputSha256) {
      throw new RunStoreError(
        'REPLACEMENT_GRANT_SCOPE_MISMATCH',
        'Replacement authorisation does not match this Run and Recording input.',
      );
    }
    if (!this.options.verifyReplacementGrant) {
      throw new RunStoreError(
        'REPLACEMENT_GRANT_VERIFIER_UNAVAILABLE',
        'Replacement grant authority is unavailable.',
      );
    }
    if (!(await this.options.verifyReplacementGrant(grant))) {
      throw new RunStoreError(
        'REPLACEMENT_AUTHORIZATION_INVALID',
        'Replacement authorisation did not authenticate.',
      );
    }
    if (checkpoint.quota.replacementGrantIdsUsed.includes(grant.grantId)) {
      throw new RunStoreError('GRANT_REPLAYED', 'Replacement authorisation was already used.');
    }
    return grant;
  }

  private requireCompileBindings(checkpoint: RunCheckpoint): {
    planBinding: NonNullable<RunBindings['plan']>;
    validation: NonNullable<RunBindings['validation']>;
    preflight: NonNullable<RunBindings['preflight']>;
    take: NonNullable<RunBindings['take']>;
  } {
    const { plan, validation, preflight, take } = checkpoint.bindings;
    if (
      !plan ||
      !validation ||
      !preflight ||
      !take ||
      [plan.freshness, validation.freshness, preflight.freshness, take.freshness].some(
        (value) => value.state !== 'fresh',
      ) ||
      validation.planSha256 !== plan.planSha256 ||
      preflight.planSha256 !== plan.planSha256
    ) {
      throw new RunStoreError(
        'COMPILE_PREREQUISITES_STALE',
        'Compile requires fresh validation, Preflight and a verified Take for the current plan.',
      );
    }
    return { planBinding: plan, validation, preflight, take };
  }

  private requireRenderBindings(checkpoint: RunCheckpoint): {
    planBinding: NonNullable<RunBindings['plan']>;
    validation: NonNullable<RunBindings['validation']>;
    preflight: NonNullable<RunBindings['preflight']>;
    take: NonNullable<RunBindings['take']>;
    compilation: NonNullable<RunBindings['compilation']>;
  } {
    const compileBindings = this.requireCompileBindings(checkpoint);
    const compilation = checkpoint.bindings.compilation;
    if (
      !compilation ||
      compilation.freshness.state !== 'fresh' ||
      compilation.planSha256 !== compileBindings.planBinding.planSha256 ||
      compilation.takeSha256 !== compileBindings.take.takeSha256
    ) {
      throw new RunStoreError(
        'RENDER_PREREQUISITES_STALE',
        'Render requires a fresh green compilation bound to the current plan and Take.',
      );
    }
    return {
      planBinding: compileBindings.planBinding,
      validation: compileBindings.validation,
      preflight: compileBindings.preflight,
      take: compileBindings.take,
      compilation,
    };
  }

  private async verifyTakeBinding(
    store: RunStore,
    binding: NonNullable<RunBindings['take']>,
    plan: VideoPlan,
    request: ProductionRequest,
  ): Promise<{
    manifest: RunTakeManifest;
    fold: TimedBeatFold;
    artifacts: RunTakeArtifacts;
  }> {
    const manifest = this.parseArtifact(
      await store.readArtifact(binding.manifest),
    ) as RunTakeManifest;
    const audio = await store.readArtifact(binding.audio);
    const alignment = this.parseArtifact(
      await store.readArtifact(binding.alignment),
    ) as RunTakeArtifacts['alignment'];
    const fold = this.parseArtifact(await store.readArtifact(binding.fold)) as TimedBeatFold;
    const artifacts = { audio, alignment };
    try {
      verifyRunTake(manifest, artifacts, plan.beats, request.production.voice);
      verifyTimedBeatFold(fold, manifest, artifacts, plan.beats);
    } catch (error) {
      throw new RunStoreError(
        'TAKE_ARTIFACT_MISMATCH',
        error instanceof Error ? error.message : String(error),
      );
    }
    if (
      binding.recordingInputSha256 !== manifest.recordingInputSha256 ||
      binding.takeId !== manifest.takeId ||
      binding.takeSha256 !== manifest.takeSha256 ||
      binding.beatShapeSha256 !== fold.beatShapeSha256 ||
      binding.takeSha256 !== fold.takeSha256
    ) {
      throw new RunStoreError(
        'TAKE_BINDING_MISMATCH',
        'Take binding does not match verified Take artifacts.',
      );
    }
    return { manifest, fold, artifacts };
  }

  private async verifyCompilePrerequisiteReports(
    store: RunStore,
    bindings: {
      planBinding: NonNullable<RunBindings['plan']>;
      validation: NonNullable<RunBindings['validation']>;
      preflight: NonNullable<RunBindings['preflight']>;
    },
    plan: VideoPlan,
    request: ProductionRequest,
  ): Promise<void> {
    if (planIdentity(plan) !== bindings.planBinding.planSha256) {
      throw new RunStoreError('PLAN_BINDING_MISMATCH', 'Plan snapshot identity changed.');
    }
    const validationInputSha256 = validationInputIdentity({
      planSha256: bindings.planBinding.planSha256,
      catalogManifestVersion: 4,
      videoPlanContractVersion: 1,
    });
    const expectedValidation = compileReportSchema.parse(validateVideoPlan(plan));
    const boundValidation = compileReportSchema.parse(
      this.parseArtifact(await store.readArtifact(bindings.validation.report)),
    );
    if (
      !expectedValidation.ok ||
      bindings.validation.validationInputSha256 !== validationInputSha256 ||
      canonicalJson(expectedValidation as unknown as JsonValue) !==
        canonicalJson(boundValidation as unknown as JsonValue)
    ) {
      throw new RunStoreError(
        'VALIDATION_BINDING_MISMATCH',
        'Validation binding is not the current green validation projection.',
      );
    }

    const calibration = await this.calibrationState();
    const expectedPreflight = buildPreflightReport(plan, calibration, {
      calibrationKey: { ...request.production.voice, language: 'en' },
    });
    const preflightInputSha256 = preflightInputIdentity({
      planSha256: bindings.planBinding.planSha256,
      validationInputSha256,
      calibrationVersion:
        calibration.status === 'missing' ? null : calibration.calibration.calibrationVersion,
    });
    const boundPreflight = this.parseArtifact(await store.readArtifact(bindings.preflight.report));
    if (
      bindings.preflight.preflightInputSha256 !== preflightInputSha256 ||
      canonicalJson(expectedPreflight as unknown as JsonValue) !==
        canonicalJson(boundPreflight as JsonValue)
    ) {
      throw new RunStoreError(
        'PREFLIGHT_BINDING_MISMATCH',
        'Preflight binding is not the current advisory projection.',
      );
    }
  }

  private parseArtifact(bytes: Uint8Array): unknown {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  }

  private bindValidatedPlan(
    previous: RunBindings,
    planSha256: string,
    validationInputSha256: string,
    recordingInputSha256: string,
    beatShapeSha256: string,
    snapshot: RunBindings['plan'] extends infer _
      ? { kind: string; path: string; sha256: string }
      : never,
    report: { kind: string; path: string; sha256: string },
  ): RunBindings {
    if (this.sameFreshPlan(previous, planSha256)) {
      return {
        ...previous,
        plan: { planSha256, snapshot, freshness: structuredClone(fresh) },
        validation: {
          validationInputSha256,
          planSha256,
          report,
          freshness: structuredClone(fresh),
        },
      };
    }
    const take = previous.take
      ? previous.take.recordingInputSha256 === recordingInputSha256 &&
        previous.take.beatShapeSha256 === beatShapeSha256
        ? previous.take
        : { ...previous.take, freshness: stale('PLAN_RECORDING_INPUT_CHANGED') }
      : null;
    return {
      plan: { planSha256, snapshot, freshness: structuredClone(fresh) },
      validation: { validationInputSha256, planSha256, report, freshness: structuredClone(fresh) },
      preflight: previous.preflight
        ? { ...previous.preflight, freshness: stale('PLAN_CHANGED') }
        : null,
      take,
      compilation: previous.compilation
        ? { ...previous.compilation, freshness: stale('PLAN_CHANGED') }
        : null,
      render: previous.render ? { ...previous.render, freshness: stale('PLAN_CHANGED') } : null,
      images: previous.images,
    };
  }

  private sameFreshPlan(bindings: RunBindings, planSha256: string): boolean {
    return bindings.plan?.planSha256 === planSha256 && bindings.plan.freshness.state === 'fresh';
  }

  private async calibrationState(): Promise<DurationCalibrationState> {
    return this.calibrationStore ? this.calibrationStore.load() : activeInitialCalibration();
  }

  private async requestOf(store: RunStore, checkpoint: RunCheckpoint): Promise<ProductionRequest> {
    return productionRequestSchema.parse(
      JSON.parse(
        Buffer.from(await store.readArtifact(checkpoint.request.artifact)).toString('utf8'),
      ),
    );
  }

  private imageGenerator(): ImageGenerationAdapter {
    if (!this.options.imageGenerator) {
      throw new RunStoreError(
        'IMAGE_GENERATOR_NOT_CONFIGURED',
        'No image generation adapter is configured for Production.',
      );
    }
    return this.options.imageGenerator;
  }

  private requireImageJob(checkpoint: RunCheckpoint, jobId: string): ImageJob {
    const job = checkpoint.bindings.images.jobs.find((candidate) => candidate.id === jobId);
    if (!job) throw new RunStoreError('IMAGE_JOB_NOT_FOUND', `No image job named ${jobId} exists.`);
    return job;
  }

  private replaceImageJob(
    bindings: RunBindings,
    jobId: string,
    replacement: ImageJob,
  ): RunBindings {
    if (!bindings.images.jobs.some((job) => job.id === jobId)) {
      throw new RunStoreError('IMAGE_JOB_NOT_FOUND', `No image job named ${jobId} exists.`);
    }
    return {
      ...bindings,
      images: {
        ...bindings.images,
        jobs: bindings.images.jobs.map((job) => (job.id === jobId ? replacement : job)),
      },
    };
  }

  private staleAssetConsumers(bindings: RunBindings, reason: string | null): RunBindings {
    if (reason === null) return bindings;
    return {
      ...bindings,
      compilation: bindings.compilation
        ? { ...bindings.compilation, freshness: stale(reason) }
        : null,
      render: bindings.render ? { ...bindings.render, freshness: stale(reason) } : null,
    };
  }

  private async requireImageGrant(
    grant: ImageGenerationGrant,
    checkpoint: RunCheckpoint,
    request: ImageGenerationRequest,
  ): Promise<void> {
    if (grant.runId !== checkpoint.runId || grant.requestSha256 !== request.requestSha256) {
      throw new RunStoreError(
        'IMAGE_GRANT_SCOPE_MISMATCH',
        'The image authorization does not name this Run and exact provider request.',
      );
    }
    const now = this.now().getTime();
    const issuedAt = Date.parse(grant.issuedAt);
    const expiresAt = Date.parse(grant.expiresAt);
    if (!Number.isFinite(now) || issuedAt > now || expiresAt <= now || expiresAt <= issuedAt) {
      throw new RunStoreError(
        'IMAGE_GRANT_EXPIRED',
        'The image authorization is not currently valid.',
      );
    }
    if (checkpoint.bindings.images.consumedGrantIds.includes(grant.grantId)) {
      throw new RunStoreError('IMAGE_GRANT_REPLAYED', 'The image authorization was already used.');
    }
    if (!this.options.verifyImageGrant) {
      throw new RunStoreError(
        'IMAGE_GRANT_VERIFIER_UNAVAILABLE',
        'The image authorization authority is unavailable.',
      );
    }
    if (!(await this.options.verifyImageGrant(grant))) {
      throw new RunStoreError(
        'IMAGE_AUTHORIZATION_INVALID',
        'The image authorization did not authenticate.',
      );
    }
  }

  private async requireImageWorkItem(
    store: RunStore,
    checkpoint: RunCheckpoint,
    request: ImageGenerationRequest,
  ): Promise<AssetRequirement> {
    const compilation = checkpoint.bindings.compilation;
    const planBinding = checkpoint.bindings.plan;
    if (!compilation || !planBinding) {
      throw new RunStoreError(
        'IMAGE_REQUIREMENT_NOT_PUBLISHED',
        'Generate images only for requirements published by a compilation.',
      );
    }
    const pending = compilation.assetResolutions.some(
      (resolution) =>
        resolution.status === 'placeholder' &&
        resolution.pendingRequirementId === request.requirementId,
    );
    if (!pending) {
      throw new RunStoreError(
        'IMAGE_REQUIREMENT_NOT_PENDING',
        'The named requirement is not a pending placeholder in the bound compilation.',
      );
    }
    const plan = videoPlanSchema.parse(
      this.parseArtifact(await store.readArtifact(planBinding.snapshot)),
    );
    const requirement = this.assetRequirements(plan).find(
      (candidate) => assetRequirementId(candidate) === request.requirementId,
    );
    if (!requirement) {
      throw new RunStoreError(
        'IMAGE_REQUIREMENT_NOT_FOUND',
        'The bound plan does not contain the named image requirement.',
      );
    }
    const expectedIdentity = requirement.identityKey ?? request.requirementId;
    if (request.identityKey !== expectedIdentity) {
      throw new RunStoreError(
        'IMAGE_IDENTITY_MISMATCH',
        'The generation request identity does not match the plan requirement.',
      );
    }
    return requirement;
  }

  private assetRequirements(plan: VideoPlan): AssetRequirement[] {
    const values: unknown[] = [];
    for (const section of plan.sections) {
      for (const scene of section.scenes) {
        if (scene.props.assetRequirement !== undefined) values.push(scene.props.assetRequirement);
      }
      for (const element of section.persistent ?? []) {
        if (element.assetRequirement !== undefined) values.push(element.assetRequirement);
      }
    }
    return values.map((value) => assetRequirementSchema.parse(value));
  }

  private assetWorklist(resolutions: AssetResolution[]) {
    const seen = new Set<string>();
    return resolutions.flatMap((resolution) => {
      const requirementId = resolution.pendingRequirementId;
      if (
        resolution.status !== 'placeholder' ||
        requirementId === null ||
        seen.has(requirementId)
      ) {
        return [];
      }
      seen.add(requirementId);
      return [
        {
          requirementId,
          sectionId: resolution.sectionId,
          sceneId: resolution.sceneId,
          field: resolution.field,
        },
      ];
    });
  }

  private assertGeneratedPng(
    bytes: Uint8Array,
    mediaType: string,
  ): { width: number; height: number } {
    const png = Buffer.from(bytes);
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (
      mediaType !== 'image/png' ||
      png.length < 24 ||
      !png.subarray(0, 8).equals(signature) ||
      png.toString('ascii', 12, 16) !== 'IHDR'
    ) {
      throw new RunStoreError(
        'IMAGE_PROVIDER_RESPONSE_INVALID',
        'The image provider did not return a valid PNG.',
      );
    }
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (width === 0 || height === 0) {
      throw new RunStoreError(
        'IMAGE_PROVIDER_RESPONSE_INVALID',
        'The image provider returned a PNG with invalid dimensions.',
      );
    }
    return { width, height };
  }

  private async projectAssetResolver(
    store: RunStore,
    checkpoint: RunCheckpoint,
    plan: VideoPlan,
  ): Promise<ReturnType<typeof createAssetResolver>> {
    const requirements = this.assetRequirements(plan);
    const entries: LocalAssetEntry[] = [];
    const digestsByUri = new Map<string, string>();
    for (const job of checkpoint.bindings.images.jobs) {
      if (job.status !== 'accepted' && job.status !== 'failed') continue;
      const requirement = requirements.find(
        (candidate) => assetRequirementId(candidate) === job.requirementId,
      );
      if (!requirement) continue;
      if (job.status === 'failed') {
        entries.push({
          requirement,
          ref: {
            status: 'failed',
            uri: PLACEHOLDER_ASSET_URI,
            requirementId: job.requirementId,
            reason: job.failure ?? 'Image generation failed.',
          },
        });
        continue;
      }
      if (!job.candidate) {
        throw new RunStoreError(
          'IMAGE_ACCEPTANCE_CORRUPTED',
          'An accepted image job has no candidate metadata.',
        );
      }
      const bytes = await store.readArtifact(job.candidate.artifact);
      this.assertGeneratedPng(bytes, 'image/png');
      const uri = `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
      digestsByUri.set(uri, job.candidate.artifact.sha256);
      entries.push({ requirement, ref: { status: 'ready', uri } });
    }
    return createAssetResolver({
      projectLibrary: {
        entries,
        verify: (ref) => {
          const expected = digestsByUri.get(ref.uri);
          if (!expected) return { ok: false, reason: 'Accepted image bytes are not bound.' };
          const marker = 'data:image/png;base64,';
          const actual = sha256Bytes(Buffer.from(ref.uri.slice(marker.length), 'base64'));
          return actual === expected
            ? { ok: true }
            : { ok: false, reason: 'Accepted image digest changed.' };
        },
      },
      library: repositoryAssetLibrary,
    });
  }

  private summary(report: CompileReport) {
    return {
      ok: report.ok,
      errorCount: report.errors.length,
      warningCount: report.warnings.length,
    };
  }

  private async execute(
    command: CommandId,
    runRoot: string | null,
    work: ((store: RunStore) => Promise<CommandExecution>) | (() => Promise<CommandExecution>),
  ): Promise<CommandExecution> {
    try {
      if (runRoot === null) return await (work as () => Promise<CommandExecution>)();
      const runId = await this.discoverRunId(runRoot);
      return await (work as (store: RunStore) => Promise<CommandExecution>)(
        this.store(runRoot, runId),
      );
    } catch (error) {
      const malformed = error instanceof ZodError || error instanceof SyntaxError;
      const needsRepair =
        error instanceof RunStoreError &&
        [
          'RUN_ARTIFACT_CHANGED',
          'RUN_ARTIFACT_MISSING',
          'PLAN_BINDING_MISMATCH',
          'VALIDATION_BINDING_MISMATCH',
          'PREFLIGHT_BINDING_MISMATCH',
          'TAKE_ARTIFACT_MISMATCH',
          'TAKE_BINDING_MISMATCH',
          'COMPILE_REUSE_NOT_GREEN',
          'ASSET_RESOLUTION_VIEW_CHANGED',
          'COMPILE_INPUT_BINDING_MISMATCH',
          'RENDER_REQUIRES_GREEN_COMPILE',
          'ASSET_NOT_SERVICE_READABLE',
        ].includes(error.code);
      const code =
        error instanceof RunStoreError
          ? error.code
          : malformed
            ? 'INVALID_INPUT'
            : 'COMMAND_FAILED';
      const message = error instanceof Error ? error.message : String(error);
      return {
        envelope: resultEnvelopeSchema.parse({
          protocolVersion: PROTOCOL_VERSION,
          command,
          outcome: needsRepair ? 'needs_repair' : 'failed',
          run: null,
          data: null,
          artifacts: [],
          error: { code, message, details: null },
          next: [],
        }),
        exitCode: malformed ? 2 : needsRepair ? 0 : 1,
      };
    }
  }

  private success(
    command: CommandId,
    checkpoint: RunCheckpoint,
    data: unknown,
    artifacts: ResultEnvelope['artifacts'],
    next: ResultEnvelope['next'],
    outcome: ResultEnvelope['outcome'] = 'succeeded',
  ): CommandExecution {
    return {
      envelope: resultEnvelopeSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        command,
        outcome,
        run: { id: checkpoint.runId, stage: checkpoint.stage },
        data,
        artifacts,
        error: null,
        next,
      }),
      exitCode: 0,
    };
  }

  private assertNonTerminal(checkpoint: RunCheckpoint): void {
    if (checkpoint.stage === 'declined' || checkpoint.terminal !== null) {
      throw new RunStoreError('RUN_TERMINAL', 'The Run has already reached a terminal outcome.');
    }
  }

  private stageForBinding(binding: string): RunStage {
    const stages: Record<string, RunStage> = {
      plan: 'validated',
      validation: 'validated',
      preflight: 'preflighted',
      take: 'recorded',
      compilation: 'compiled',
      render: 'rendered',
    };
    return stages[binding] as RunStage;
  }

  private store(runRoot: string, runId: string): RunStore {
    return new RunStore({
      runRoot: resolve(runRoot),
      ledgerRoot: this.options.ledgerRoot,
      runId,
      hmacKey: this.options.hmacKey,
      keyId: this.options.keyId,
    });
  }

  private async discoverRunId(runRoot: string): Promise<string> {
    const candidate = JSON.parse(
      await readFile(resolve(runRoot, RUN_PATHS.checkpoint), 'utf8'),
    ) as {
      runId?: unknown;
    };
    if (typeof candidate.runId !== 'string' || candidate.runId.length === 0) {
      throw new RunStoreError('RUN_ID_MISSING', 'run.json has no usable Run id.');
    }
    return candidate.runId;
  }

  private async readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(resolve(path), 'utf8'));
  }
}
