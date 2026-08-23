import { describe, expect, it } from 'vitest';
import {
  type NorthbridgeObservations,
  evaluateNorthbridgeAssertions,
  machineVerdict,
  repairCycleBudget,
  withOutcomes,
} from '../src/proof/assertions';

const passingObservations = (): NorthbridgeObservations => ({
  authorship: { kind: 'fresh-generalist', unscripted: true },
  isolation: {
    initialFiles: ['request.json', 'vox.exe'],
    workRootReadWrite: true,
    repositoryDenied: true,
    serviceDenied: true,
    credentialsDenied: true,
    credentialsEnvironmentDenied: true,
    writesContained: true,
  },
  leakScan: { pass: true, violations: [] },
  contracts: {
    categories: ['language', 'plan', 'catalog', 'checks', 'protocol'],
    allCommandsObserved: true,
    agentDiscoveryObserved: true,
  },
  processContract: { envelopesValid: true, stderrValid: true, exitsValid: true },
  network: { providerDispatchCount: 1, commandViolations: [], directDenied: true },
  limits: {
    planVersions: 1,
    validateCalls: 1,
    preflightCalls: 1,
    postRecordPlanVersions: 0,
    humanHints: 0,
  },
  run: {
    stage: 'rendered',
    bindingsFresh: true,
    receiptChainValid: true,
    attestationsValid: true,
    artifactHashesValid: true,
    recordingInputBound: true,
    takeVerified: true,
    foldCurrent: true,
    recordDispositions: ['recorded', 'reused'],
    recordTakeIds: ['abcdef123456', 'abcdef123456'],
    newTakesUsed: 1,
  },
  scenario: {
    capabilities: ['image_context', 'bar_chart'],
    highlightMarch: true,
    uniqueMarchWordAnchor: true,
    northbridgeAssetRequirement: true,
    sceneCount: 2,
    eventDrivenCapabilities: ['image_context', 'bar_chart'],
    showcaseAssetRequirement: false,
    showcasePlanCompliant: false,
  },
  preflight: { advisory: true, minimumRiskCleared: true },
  assets: { northbridgeStatus: 'placeholder', failedCount: 0 },
  compilation: { ok: true, errorCount: 0 },
  media: {
    videoCodec: 'h264',
    audioCodec: 'aac',
    previewAudioNonSilent: true,
    takeAudioNonSilent: true,
    takeDurationSeconds: 22,
    previewDurationSeconds: 22,
  },
  probes: {
    statusReadOnly: true,
    paused: true,
    invalidGrantFailed: true,
    preservedMainRun: true,
  },
  evidence: { transcriptRecords: 3, commandRecords: 20 },
});

describe('Northbridge machine assertions', () => {
  it('derives pass only when every itemized assertion is present and true', () => {
    const assertions = evaluateNorthbridgeAssertions(passingObservations());
    expect(assertions.length).toBeGreaterThan(40);
    expect(assertions.every((assertion) => assertion.evidence.length > 0)).toBe(true);
    expect(machineVerdict(assertions)).toBe('pass');
  });

  it('fails the network assertion and aggregate verdict independently', () => {
    const observations = passingObservations();
    observations.network.commandViolations = ['production run compile'];
    const assertions = evaluateNorthbridgeAssertions(observations);
    expect(assertions.find((assertion) => assertion.id === 'network.record-only')?.pass).toBe(
      false,
    );
    expect(machineVerdict(assertions)).toBe('fail');
  });

  it('fails a silent preview even when the recorded Take is audible', () => {
    const observations = passingObservations();
    observations.media.previewAudioNonSilent = false;
    const assertions = evaluateNorthbridgeAssertions(observations);
    expect(
      assertions.find((assertion) => assertion.id === 'media.preview-audio-non-silent')?.pass,
    ).toBe(false);
    expect(
      assertions.find((assertion) => assertion.id === 'media.take-audio-non-silent')?.pass,
    ).toBe(true);
    expect(machineVerdict(assertions)).toBe('fail');
  });

  it('fails when a production credential reaches the agent environment', () => {
    const observations = passingObservations();
    observations.isolation.credentialsEnvironmentDenied = false;
    const assertions = evaluateNorthbridgeAssertions(observations);
    expect(
      assertions.find((assertion) => assertion.id === 'isolation.credentials-environment-denied')
        ?.pass,
    ).toBe(false);
    expect(
      assertions.find((assertion) => assertion.id === 'leaks.agent-readable-files')?.pass,
    ).toBe(true);
    expect(machineVerdict(assertions)).toBe('fail');
  });

  it('reproduces the frozen short budget of 3 Preflight and 5 validate/plan versions', () => {
    const assertions = evaluateNorthbridgeAssertions(passingObservations());
    const expectedOf = (id: string) =>
      assertions.find((assertion) => assertion.id === id)?.expected;
    expect(expectedOf('limits.preflight-calls')).toBe('<=3');
    expect(expectedOf('limits.validate-calls')).toBe('<=5');
    expect(expectedOf('limits.plan-versions')).toBe('<=5');
  });

  it('scales the repair budget with the Brief duration instead of moving a constant', () => {
    expect(repairCycleBudget(25)).toBe(3);
    expect(repairCycleBudget(180)).toBe(5);

    // The 3-minute run that failed the old constant: 4 cycles, 4 validate calls, 4 versions.
    const observations = passingObservations();
    observations.limits = {
      planVersions: 4,
      validateCalls: 4,
      preflightCalls: 4,
      postRecordPlanVersions: 0,
      humanHints: 0,
    };
    observations.media.takeDurationSeconds = 183.181;
    observations.media.previewDurationSeconds = 183.21;

    expect(machineVerdict(evaluateNorthbridgeAssertions(observations))).toBe('fail');
    expect(
      machineVerdict(
        evaluateNorthbridgeAssertions(observations, {
          durationBounds: [150, 210],
          targetSeconds: 180,
        }),
      ),
    ).toBe('pass');
  });

  it('keeps the long-form repair budget binding rather than merely larger', () => {
    const observations = passingObservations();
    observations.limits.preflightCalls = 6;
    observations.media.takeDurationSeconds = 183.181;
    observations.media.previewDurationSeconds = 183.21;
    const assertions = evaluateNorthbridgeAssertions(observations, {
      durationBounds: [150, 210],
      targetSeconds: 180,
    });
    expect(assertions.find((assertion) => assertion.id === 'limits.preflight-calls')?.pass).toBe(
      false,
    );
    expect(machineVerdict(assertions)).toBe('fail');
  });

  it('fails absence and leak observations instead of treating them as pass', () => {
    const observations = passingObservations();
    observations.leakScan = { pass: false, violations: ['seeded-leak.ts'] };
    observations.media.audioCodec = null;
    const assertions = evaluateNorthbridgeAssertions(observations);
    expect(
      assertions.find((assertion) => assertion.id === 'leaks.agent-readable-files')?.pass,
    ).toBe(false);
    expect(assertions.find((assertion) => assertion.id === 'media.aac-audio')?.pass).toBe(false);
    expect(machineVerdict(assertions)).toBe('fail');
  });

  it('scores an unmeasured isolation boundary as not evidenced rather than as a pass', () => {
    const observations = passingObservations();
    observations.isolation.repositoryDenied = null;
    const assertions = evaluateNorthbridgeAssertions(observations);
    const repository = assertions.find(
      (assertion) => assertion.id === 'isolation.repository-denied',
    );
    expect(repository?.outcome).toBe('not-evidenced');
    expect(repository?.pass).toBe(false);
    expect(repository?.observed).toBe('not-evidenced');
    expect(machineVerdict(assertions)).toBe('not-evidenced');
  });

  it('scores a driver that brings no sandbox as not evidenced across the whole section', () => {
    const observations = passingObservations();
    observations.isolation = {
      ...observations.isolation,
      workRootReadWrite: null,
      repositoryDenied: null,
      serviceDenied: null,
      credentialsDenied: null,
      credentialsEnvironmentDenied: null,
    };
    observations.network.directDenied = null;
    const assertions = evaluateNorthbridgeAssertions(observations);
    expect(
      assertions
        .filter((assertion) => assertion.outcome === 'not-evidenced')
        .map((assertion) => assertion.id)
        .sort(),
    ).toEqual([
      'isolation.credentials-denied',
      'isolation.credentials-environment-denied',
      'isolation.repository-denied',
      'isolation.service-denied',
      'isolation.work-root-readwrite',
      'network.agent-direct-denied',
    ]);
    // What the harness *can* measure about the work root stays measured.
    expect(
      assertions.find((assertion) => assertion.id === 'isolation.initial-two-files')?.outcome,
    ).toBe('pass');
    expect(
      assertions.find((assertion) => assertion.id === 'isolation.write-containment')?.outcome,
    ).toBe('pass');
    expect(assertions.every((assertion) => assertion.outcome !== 'fail')).toBe(true);
    expect(machineVerdict(assertions)).toBe('not-evidenced');
  });

  it('keeps a real failure louder than an unmeasured boundary', () => {
    const observations = passingObservations();
    observations.isolation.serviceDenied = null;
    observations.network.commandViolations = ['production run compile'];
    expect(machineVerdict(evaluateNorthbridgeAssertions(observations))).toBe('fail');
  });

  it('still fails an isolation boundary that was measured and breached', () => {
    const observations = passingObservations();
    observations.isolation.repositoryDenied = false;
    const assertions = evaluateNorthbridgeAssertions(observations);
    const repository = assertions.find(
      (assertion) => assertion.id === 'isolation.repository-denied',
    );
    expect(repository?.outcome).toBe('fail');
    expect(repository?.observed).toBe(false);
    expect(machineVerdict(assertions)).toBe('fail');
  });

  it('marks every assertion with exactly one of the three outcomes', () => {
    const assertions = evaluateNorthbridgeAssertions(passingObservations());
    for (const assertion of assertions) {
      expect(['pass', 'fail', 'not-evidenced']).toContain(assertion.outcome);
      expect(assertion.pass).toBe(assertion.outcome === 'pass');
    }
  });

  it('reads a bundle written before the third outcome existed as what it meant', () => {
    const frozen = [
      { id: 'a', expected: true, observed: true, pass: true, evidence: ['x'] },
      { id: 'b', expected: true, observed: false, pass: false, evidence: ['x'] },
    ];
    const read = withOutcomes(frozen);
    expect(read.map((assertion) => assertion.outcome)).toEqual(['pass', 'fail']);
    // The frozen failure must still aggregate to a failure, not to an absent field.
    expect(machineVerdict(read)).toBe('fail');
    expect(machineVerdict(withOutcomes([frozen[0]!]))).toBe('pass');
  });

  it('leaves an outcome the bundle already carries alone', () => {
    const read = withOutcomes([
      {
        id: 'a',
        expected: true,
        observed: 'not-evidenced',
        outcome: 'not-evidenced',
        pass: false,
        evidence: ['x'],
      },
    ]);
    expect(read[0]?.outcome).toBe('not-evidenced');
    expect(machineVerdict(read)).toBe('not-evidenced');
  });

  it('checks full catalogue breadth for the two-minute showcase variant', () => {
    const observations = passingObservations();
    const capabilities = [
      'bar_chart',
      'character_explainer',
      'image_context',
      'line_chart',
      'quote',
      'stat_counter',
      'timeline',
      'typographic_statement',
    ];
    observations.scenario = {
      ...observations.scenario,
      capabilities,
      sceneCount: 8,
      eventDrivenCapabilities: capabilities,
      showcaseAssetRequirement: true,
      showcasePlanCompliant: true,
    };
    observations.media.takeDurationSeconds = 120;
    observations.media.previewDurationSeconds = 120;
    const assertions = evaluateNorthbridgeAssertions(observations, {
      durationBounds: [100, 140],
      targetSeconds: 120,
      scenario: 'catalog-showcase',
      expectedCapabilities: capabilities,
    });
    expect(machineVerdict(assertions)).toBe('pass');
  });
});
