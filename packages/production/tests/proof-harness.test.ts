import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { verifyProofBundle } from '../src/proof/evidence';
import { PAUSED_PROBE_PLAN, readBoundPlan, runNorthbridgeProof } from '../src/proof/harness';
import { NORTHBRIDGE_FIXTURE_PLAN } from '../src/proof/northbridge';
import type { RunCheckpoint } from '../src/run-store/run-store';

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

/**
 * The 60s budget on each test here is for a busy machine, not an assertion about how long the
 * work should take: every one of them runs a whole proof — a real service, a real launcher, a
 * Run carried to a rendered preview. Thirty seconds left too little headroom and timed out
 * whenever the full suite ran alongside them.
 */
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
  }, 60_000);

  it('makes a seeded leak fail the leak gate and aggregate verdict', async () => {
    const result = await execute(['leak']);
    expect(
      result.assertions.find((assertion) => assertion.id === 'leaks.agent-readable-files')?.pass,
    ).toBe(false);
    expect(result.machineVerdict).toBe('fail');
  }, 60_000);

  it('makes a seeded non-record network event fail network exclusivity', async () => {
    const result = await execute(['network']);
    expect(
      result.assertions.find((assertion) => assertion.id === 'network.record-only')?.pass,
    ).toBe(false);
    expect(result.machineVerdict).toBe('fail');
  }, 60_000);

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
  }, 60_000);
});

/**
 * The harness reads the plan it scores through the Run's binding, and this is that read on its
 * own. It is a seam rather than an inline `readFile` because it is the one place the harness
 * decides *which* plan a Run is about, and a driver whose agent authors its plan inside the Run
 * leaves nothing at any name the harness could guess.
 */
describe('the plan a Run is bound to', () => {
  it('reads the snapshot the checkpoint names, resolved against the run root', async () => {
    const runRoot = await mkdtemp(join(tmpdir(), 'vox-bound-plan-'));
    roots.push(runRoot);
    await writeFile(join(runRoot, 'snapshot.json'), JSON.stringify(NORTHBRIDGE_FIXTURE_PLAN));
    const checkpoint = {
      bindings: { plan: { snapshot: { path: 'snapshot.json' } } },
    } as unknown as RunCheckpoint;

    await expect(readBoundPlan(runRoot, checkpoint)).resolves.toEqual(NORTHBRIDGE_FIXTURE_PLAN);
  });

  it('refuses a Run with no plan binding rather than reading a plan from somewhere else', async () => {
    const runRoot = await mkdtemp(join(tmpdir(), 'vox-unbound-plan-'));
    roots.push(runRoot);

    await expect(readBoundPlan(runRoot, { bindings: {} } as RunCheckpoint)).rejects.toThrow(
      'PROOF_NO_BOUND_PLAN',
    );
  });
});

/**
 * Ticket 15's shape, without its cost. The live crew authors its plan through a model and
 * submits it from wherever it kept it, so nothing is left at `plan.json` in the work root —
 * the name both the scoring read and the zero-budget probe used to depend on.
 *
 * This driver reproduces exactly that and nothing else about the live path: it writes its plan
 * under a name of its own, runs the same command sequence the fixture driver runs, and deletes
 * the file before it returns. A harness that still reads a plan from the work root fails here
 * with `ENOENT`, and it would have failed the same way on the first real run.
 */
describe.sequential('a driver that leaves no plan file behind', () => {
  it('is still scored, through the plan its Run is bound to', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vox-proof-unbound-'));
    roots.push(parent);
    const evidenceRoot = join(parent, 'evidence');
    const authored = 'authored-plan.json';

    const result = await runNorthbridgeProof({
      provider: 'fixture',
      evidenceRoot,
      renderer: renderFixture,
      mediaProbe: probeFixture,
      agentDriver: async ({ invoke, workRoot, transcript }) => {
        const run = 'agent-selected-run';
        const runArgument = join(workRoot, run);
        transcript.push({ actor: 'crew-shaped', kind: 'task' });
        await invoke(['production', 'contract', 'index']);
        for (const category of ['plan', 'catalog', 'checks', 'protocol']) {
          await invoke(['production', 'contract', 'show', category]);
        }
        await invoke([
          'production',
          'run',
          'init',
          '--request',
          'request.json',
          '--out',
          runArgument,
        ]);
        await writeFile(
          join(workRoot, authored),
          `${JSON.stringify(NORTHBRIDGE_FIXTURE_PLAN, null, 2)}\n`,
        );
        await invoke(['production', 'run', 'validate', '--run', runArgument, '--plan', authored]);
        await invoke(['production', 'run', 'preflight', '--run', runArgument]);
        await invoke(['production', 'run', 'record', '--run', runArgument]);
        await invoke(['production', 'run', 'compile', '--run', runArgument]);
        await invoke(['production', 'run', 'render', '--run', runArgument]);
        // The plan leaves the work root with the agent, the way a plan authored inside a model
        // never entered it.
        await rm(join(workRoot, authored));
        return {
          authorship: 'fresh-generalist',
          unscripted: true,
          humanHints: 0,
          model: 'crew-shaped-test-driver',
          modelVersion: '1',
          transcriptComplete: true,
          directNetworkDenied: false,
          directNetworkEvents: [],
          sandboxEvidence: null,
        };
      },
    });

    // Scored from the bound snapshot: these are the plan-derived assertions, and they can only
    // have a value if a plan was read at all.
    expect(
      result.assertions
        .filter((assertion) => assertion.outcome === 'fail')
        .map((assertion) => assertion.id),
    ).toEqual([]);
    expect(result.machineVerdict).not.toBe('fail');

    // The zero-budget probe validated against a plan the harness wrote from the same binding,
    // not against a file the agent happened to leave.
    const commandLines = (await readFile(join(evidenceRoot, 'commands.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { actor: string; argv: string[] });
    const probeValidate = commandLines.find(
      (line) =>
        line.actor === 'harness' &&
        line.argv.slice(0, 3).join(' ') === 'production run validate' &&
        line.argv.includes('run-paused'),
    );
    expect(probeValidate?.argv.at(-1)).toBe(PAUSED_PROBE_PLAN);
  }, 60_000);
});
