import type { CommandId, ContractAudience, ContractCategory } from './schemas';

/**
 * Every category the contract publishes, in the order the index publishes them, with the
 * audience each is addressed to.
 *
 * The audience is the contract's own statement of its readership, added by ticket 25. Before it,
 * a consumer assembling a prompt had to read everything or invent a rule about what to skip, and
 * the first was costing an author 20.4% of every turn on a machine it is structurally forbidden
 * from operating. Naming the readership here puts the decision with the document rather than
 * with whoever reads it.
 */
export const CONTRACT_CATEGORIES: readonly {
  id: ContractCategory;
  summary: string;
  contractVersion: number;
  audience: readonly ContractAudience[];
}[] = [
  {
    id: 'language',
    summary: 'Vox Studio domain terms and avoided synonyms.',
    contractVersion: 1,
    audience: ['author'],
  },
  {
    id: 'plan',
    summary: 'VideoPlan JSON Schema and validated full-plan examples.',
    contractVersion: 1,
    audience: ['author'],
  },
  {
    /**
     * Version 6 publishes the design system's closed visual vocabulary, which the art
     * direction an author receives has to be selectable from.
     *
     * Version 5 publishes generated capability-tier membership and role projections.
     * Version 4 removed the compiler checks, which the `checks` category publishes.
     *
     * The summary followed the document: two categories that both claimed the checks were the
     * readable symptom of publishing one document twice.
     */
    id: 'catalog',
    summary: 'Scene capabilities and semantic time.',
    contractVersion: 6,
    audience: ['author', 'client'],
  },
  {
    id: 'checks',
    summary: 'Compiler error and warning meanings and repairs.',
    contractVersion: 1,
    audience: ['author', 'client'],
  },
  {
    /**
     * Version 1, and new: the operating rules a plan is authored and repaired against, which
     * were published inside `protocol` until ticket 25 separated them from the command surface
     * they sat beside. What moved is where they are published, not what they say.
     */
    id: 'operating',
    summary: 'Preflight authority, recording quota and repair rules.',
    contractVersion: 1,
    audience: ['author', 'client'],
  },
  {
    /**
     * Version 1, and new: what each published theme resolves its semantic colour roles to.
     *
     * Addressed to clients alone, which is the whole point of it being its own category. The
     * catalog an author reads names colour roles and never their values; a deterministic tool
     * composing an image prompt needs the values, and it is not an author.
     */
    id: 'design',
    summary: 'Resolved theme palettes for deterministic client-side composition.',
    contractVersion: 1,
    audience: ['client'],
  },
  {
    /**
     * Version 3 publishes the generated-image job, review and promotion lifecycle.
     *
     * Version 2 lifted the operating rules into the `operating` category, and the summary
     * followed the document — it claimed "operating rules" while publishing them elsewhere.
     */
    id: 'protocol',
    summary: 'Production commands, stages, outcomes and transport.',
    contractVersion: 3,
    audience: ['client'],
  },
];

type CommandContract = {
  id: CommandId;
  syntax: string;
  prerequisite: string;
  effect: string;
  readOnly: boolean;
  network: 'forbidden' | 'record_only';
  quota: 'never' | 'may_spend';
};

const commands: readonly CommandContract[] = [
  {
    id: 'contract.index',
    syntax: 'vox production contract index',
    prerequisite: 'none',
    effect: 'Return the compact Authoring knowledge frame index.',
    readOnly: true,
    network: 'forbidden',
    quota: 'never',
  },
  {
    id: 'contract.show',
    syntax: 'vox production contract show <language|plan|catalog|checks|operating|protocol>',
    prerequisite: 'one published category id',
    effect: 'Return one generated versioned contract projection.',
    readOnly: true,
    network: 'forbidden',
    quota: 'never',
  },
  {
    id: 'run.init',
    syntax: 'vox production run init --request <request.json> --out <run-dir>',
    prerequisite: 'valid request and a non-existing contained output root',
    effect: 'Create a persistent Run at initialized.',
    readOnly: false,
    network: 'forbidden',
    quota: 'never',
  },
  {
    id: 'run.status',
    syntax: 'vox production run status --run <run-dir>',
    prerequisite: 'an existing Run',
    effect: 'Verify and report current state without changing it.',
    readOnly: true,
    network: 'forbidden',
    quota: 'never',
  },
  {
    id: 'run.decline',
    syntax: 'vox production run decline --run <run-dir> --decision <decline.json>',
    prerequisite: 'no Take has been recorded or reused',
    effect: 'Terminate at declined while preserving any draft plan.',
    readOnly: false,
    network: 'forbidden',
    quota: 'never',
  },
  {
    id: 'run.validate',
    syntax: 'vox production run validate --run <run-dir> --plan <plan.json>',
    prerequisite: 'a non-terminal Run and readable plan',
    effect: 'Validate without mutating the plan and bind a green immutable snapshot.',
    readOnly: false,
    network: 'forbidden',
    quota: 'never',
  },
  {
    id: 'run.preflight',
    syntax: 'vox production run preflight --run <run-dir>',
    prerequisite: 'a fresh green validation',
    effect: 'Publish plan-only checks and advisory duration assessment.',
    readOnly: false,
    network: 'forbidden',
    quota: 'never',
  },
  {
    id: 'run.record',
    syntax: 'vox production run record --run <run-dir> [--replacement-authorisation <grant.json>]',
    prerequisite: 'fresh validation and Preflight; grant only for an identical-input replacement',
    effect: 'Reuse a verified Take or perform one authorised synthesis dispatch.',
    readOnly: false,
    network: 'record_only',
    quota: 'may_spend',
  },
  {
    id: 'run.compile',
    syntax: 'vox production run compile --run <run-dir>',
    prerequisite: 'fresh validation and Preflight plus a verified matching Take',
    effect: 'Compile authoritatively without network or quota.',
    readOnly: false,
    network: 'forbidden',
    quota: 'never',
  },
  {
    id: 'run.render',
    syntax: 'vox production run render --run <run-dir>',
    prerequisite: 'a fresh green compilation and Compiled document',
    effect: 'Render the bound document without network or quota.',
    readOnly: false,
    network: 'forbidden',
    quota: 'never',
  },
  {
    id: 'run.image.start',
    syntax:
      'vox production run image-start --run <run-dir> --request <image-request.json> [--authorisation <grant.json>]',
    prerequisite: 'a compiled ASSET_PLACEHOLDER work item; grant when the image provider is live',
    effect:
      'Create or observe an identity-bound image job. After explicit rejection, a different request with a fresh exact grant may create a correction. A separate operator recovery policy permits retryOf naming the latest confirmed HTTP 429 job with the unchanged exact provider request; the predecessor, new grant and consumed attempt remain durable. Repeating retryOf observes that retry rather than dispatching again. run.status publishes the authorized image-attempt ceiling and nextImageDispatchAt; wait before a new dispatch. Uncertain work never permits retry. Without a recovery policy, failed jobs remain blocked. Operator envelopes issue exact grants internally; all jobs count toward the effective image ceiling.',
    readOnly: false,
    network: 'record_only',
    quota: 'may_spend',
  },
  {
    id: 'run.image.status',
    syntax: 'vox production run image-status --run <run-dir> --job <job-id>',
    prerequisite: 'an image job belonging to the Run',
    effect: 'Observe the existing image job without starting or retrying generation.',
    readOnly: true,
    network: 'forbidden',
    quota: 'never',
  },
  {
    id: 'run.image.accept',
    syntax: 'vox production run image-accept --run <run-dir> --decision <acceptance.json>',
    prerequisite: 'a candidate and a decision naming its exact digest',
    effect: 'Promote the candidate for this Run and stale compilations that used a placeholder.',
    readOnly: false,
    network: 'forbidden',
    quota: 'never',
  },
  {
    id: 'run.image.reject',
    syntax: 'vox production run image-reject --run <run-dir> --decision <rejection.json>',
    prerequisite: 'an inspectable candidate, or an accepted image with candidateSha256 and reason',
    effect:
      'Reject a pending candidate or withdraw exact accepted bytes with a reason. Preserve jobs, grants and quota; stale compilation and render bindings. Recompile before correcting the requirement.',
    readOnly: false,
    network: 'forbidden',
    quota: 'never',
  },
];

/**
 * The rules a plan is authored and repaired against — the half of what `protocol` used to
 * publish that a reader holding no client can still act on.
 *
 * All three are about the plan rather than about the machine. `preflight` is the assessment
 * vocabulary and the authority behind it, which an author reads in an advisory refusal;
 * `recording` is what a Take costs and when a matching one is reused for nothing, which is why
 * `repair` prefers reassigning Beats to rewriting narration. A repair authored after a Take
 * exists is authored against all three at once, which is the argument for publishing them
 * together and separately from the transport they sat beside.
 */
export const OPERATING_CONTRACT = {
  preflight: {
    authority: 'advisory',
    requiredBeforeRecord: true,
    risksBlockRecord: false,
    fabricatesTimings: false,
    pointMsPerAuthoredUtf16Unit: 66.25,
    uncertaintyMargin: 0.2,
    policyIntervalMsPerUnit: [53, 79.5],
    assessments: ['point_below', 'margin_crosses', 'margin_clear'],
    authoritativeStage: 'run.compile with a verified Take',
  },
  recording: {
    onlyNetworkCommand: 'run.record',
    recordingInput: 'ordered Beat text plus provider, voiceId, modelId and seed',
    verifiedMatchingTake: 'reuse without quota',
    firstDispatch: 'autonomous while maxNewTakes budget remains',
    identicalInputRedispatch: 'replacement grant required',
    exhaustedBudget: 'paused before network',
    uncertainDispatch: 'never retried automatically',
  },
  repair: {
    planChangeStales: ['validation', 'preflight', 'compilation', 'render'],
    takeRemainsReusableWhen: 'ordered Beat texts, segmentation and voice settings are unchanged',
    preferredDurationRepair: 'reassign or merge existing Beats before changing narration text',
    planIsNeverMutatedByProduction: true,
  },
} as const;

/**
 * How production is driven: the commands, the stages they move through, what they write to and
 * what they exit with. `OPERATING_CONTRACT` holds what a plan is authored against.
 */
export const PRODUCTION_CONTRACT = {
  protocolVersion: 1,
  commands,
  lifecycle: {
    successfulStages: [
      'initialized',
      'validated',
      'preflighted',
      'recorded',
      'compiled',
      'rendered',
    ],
    terminalStages: ['declined'],
    outcomes: ['succeeded', 'needs_repair', 'paused', 'declined', 'failed'],
    stageAndOutcomeAreIndependent: true,
  },
  transport: {
    input: 'named filesystem JSON flags',
    stdout: 'exactly one newline-terminated result envelope',
    stderr: 'optional redacted human diagnostics only',
    stdinJson: false,
    positionalJson: false,
  },
  exitCodes: {
    '0': ['succeeded', 'needs_repair', 'paused', 'declined'],
    '1': ['failed'],
    '2': ['malformed invocation', 'input prevented execution'],
  },
  writeBoundary: {
    root: '--out passed to run.init',
    inputsMayBeOutsideRoot: true,
    inputsAreNeverMutated: true,
    visibleWritesRemainBelowCanonicalRoot: true,
    symlinkAndReparseEscapesForbidden: true,
  },
  resume: {
    immutableResultsAreContentAddressed: true,
    identicalOperationsReuseVerifiedResults: true,
    everyConsumerReverifiesDirectInputs: true,
    stageIsHighestFreshStage: true,
    staleHistoryRemainsVisible: true,
  },
} as const;
