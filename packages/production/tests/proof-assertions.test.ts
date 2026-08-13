import { describe, expect, it } from 'vitest';
import {
  type NorthbridgeObservations,
  evaluateNorthbridgeAssertions,
  machineVerdict,
} from '../src/proof/assertions';

const passingObservations = (): NorthbridgeObservations => ({
  authorship: { kind: 'fresh-generalist', unscripted: true },
  isolation: {
    initialFiles: ['request.json', 'vox.exe'],
    workRootReadWrite: true,
    repositoryDenied: true,
    serviceDenied: true,
    credentialsDenied: true,
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
  },
  preflight: { advisory: true, minimumRiskCleared: true },
  assets: { northbridgeStatus: 'placeholder', failedCount: 0 },
  compilation: { ok: true, errorCount: 0 },
  media: {
    videoCodec: 'h264',
    audioCodec: 'aac',
    audioNonSilent: true,
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
});
