import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;

const nonEmpty = z.string().min(1);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const runRelativePath = nonEmpty.refine(
  (path) =>
    !path.includes('\\') &&
    !path.startsWith('/') &&
    !/^[A-Za-z]:/.test(path) &&
    path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
  'Artifact path must be a normalized Run-relative path.',
);

export const contractCategorySchema = z.enum([
  'language',
  'plan',
  'catalog',
  'checks',
  'operating',
  'design',
  'protocol',
]);

/**
 * Who a published category is for.
 *
 * `author` is whatever reads the contract as a prompt and answers with a plan; `client` is
 * whatever drives production over the command line. The distinction is ADR-0016's: the author
 * seam carries payloads and tools and nothing that locates anything, so an author cannot issue
 * a command, read an exit code, resume a Run or write inside a boundary, and a category about
 * those things is one it can read but never act on.
 *
 * Published rather than inferred. A consumer that pattern-matched category ids, or kept a list
 * of the ones it wanted, would be holding an opinion about the contract in a place the contract
 * cannot see — and the next category added here would find it silently teaching a stale subset.
 */
export const contractAudienceSchema = z.enum(['author', 'client']);

export const commandIdSchema = z.enum([
  'contract.index',
  'contract.show',
  'run.init',
  'run.status',
  'run.decline',
  'run.validate',
  'run.preflight',
  'run.record',
  'run.compile',
  'run.render',
  'run.image.start',
  'run.image.status',
  'run.image.accept',
  'run.image.reject',
]);

export const runStageSchema = z.enum([
  'initialized',
  'validated',
  'preflighted',
  'recorded',
  'compiled',
  'rendered',
  'declined',
]);

export const commandOutcomeSchema = z.enum([
  'succeeded',
  'needs_repair',
  'paused',
  'declined',
  'failed',
]);

export const productionRequestSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    brief: z
      .object({
        id: nonEmpty,
        text: nonEmpty,
        durationSeconds: z
          .number()
          .finite()
          .positive()
          .optional()
          .describe(
            'Estimated target duration in seconds, not authored scene timing or a word quota.',
          ),
        maxGeneratedImages: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            'Maximum new image generation jobs in this Run, including failed attempts; reuse is free. This is not a required image or scene count.',
          ),
      })
      .strict(),
    production: z
      .object({
        voice: z
          .object({
            provider: z.literal('elevenlabs'),
            voiceId: nonEmpty,
            modelId: nonEmpty,
            seed: z.number().int(),
          })
          .strict(),
        maxNewTakes: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const declineSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    kind: z.literal('unservable_brief'),
    summary: nonEmpty,
    unmetNeeds: z.array(z.object({ need: nonEmpty, catalogGap: nonEmpty }).strict()).min(1),
  })
  .strict();

export const replacementGrantSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    grantId: nonEmpty,
    runId: nonEmpty,
    recordingInputSha256: sha256,
    issuedAt: z.iso.datetime({ offset: true }),
    grant: nonEmpty,
  })
  .strict();

export const imageGenerationRequestSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requirementId: z.string().regex(/^req_[0-9a-f]{8}$/),
    identityKey: nonEmpty,
    prompt: nonEmpty.max(4_000),
    aspectRatio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']),
    outputMimeType: z.literal('image/png'),
    seed: z.number().int().min(0).max(0x7fffffff),
    requestSha256: sha256,
    retryOf: nonEmpty.optional(),
  })
  .strict();

export const imageGenerationGrantSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    grantId: nonEmpty,
    runId: nonEmpty,
    requestSha256: sha256,
    issuedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    grant: nonEmpty,
  })
  .strict();

export const imageAcceptanceSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    jobId: nonEmpty,
    candidateSha256: sha256,
  })
  .strict();

export const imageRejectionSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    jobId: nonEmpty,
    candidateSha256: sha256.optional(),
    reason: nonEmpty.optional(),
  })
  .strict();

export const artifactDescriptorSchema = z
  .object({
    kind: nonEmpty,
    path: runRelativePath,
    sha256,
  })
  .strict();

export const imageCandidateSchema = z
  .object({
    id: nonEmpty,
    requirementId: z.string().regex(/^req_[0-9a-f]{8}$/),
    identityKey: nonEmpty,
    promptSha256: sha256,
    artifact: artifactDescriptorSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

export const imageRecoveryPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    requestSha256: sha256,
    runId: nonEmpty,
    maxImageAttempts: z.number().int().min(1).max(8),
    minimumIntervalSeconds: z.number().int().min(60).max(600),
    retryHttpStatuses: z.tuple([z.literal(429)]),
    authorizedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type ImageRecoveryPolicy = z.infer<typeof imageRecoveryPolicySchema>;

export const imageJobSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: nonEmpty,
    requirementId: z.string().regex(/^req_[0-9a-f]{8}$/),
    identityKey: nonEmpty,
    requestSha256: sha256,
    providerMode: z.enum(['recorded', 'live']),
    status: z.enum(['dispatching', 'candidate', 'accepted', 'rejected', 'failed', 'uncertain']),
    candidate: imageCandidateSchema.nullable(),
    failure: nonEmpty.nullable(),
    dispatchedAt: z.iso.datetime({ offset: true }).optional(),
    retryOf: nonEmpty.optional(),
  })
  .strict()
  .superRefine((job, context) => {
    const hasCandidate = ['candidate', 'accepted', 'rejected'].includes(job.status);
    if (hasCandidate !== (job.candidate !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['candidate'],
        message: 'Candidate states and candidate metadata must agree.',
      });
    }
    const hasFailure = ['failed', 'uncertain'].includes(job.status);
    if (hasFailure !== (job.failure !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['failure'],
        message: 'Failed states and their safe failure summary must agree.',
      });
    }
  });

export const compilerSummarySchema = z
  .object({
    ok: z.boolean(),
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
  })
  .strict();

export const assetWorkItemSchema = z
  .object({
    requirementId: z.string().regex(/^req_[0-9a-f]{8}$/),
    sectionId: nonEmpty,
    sceneId: nonEmpty.nullable(),
    field: nonEmpty,
  })
  .strict();

const preflightFindingSchema = z
  .object({
    code: nonEmpty,
    regime: z.enum(['error', 'warning']),
    severity: z.enum(['info', 'quality', 'important']).nullable(),
    sectionId: z.string().nullable(),
    sceneId: z.string().nullable(),
    field: z.string().nullable(),
    message: nonEmpty,
    repair: nonEmpty,
  })
  .strict();

const durationAssessmentSchema = z.enum(['point_below', 'margin_crosses', 'margin_clear']);

const durationCalibrationSchema = z
  .object({
    calibrationVersion: z.number().int().positive(),
    key: z
      .object({
        provider: z.literal('elevenlabs'),
        voiceId: nonEmpty,
        modelId: nonEmpty,
        seed: z.number().int(),
        language: z.literal('en'),
      })
      .strict(),
    basis: z.literal('authored_utf16_units'),
    pointMsPerUnit: z.number().positive(),
    uncertaintyMargin: z.number().min(0).max(1),
    lowerMsPerUnit: z.number().positive(),
    upperMsPerUnit: z.number().positive(),
    evidence: z
      .object({
        takeId: nonEmpty,
        beatCount: z.number().int().positive(),
        authoredUtf16Units: z.number().int().positive(),
        observedRangeMsPerUnit: z.tuple([z.number().positive(), z.number().positive()]),
      })
      .strict(),
  })
  .strict();

const durationEstimateSchema = z
  .object({
    lowerMs: z.number().nonnegative(),
    pointMs: z.number().nonnegative(),
    upperMs: z.number().nonnegative(),
    lowerFrames: z.number().int().nonnegative(),
    pointFrames: z.number().int().nonnegative(),
    upperFrames: z.number().int().nonnegative(),
  })
  .strict();

const durationThresholdSchema = z
  .object({ frames: z.number().int().nonnegative(), assessment: durationAssessmentSchema })
  .strict();

const durationSceneSchema = z
  .object({
    sectionId: nonEmpty,
    sceneId: nonEmpty,
    capabilityId: nonEmpty,
    authoredUtf16Units: z.number().int().nonnegative(),
    estimate: durationEstimateSchema,
    minimum: durationThresholdSchema,
    recommended: durationThresholdSchema,
    guidance: nonEmpty,
  })
  .strict();

const durationSummarySchema = z
  .object({
    minimum: z.record(durationAssessmentSchema, z.number().int().nonnegative()),
    recommended: z.record(durationAssessmentSchema, z.number().int().nonnegative()),
  })
  .strict();

const durationReportSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('available'),
      reasonCode: z.null(),
      calibration: durationCalibrationSchema,
      summary: durationSummarySchema,
      scenes: z.array(durationSceneSchema),
    })
    .strict(),
  z
    .object({
      status: z.literal('unavailable'),
      reasonCode: z.enum(['CALIBRATION_MISSING', 'CALIBRATION_INVALIDATED']),
      calibration: z.null(),
      summary: z.null(),
      scenes: z.null(),
    })
    .strict(),
]);

export const preflightReportSchema = z
  .object({
    reportVersion: z.literal(1),
    authority: z.literal('advisory'),
    planChecks: z
      .object({
        findingCount: z.number().int().nonnegative(),
        findings: z.array(preflightFindingSchema),
      })
      .strict(),
    duration: durationReportSchema,
    limitations: z.array(nonEmpty).min(1),
  })
  .strict();

export const commandDataSchemas = {
  'contract.index': z
    .object({
      categories: z.array(
        z
          .object({
            id: contractCategorySchema,
            summary: nonEmpty,
            audience: z.array(contractAudienceSchema).min(1),
          })
          .strict(),
      ),
    })
    .strict(),
  'contract.show': z
    .object({
      category: contractCategorySchema,
      contractVersion: z.number().int().positive(),
      contract: z.record(z.string(), z.unknown()),
    })
    .strict(),
  'run.init': z.object({ created: z.literal(true) }).strict(),
  'run.status': z
    .object({
      staleStages: z.array(runStageSchema),
      lastOutcome: commandOutcomeSchema,
      artifacts: z.array(artifactDescriptorSchema),
      imageRecoveryPolicy: imageRecoveryPolicySchema
        .extend({
          nextImageDispatchAt: z.iso.datetime({ offset: true }),
          attemptsUsed: z.number().int().nonnegative(),
        })
        .optional(),
    })
    .strict(),
  'run.decline': declineSchema,
  'run.validate': z.object({ report: compilerSummarySchema }).strict(),
  'run.preflight': z.object({ report: preflightReportSchema }).strict(),
  'run.record': z
    .object({
      disposition: z.enum(['reused', 'recorded', 'replacement_recorded']),
      takeId: nonEmpty,
      newTakesUsed: z.number().int().nonnegative(),
      maxNewTakes: z.number().int().nonnegative(),
    })
    .strict(),
  'run.compile': z
    .object({ report: compilerSummarySchema, assetWorklist: z.array(assetWorkItemSchema) })
    .strict(),
  'run.render': z.object({ preview: artifactDescriptorSchema }).strict(),
  'run.image.start': z.union([
    z
      .object({
        disposition: z.enum(['created', 'reused']),
        providerMode: z.enum(['recorded', 'live']),
        job: imageJobSchema,
      })
      .strict(),
    z.object({ reason: z.literal('IMAGE_AUTHORIZATION_REQUIRED') }).strict(),
    z
      .object({ reason: z.literal('IMAGE_RATE_WAIT'), notBefore: z.iso.datetime({ offset: true }) })
      .strict(),
  ]),
  'run.image.status': z.object({ job: imageJobSchema }).strict(),
  'run.image.accept': z.object({ job: imageJobSchema }).strict(),
  'run.image.reject': z.object({ job: imageJobSchema }).strict(),
} as const;

export const resultEnvelopeSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    command: commandIdSchema.nullable(),
    outcome: commandOutcomeSchema,
    run: z.object({ id: nonEmpty, stage: runStageSchema }).strict().nullable(),
    data: z.record(z.string(), z.unknown()).nullable(),
    artifacts: z.array(artifactDescriptorSchema),
    error: z
      .object({ code: nonEmpty, message: nonEmpty, details: z.unknown().nullable() })
      .strict()
      .nullable(),
    next: z.array(
      z.object({ command: commandIdSchema, args: z.array(z.string()), reason: nonEmpty }).strict(),
    ),
  })
  .strict();

export type ContractCategory = z.infer<typeof contractCategorySchema>;
export type ContractAudience = z.infer<typeof contractAudienceSchema>;
export type CommandId = z.infer<typeof commandIdSchema>;
export type RunStage = z.infer<typeof runStageSchema>;
export type CommandOutcome = z.infer<typeof commandOutcomeSchema>;
export type ProductionRequest = z.infer<typeof productionRequestSchema>;
export type Decline = z.infer<typeof declineSchema>;
export type ReplacementGrant = z.infer<typeof replacementGrantSchema>;
export type ImageGenerationRequest = z.infer<typeof imageGenerationRequestSchema>;
export type ImageGenerationGrant = z.infer<typeof imageGenerationGrantSchema>;
export type ImageAcceptance = z.infer<typeof imageAcceptanceSchema>;
export type ImageRejection = z.infer<typeof imageRejectionSchema>;
export type ImageCandidate = z.infer<typeof imageCandidateSchema>;
export type ImageJob = z.infer<typeof imageJobSchema>;
export type ArtifactDescriptor = z.infer<typeof artifactDescriptorSchema>;
export type ResultEnvelope = z.infer<typeof resultEnvelopeSchema>;
export type PreflightReport = z.infer<typeof preflightReportSchema>;
