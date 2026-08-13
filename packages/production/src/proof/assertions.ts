import { isDeepStrictEqual } from 'node:util';

export type ProofAssertion = {
  id: string;
  expected: unknown;
  observed: unknown;
  pass: boolean;
  evidence: string[];
};

export type NorthbridgeObservations = {
  authorship: { kind: 'fixture-scripted' | 'fresh-generalist'; unscripted: boolean };
  isolation: {
    initialFiles: string[];
    workRootReadWrite: boolean;
    repositoryDenied: boolean;
    serviceDenied: boolean;
    credentialsDenied: boolean;
    credentialsEnvironmentDenied: boolean;
    writesContained: boolean;
  };
  leakScan: { pass: boolean; violations: string[] };
  contracts: {
    categories: string[];
    allCommandsObserved: boolean;
    agentDiscoveryObserved: boolean;
  };
  processContract: { envelopesValid: boolean; stderrValid: boolean; exitsValid: boolean };
  network: { providerDispatchCount: number; commandViolations: string[]; directDenied: boolean };
  limits: {
    planVersions: number;
    validateCalls: number;
    preflightCalls: number;
    postRecordPlanVersions: number;
    humanHints: number;
  };
  run: {
    stage: string | null;
    bindingsFresh: boolean;
    receiptChainValid: boolean;
    attestationsValid: boolean;
    artifactHashesValid: boolean;
    recordingInputBound: boolean;
    takeVerified: boolean;
    foldCurrent: boolean;
    recordDispositions: string[];
    recordTakeIds: string[];
    newTakesUsed: number | null;
  };
  scenario: {
    capabilities: string[];
    highlightMarch: boolean;
    uniqueMarchWordAnchor: boolean;
    northbridgeAssetRequirement: boolean;
  };
  preflight: { advisory: boolean; minimumRiskCleared: boolean };
  assets: { northbridgeStatus: string | null; failedCount: number };
  compilation: { ok: boolean; errorCount: number };
  media: {
    videoCodec: string | null;
    audioCodec: string | null;
    previewAudioNonSilent: boolean;
    takeAudioNonSilent: boolean;
    takeDurationSeconds: number | null;
    previewDurationSeconds: number | null;
  };
  probes: {
    statusReadOnly: boolean;
    paused: boolean;
    invalidGrantFailed: boolean;
    preservedMainRun: boolean;
  };
  evidence: { transcriptRecords: number; commandRecords: number };
};

const item = (
  id: string,
  expected: unknown,
  observed: unknown,
  evidence: string[],
  predicate?: (value: unknown) => boolean,
): ProofAssertion => ({
  id,
  expected,
  observed,
  pass:
    evidence.length > 0 &&
    (predicate ? predicate(observed) : isDeepStrictEqual(observed, expected)),
  evidence,
});

const between =
  (minimum: number, maximum: number) =>
  (value: unknown): boolean =>
    typeof value === 'number' && value >= minimum && value <= maximum;

export const evaluateNorthbridgeAssertions = (
  observed: NorthbridgeObservations,
): ProofAssertion[] => [
  item('agent.unscripted-generalist', true, observed.authorship.unscripted, ['environment.json']),
  item(
    'isolation.initial-two-files',
    ['request.json', 'vox.exe'],
    observed.isolation.initialFiles,
    ['initial-inventory.json'],
  ),
  item('isolation.work-root-readwrite', true, observed.isolation.workRootReadWrite, [
    'permissions.json',
  ]),
  item('isolation.repository-denied', true, observed.isolation.repositoryDenied, [
    'permissions.json',
  ]),
  item('isolation.service-denied', true, observed.isolation.serviceDenied, ['permissions.json']),
  item('isolation.credentials-denied', true, observed.isolation.credentialsDenied, [
    'permissions.json',
  ]),
  item(
    'isolation.credentials-environment-denied',
    true,
    observed.isolation.credentialsEnvironmentDenied,
    ['permissions.json'],
  ),
  item('isolation.write-containment', true, observed.isolation.writesContained, ['commands.jsonl']),
  item('leaks.agent-readable-files', true, observed.leakScan.pass, ['leak-scan.json']),
  item(
    'contracts.all-categories',
    ['catalog', 'checks', 'language', 'plan', 'protocol'],
    [...observed.contracts.categories].sort(),
    ['commands.jsonl'],
  ),
  item('contracts.all-public-commands', true, observed.contracts.allCommandsObserved, [
    'commands.jsonl',
  ]),
  item('contracts.agent-discovery', true, observed.contracts.agentDiscoveryObserved, [
    'commands.jsonl',
  ]),
  item('process.stdout-envelopes', true, observed.processContract.envelopesValid, [
    'commands.jsonl',
  ]),
  item('process.stderr-contract', true, observed.processContract.stderrValid, ['commands.jsonl']),
  item('process.exit-contract', true, observed.processContract.exitsValid, ['commands.jsonl']),
  item('network.record-only', [], observed.network.commandViolations, ['network-audit.json']),
  item('network.agent-direct-denied', true, observed.network.directDenied, ['network-audit.json']),
  item('network.one-provider-dispatch', 1, observed.network.providerDispatchCount, [
    'network-audit.json',
  ]),
  item(
    'limits.plan-versions',
    '<=5',
    observed.limits.planVersions,
    ['agent-transcript.jsonl'],
    (value) => between(1, 5)(value),
  ),
  item('limits.validate-calls', '<=5', observed.limits.validateCalls, ['commands.jsonl'], (value) =>
    between(1, 5)(value),
  ),
  item(
    'limits.preflight-calls',
    '<=3',
    observed.limits.preflightCalls,
    ['commands.jsonl'],
    (value) => between(1, 3)(value),
  ),
  item(
    'limits.post-record-plan-versions',
    '<=2',
    observed.limits.postRecordPlanVersions,
    ['agent-transcript.jsonl'],
    (value) => between(0, 2)(value),
  ),
  item('limits.no-human-hints', 0, observed.limits.humanHints, ['agent-transcript.jsonl']),
  item('run.rendered', 'rendered', observed.run.stage, ['main-run/run.json']),
  item('run.bindings-fresh', true, observed.run.bindingsFresh, ['main-run/run.json']),
  item('run.receipt-chain', true, observed.run.receiptChainValid, ['main-run/run.json']),
  item('run.attestations', true, observed.run.attestationsValid, ['main-run/run.json']),
  item('run.artifact-hashes', true, observed.run.artifactHashesValid, ['main-run/run.json']),
  item('recording.input-bound', true, observed.run.recordingInputBound, ['main-run/run.json']),
  item('take.verified', true, observed.run.takeVerified, ['main-run/run.json']),
  item('take.fold-current', true, observed.run.foldCurrent, ['main-run/run.json']),
  item('record.verified-reuse', ['recorded', 'reused'], observed.run.recordDispositions, [
    'commands.jsonl',
  ]),
  item(
    'record.same-take',
    true,
    observed.run.recordTakeIds.length === 2 &&
      observed.run.recordTakeIds[0] === observed.run.recordTakeIds[1],
    ['commands.jsonl'],
  ),
  item('record.one-take-used', 1, observed.run.newTakesUsed, ['main-run/run.json']),
  item(
    'scenario.both-capabilities',
    ['bar_chart', 'image_context'],
    [...observed.scenario.capabilities].sort(),
    ['main-run/inputs'],
  ),
  item('scenario.highlight-march', true, observed.scenario.highlightMarch, ['main-run/inputs']),
  item('scenario.unique-word-anchor', true, observed.scenario.uniqueMarchWordAnchor, [
    'main-run/inputs',
  ]),
  item('scenario.opening-asset-requirement', true, observed.scenario.northbridgeAssetRequirement, [
    'main-run/inputs',
  ]),
  item('preflight.advisory-wording', true, observed.preflight.advisory, ['main-run/artifacts']),
  item('preflight.minimum-risk-cleared', true, observed.preflight.minimumRiskCleared, [
    'main-run/artifacts',
  ]),
  item('assets.northbridge-placeholder', 'placeholder', observed.assets.northbridgeStatus, [
    'main-run/run.json',
  ]),
  item('assets.none-failed', 0, observed.assets.failedCount, ['main-run/run.json']),
  item('compile.green', true, observed.compilation.ok, ['main-run/artifacts']),
  item('compile.zero-errors', 0, observed.compilation.errorCount, ['main-run/artifacts']),
  item('media.h264-video', 'h264', observed.media.videoCodec, ['ffprobe.json']),
  item('media.aac-audio', 'aac', observed.media.audioCodec, ['ffprobe.json']),
  item('media.preview-audio-non-silent', true, observed.media.previewAudioNonSilent, [
    'ffprobe.json',
  ]),
  item('media.take-audio-non-silent', true, observed.media.takeAudioNonSilent, ['ffprobe.json']),
  item(
    'media.take-duration',
    '20..30',
    observed.media.takeDurationSeconds,
    ['ffprobe.json'],
    between(20, 30),
  ),
  item(
    'media.preview-duration',
    '20..30',
    observed.media.previewDurationSeconds,
    ['ffprobe.json'],
    between(20, 30),
  ),
  item('probe.status-read-only', true, observed.probes.statusReadOnly, ['commands.jsonl']),
  item('probe.zero-budget-paused', true, observed.probes.paused, ['commands.jsonl']),
  item('probe.invalid-grant-failed', true, observed.probes.invalidGrantFailed, ['commands.jsonl']),
  item('probe.main-run-preserved', true, observed.probes.preservedMainRun, ['main-run/run.json']),
  item(
    'evidence.agent-transcript',
    '>0',
    observed.evidence.transcriptRecords,
    ['agent-transcript.jsonl'],
    (value) => typeof value === 'number' && value > 0,
  ),
  item(
    'evidence.command-transcript',
    '>0',
    observed.evidence.commandRecords,
    ['commands.jsonl'],
    (value) => typeof value === 'number' && value > 0,
  ),
];

export const machineVerdict = (assertions: ProofAssertion[]): 'pass' | 'fail' =>
  assertions.length > 0 && assertions.every((assertion) => assertion.pass) ? 'pass' : 'fail';
