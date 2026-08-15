import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type CompileReport,
  type CompileResult,
  type CompiledDocument,
  type VideoPlan,
  compile,
  compileReportSchema,
  compiledDocumentSchema,
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
  PROTOCOL_VERSION,
  type ProductionRequest,
  type ReplacementGrant,
  type ResultEnvelope,
  type RunStage,
  declineSchema,
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
  beatShapeIdentity,
  compileInputIdentity,
  planIdentity,
  preflightInputIdentity,
  recordingInputIdentity,
  renderInputIdentity,
  validationInputIdentity,
} from '../run-store/identities';
import { RUN_PATHS } from '../run-store/paths';
import {
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
        .filter(([, binding]) => binding?.freshness.state === 'stale')
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
          data: { report: this.summary(report) },
          next: nextActions,
        });
        return this.success(
          'run.compile',
          next,
          { report: this.summary(report) },
          artifacts,
          nextActions,
        );
      }

      const result = this.compiler({
        plan,
        beats: verifiedTake.fold.timedBeats,
        audio: { voiceover: 'voiceover.mp3' },
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
          data: { report: this.summary(result.report) },
          next: nextActions,
        });
        return this.success(
          'run.compile',
          next,
          { report: this.summary(result.report) },
          artifacts,
          nextActions,
          'needs_repair',
        );
      }

      const documentPath = RUN_PATHS.compiledDocument(compileInputSha256);
      const documentBytes = canonicalJson(result.document as unknown as JsonValue);
      const compileReportBytes = reportBytes(result.report);
      const resolutions = assetResolutionView(result.document);
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
        data: { report: this.summary(result.report) },
        next: nextActions,
      });
      return this.success(
        'run.compile',
        next,
        { report: this.summary(result.report) },
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
