import { isDeepStrictEqual } from 'node:util';

/**
 * `not-evidenced` is the third outcome, and it exists because its absence made a whole section
 * of this sheet vacuous. The isolation assertions used to fall back to probes measured against a
 * restricted token — what such a token *would* be denied — whenever the driver supplied no
 * sandbox of its own, so a driver that measured nothing passed every one of them while its
 * process may have read the repository at will.
 *
 * A run may legitimately be unable to measure something. What it may not do is report the gap as
 * a pass. `not-evidenced` is not a failure either: nothing was found wrong, nothing was shown
 * right, and the bundle says which.
 */
export type ProofOutcome = 'pass' | 'fail' | 'not-evidenced';

/**
 * `null` means the run could not measure this, and is distinct from `false`, which means it
 * measured a breach. Only observations that a driver can genuinely leave unmeasured use it —
 * elsewhere `null` keeps its ordinary meaning of an absent value, which fails.
 */
export type EvidencedBoolean = boolean | null;

export type ProofAssertion = {
  id: string;
  expected: unknown;
  observed: unknown;
  outcome: ProofOutcome;
  /** `false` for both `fail` and `not-evidenced`: neither is a pass. Read `outcome` to tell. */
  pass: boolean;
  evidence: string[];
};

export type NorthbridgeObservations = {
  authorship: { kind: 'fixture-scripted' | 'fresh-generalist'; unscripted: boolean };
  isolation: {
    /** Measured by the harness on the work root itself, so it is evidenced for every driver. */
    initialFiles: string[];
    workRootReadWrite: EvidencedBoolean;
    repositoryDenied: EvidencedBoolean;
    serviceDenied: EvidencedBoolean;
    credentialsDenied: EvidencedBoolean;
    credentialsEnvironmentDenied: EvidencedBoolean;
    /** Measured from the recorded commands, not from anything the agent reports about itself. */
    writesContained: boolean;
  };
  leakScan: { pass: boolean; violations: string[] };
  contracts: {
    categories: string[];
    allCommandsObserved: boolean;
    agentDiscoveryObserved: boolean;
  };
  processContract: { envelopesValid: boolean; stderrValid: boolean; exitsValid: boolean };
  network: {
    providerDispatchCount: number;
    commandViolations: string[];
    /** Self-reported unless a sandbox measured it, so a driver with no sandbox leaves it null. */
    directDenied: EvidencedBoolean;
  };
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
    sceneCount: number;
    eventDrivenCapabilities: string[];
    showcaseAssetRequirement: boolean;
    showcasePlanCompliant: boolean;
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
): ProofAssertion => {
  const pass =
    evidence.length > 0 &&
    (predicate ? predicate(observed) : isDeepStrictEqual(observed, expected));
  return { id, expected, observed, outcome: pass ? 'pass' : 'fail', pass, evidence };
};

/**
 * An assertion over something the run may have been unable to measure. The unmeasured case is
 * written into the bundle as the word rather than as a missing field, so a reader of
 * `assertions.json` sees the gap without having to know which fields were nullable.
 */
const evidencedItem = (
  id: string,
  expected: unknown,
  observed: EvidencedBoolean,
  evidence: string[],
): ProofAssertion =>
  observed === null
    ? {
        id,
        expected,
        observed: 'not-evidenced',
        outcome: 'not-evidenced',
        pass: false,
        evidence,
      }
    : item(id, expected, observed, evidence);

const between =
  (minimum: number, maximum: number) =>
  (value: unknown): boolean =>
    typeof value === 'number' && value >= minimum && value <= maximum;

/**
 * How many validate→Preflight repair cycles a Brief of this length is allowed before recording.
 *
 * Ticket 09 froze the short proof's budget as three Preflight calls, five `validate` calls and
 * five submitted plan versions. Those are absolute counts, and absolute counts do not survive a
 * Brief six times longer: the 3-minute run converged cleanly in four cycles and failed a budget
 * calibrated for 25 seconds. Expressing the budget per unit of the content the Brief asks for
 * keeps it binding at every length instead of moving the wall each time.
 *
 * The input is the Brief's own target duration, never anything the agent chooses. A budget keyed
 * on scene or beat count would let an agent buy itself repair attempts by splitting its plan.
 *
 * At 25 s this returns 3, so the short proof's 3/5/5 is reproduced exactly and the two paid
 * bundles keep the semantics they were judged under.
 */
export const repairCycleBudget = (targetSeconds: number): number =>
  2 + Math.ceil(targetSeconds / 60);

/**
 * `durationBounds` is the window the Take and preview must land in; `targetSeconds` is the
 * duration the Brief asks for, which sets the repair budget. Both default to the frozen short
 * proof's values so every existing caller and every existing evidence bundle keeps its exact
 * meaning; the long-form variant passes its own.
 */
export const evaluateNorthbridgeAssertions = (
  observed: NorthbridgeObservations,
  options: {
    durationBounds?: readonly [number, number];
    targetSeconds?: number;
    scenario?: 'northbridge' | 'catalog-showcase';
    expectedCapabilities?: readonly string[];
  } = {},
): ProofAssertion[] => {
  const [minimumSeconds, maximumSeconds] = options.durationBounds ?? [20, 30];
  const durationWindow = `${minimumSeconds}..${maximumSeconds}`;
  const cycles = repairCycleBudget(options.targetSeconds ?? 25);
  const authoringVersions = cycles + 2;
  const scenarioAssertions =
    options.scenario === 'catalog-showcase'
      ? [
          item(
            'scenario.current-catalog-capabilities',
            [...(options.expectedCapabilities ?? [])].sort(),
            [...observed.scenario.capabilities].sort(),
            ['main-run/inputs'],
          ),
          item('scenario.exactly-eight-scenes', 8, observed.scenario.sceneCount, [
            'main-run/inputs',
          ]),
          item(
            'scenario.every-capability-event-driven',
            [...(options.expectedCapabilities ?? [])].sort(),
            [...observed.scenario.eventDrivenCapabilities].sort(),
            ['main-run/inputs'],
          ),
          item(
            'scenario.opening-image-requirement',
            true,
            observed.scenario.showcaseAssetRequirement,
            ['main-run/inputs'],
          ),
          item('scenario.brief-compliance', true, observed.scenario.showcasePlanCompliant, [
            'main-run/inputs',
          ]),
        ]
      : [
          item(
            'scenario.both-capabilities',
            ['bar_chart', 'image_context'],
            [...observed.scenario.capabilities].sort(),
            ['main-run/inputs'],
          ),
          item('scenario.highlight-march', true, observed.scenario.highlightMarch, [
            'main-run/inputs',
          ]),
          item('scenario.unique-word-anchor', true, observed.scenario.uniqueMarchWordAnchor, [
            'main-run/inputs',
          ]),
          item(
            'scenario.opening-asset-requirement',
            true,
            observed.scenario.northbridgeAssetRequirement,
            ['main-run/inputs'],
          ),
        ];
  const assetAssertion =
    options.scenario === 'catalog-showcase'
      ? item('assets.showcase-placeholder', 'placeholder', observed.assets.northbridgeStatus, [
          'main-run/run.json',
        ])
      : item('assets.northbridge-placeholder', 'placeholder', observed.assets.northbridgeStatus, [
          'main-run/run.json',
        ]);
  return [
    item('agent.unscripted-generalist', true, observed.authorship.unscripted, ['environment.json']),
    item(
      'isolation.initial-two-files',
      ['request.json', 'vox.exe'],
      observed.isolation.initialFiles,
      ['initial-inventory.json'],
    ),
    evidencedItem('isolation.work-root-readwrite', true, observed.isolation.workRootReadWrite, [
      'permissions.json',
    ]),
    evidencedItem('isolation.repository-denied', true, observed.isolation.repositoryDenied, [
      'permissions.json',
    ]),
    evidencedItem('isolation.service-denied', true, observed.isolation.serviceDenied, [
      'permissions.json',
    ]),
    evidencedItem('isolation.credentials-denied', true, observed.isolation.credentialsDenied, [
      'permissions.json',
    ]),
    evidencedItem(
      'isolation.credentials-environment-denied',
      true,
      observed.isolation.credentialsEnvironmentDenied,
      ['permissions.json'],
    ),
    item('isolation.write-containment', true, observed.isolation.writesContained, [
      'commands.jsonl',
    ]),
    item('leaks.agent-readable-files', true, observed.leakScan.pass, ['leak-scan.json']),
    item(
      'contracts.all-categories',
      // Restated rather than derived: an expectation taken from the table the harness drives
      // from would be the observation agreeing with itself.
      ['catalog', 'checks', 'design', 'language', 'operating', 'plan', 'protocol'],
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
    evidencedItem('network.agent-direct-denied', true, observed.network.directDenied, [
      'network-audit.json',
    ]),
    item('network.one-provider-dispatch', 1, observed.network.providerDispatchCount, [
      'network-audit.json',
    ]),
    item(
      'limits.plan-versions',
      `<=${authoringVersions}`,
      observed.limits.planVersions,
      ['agent-transcript.jsonl'],
      (value) => between(1, authoringVersions)(value),
    ),
    item(
      'limits.validate-calls',
      `<=${authoringVersions}`,
      observed.limits.validateCalls,
      ['commands.jsonl'],
      (value) => between(1, authoringVersions)(value),
    ),
    item(
      'limits.preflight-calls',
      `<=${cycles}`,
      observed.limits.preflightCalls,
      ['commands.jsonl'],
      (value) => between(1, cycles)(value),
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
    ...scenarioAssertions,
    item('preflight.advisory-wording', true, observed.preflight.advisory, ['main-run/artifacts']),
    item('preflight.minimum-risk-cleared', true, observed.preflight.minimumRiskCleared, [
      'main-run/artifacts',
    ]),
    assetAssertion,
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
      durationWindow,
      observed.media.takeDurationSeconds,
      ['ffprobe.json'],
      between(minimumSeconds, maximumSeconds),
    ),
    item(
      'media.preview-duration',
      durationWindow,
      observed.media.previewDurationSeconds,
      ['ffprobe.json'],
      between(minimumSeconds, maximumSeconds),
    ),
    item('probe.status-read-only', true, observed.probes.statusReadOnly, ['commands.jsonl']),
    item('probe.zero-budget-paused', true, observed.probes.paused, ['commands.jsonl']),
    item('probe.invalid-grant-failed', true, observed.probes.invalidGrantFailed, [
      'commands.jsonl',
    ]),
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
};

/**
 * Reads a sheet that may predate the third outcome. Evidence bundles written before `outcome`
 * existed carry only `pass`, and they are frozen: they must keep verifying and must keep meaning
 * what they meant. `pass` maps onto the two outcomes it could then express without ambiguity, so
 * an old bundle reads as itself rather than as malformed — and, importantly, an old failure is
 * still read as a failure rather than as an absent field.
 */
export const withOutcomes = (
  assertions: Array<Omit<ProofAssertion, 'outcome'> & { outcome?: ProofOutcome }>,
): ProofAssertion[] =>
  assertions.map((assertion) => ({
    ...assertion,
    outcome: assertion.outcome ?? (assertion.pass ? 'pass' : 'fail'),
  }));

/**
 * The aggregate is the worst outcome present, with `fail` above `not-evidenced`: a run that both
 * failed something and could not measure something else is a failure, not an unmeasured run. An
 * empty sheet is a failure, because a sheet that asserts nothing has proved nothing.
 *
 * `not-evidenced` deliberately is not a pass. A crew phase that cannot evidence code-blindness
 * still gets a verdict distinguishable from a run that was measured and found wanting, which is
 * the whole point of keeping the third outcome instead of folding it into `fail`.
 */
export const machineVerdict = (assertions: ProofAssertion[]): ProofOutcome => {
  if (assertions.length === 0) return 'fail';
  if (assertions.some((assertion) => assertion.outcome === 'fail')) return 'fail';
  if (assertions.some((assertion) => assertion.outcome === 'not-evidenced')) return 'not-evidenced';
  return 'pass';
};
