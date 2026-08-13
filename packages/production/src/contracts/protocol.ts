import type { CommandId, ContractCategory } from './schemas';

export const CONTRACT_CATEGORIES: readonly {
  id: ContractCategory;
  summary: string;
  contractVersion: number;
}[] = [
  { id: 'language', summary: 'Vox Studio domain terms and avoided synonyms.', contractVersion: 1 },
  {
    id: 'plan',
    summary: 'VideoPlan JSON Schema and validated full-plan examples.',
    contractVersion: 1,
  },
  {
    id: 'catalog',
    summary: 'Scene capabilities, semantic time and compiler checks.',
    contractVersion: 3,
  },
  { id: 'checks', summary: 'Compiler error and warning meanings and repairs.', contractVersion: 1 },
  {
    id: 'protocol',
    summary: 'Production commands, stages, outcomes and operating rules.',
    contractVersion: 1,
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
    syntax: 'vox production contract show <language|plan|catalog|checks|protocol>',
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
];

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
  resume: {
    immutableResultsAreContentAddressed: true,
    identicalOperationsReuseVerifiedResults: true,
    everyConsumerReverifiesDirectInputs: true,
    stageIsHighestFreshStage: true,
    staleHistoryRemainsVisible: true,
  },
} as const;
