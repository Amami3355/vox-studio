import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { verifyProofBundle } from '../src/proof/evidence';
import { runNorthbridgeProof } from '../src/proof/harness';

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const renderFixture = async () => ({
  bytes: Buffer.from([
    0x00, 0x00, 0x00, 0x10, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00,
  ]),
  container: 'mp4' as const,
  videoCodec: 'h264' as const,
  audioCodec: 'aac' as const,
});

const probeFixture = async () => ({
  raw: { fixture: true },
  videoCodec: 'h264',
  audioCodec: 'aac',
  previewDurationSeconds: 20.87,
  previewAudioNonSilent: true,
  takeAudioNonSilent: true,
});

const execute = async (seededViolations: Array<'leak' | 'network'> = []) => {
  const parent = await mkdtemp(join(tmpdir(), 'vox-proof-test-'));
  roots.push(parent);
  const evidenceRoot = join(parent, 'evidence');
  return runNorthbridgeProof({
    provider: 'fixture',
    evidenceRoot,
    renderer: renderFixture,
    mediaProbe: probeFixture,
    seededViolations,
  });
};

describe.sequential('Northbridge proof harness', () => {
  it('produces a hash-complete non-claiming fixture evidence bundle', async () => {
    const result = await execute();
    expect(result.machineVerdict).toBe('fail');
    expect(result.humanVerdict).toBe('pending');
    const failed = result.assertions.filter((assertion) => assertion.outcome === 'fail');
    expect(failed.map((assertion) => assertion.id)).toEqual(['agent.unscripted-generalist']);
    // The fixture driver spawns no sandbox, so it cannot evidence the agent's isolation. Those
    // assertions used to pass from the restricted-token probes, which measure a different
    // process entirely; now they say what is true, which is that nothing measured them.
    expect(
      result.assertions
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
    await expect(verifyProofBundle(result.evidenceRoot, { requirePass: false })).resolves.toEqual({
      machineVerdict: 'fail',
      humanVerdict: 'pending',
    });
    await expect(verifyProofBundle(result.evidenceRoot, { requirePass: true })).rejects.toThrow(
      'PROOF_VERDICT_NOT_PASS',
    );
    const commandLines = (await readFile(join(result.evidenceRoot, 'commands.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(
        (line) =>
          JSON.parse(line) as {
            actor: 'agent' | 'harness';
            argv: string[];
            stdoutBase64: string;
          },
      );
    const targetsAgentRun = (line: { argv: string[] }) => {
      const flag = line.argv.indexOf('--run');
      return flag >= 0 && basename(line.argv[flag + 1] ?? '') === 'agent-selected-run';
    };
    expect(
      commandLines.some(
        (line) =>
          line.argv.slice(0, 3).join(' ') === 'production run render' && targetsAgentRun(line),
      ),
    ).toBe(true);
    expect(
      commandLines.filter(
        (line) =>
          line.actor === 'agent' &&
          line.argv.slice(0, 3).join(' ') === 'production run record' &&
          targetsAgentRun(line),
      ),
    ).toHaveLength(1);
    const reuseProbe = commandLines.find(
      (line) =>
        line.actor === 'harness' &&
        line.argv.slice(0, 3).join(' ') === 'production run record' &&
        line.argv.length === 5 &&
        targetsAgentRun(line),
    );
    expect(reuseProbe).toBeDefined();
    expect(
      JSON.parse(Buffer.from(reuseProbe!.stdoutBase64, 'base64').toString('utf8')),
    ).toMatchObject({ data: { disposition: 'reused' } });
    expect(
      commandLines.some(
        (line) =>
          line.actor === 'harness' &&
          line.argv.slice(0, 3).join(' ') === 'production run status' &&
          targetsAgentRun(line),
      ),
    ).toBe(true);
    await appendFile(join(result.evidenceRoot, 'SUMMARY.md'), '\ntampered\n');
    await expect(verifyProofBundle(result.evidenceRoot, { requirePass: false })).rejects.toThrow(
      'PROOF_HASH_MISMATCH',
    );
  }, 30_000);

  it('makes a seeded leak fail the leak gate and aggregate verdict', async () => {
    const result = await execute(['leak']);
    expect(
      result.assertions.find((assertion) => assertion.id === 'leaks.agent-readable-files')?.pass,
    ).toBe(false);
    expect(result.machineVerdict).toBe('fail');
  }, 30_000);

  it('makes a seeded non-record network event fail network exclusivity', async () => {
    const result = await execute(['network']);
    expect(
      result.assertions.find((assertion) => assertion.id === 'network.record-only')?.pass,
    ).toBe(false);
    expect(result.machineVerdict).toBe('fail');
  }, 30_000);

  it('preserves fail-closed evidence and working roots when an actual driver aborts', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vox-proof-failure-test-'));
    roots.push(parent);
    const evidenceRoot = join(parent, 'evidence');
    await expect(
      runNorthbridgeProof({
        provider: 'fixture',
        evidenceRoot,
        renderer: renderFixture,
        mediaProbe: probeFixture,
        keepWorkingRoots: true,
        agentDriver: async ({ transcript }) => {
          transcript.push({ type: 'seeded-agent-start' });
          throw new Error('SEEDED_AGENT_FAILURE');
        },
      }),
    ).rejects.toThrow(`PROOF_FAILED_EVIDENCE_PRESERVED:${evidenceRoot}:SEEDED_AGENT_FAILURE`);
    const failure = JSON.parse(await readFile(join(evidenceRoot, 'failure.json'), 'utf8')) as {
      workingParent: string;
      workingRootsPreserved: boolean;
    };
    roots.push(failure.workingParent);
    expect(failure.workingRootsPreserved).toBe(true);
    expect(await readFile(join(evidenceRoot, 'agent-transcript.jsonl'), 'utf8')).toContain(
      'seeded-agent-start',
    );
    expect(await readFile(join(evidenceRoot, 'hash-index.json'), 'utf8')).toContain('failure.json');
  }, 30_000);
});
