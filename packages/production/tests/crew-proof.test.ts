import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createCrewAgentDriver, verifyCrewBundle } from '../src/proof/crew-agent';
import { verifyProofBundle } from '../src/proof/evidence';
import { runNorthbridgeProof } from '../src/proof/harness';
import { NORTHBRIDGE_FIXTURE_PLAN } from '../src/proof/northbridge';

/**
 * Acceptance bar (1): the crew runs headless in a bootstrapped work root against the real
 * production service, with the synthesis and render adapters stubbed, and the run it produces
 * is scored by the same assertion sheet the scripted driver is scored by.
 *
 * **The plan is handed in, and the sheet is told so.** The crew's author is a model, and a
 * model is neither free nor deterministic and needs a credential the crew is not given here. So
 * this run hands the crew a plan and everything else is the crew's own: discovery, the review,
 * the convergence, the producer, the read-back, and the bundle it leaves behind. That costs
 * exactly one assertion — `agent.unscripted-generalist`, which is about authorship and is
 * honestly false — and it is the assertion ticket 15 exists to earn with a real model.
 *
 * The isolation assertions report as `not-evidenced` because nothing measured them: the crew
 * runs in a plain subprocess with no sandbox backend, and review decision 1 took the honest
 * null rather than a section that passes from probes measuring a different process.
 */

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

/** Everything the crew is not being judged on here, and why each one is excused. */
const NOT_THE_CREWS_TO_EARN = new Set([
  // Authorship: the plan was handed in, and the sheet is not being told otherwise.
  'agent.unscripted-generalist',
  // Isolation: nothing measured it, and `not-evidenced` is the word for that.
  'isolation.work-root-readwrite',
  'isolation.repository-denied',
  'isolation.service-denied',
  'isolation.credentials-denied',
  'isolation.credentials-environment-denied',
  'network.agent-direct-denied',
]);

describe.sequential('the crew through the proof harness', () => {
  it('is scored by the existing sheet and passes everything but authorship and isolation', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vox-crew-proof-'));
    roots.push(parent);
    const evidenceRoot = join(parent, 'evidence');

    const result = await runNorthbridgeProof({
      provider: 'fixture',
      evidenceRoot,
      renderer: renderFixture,
      mediaProbe: probeFixture,
      agentDriver: createCrewAgentDriver({ plan: NORTHBRIDGE_FIXTURE_PLAN }),
    });

    // Everything the crew is answerable for. Named this way rather than as a list of expected
    // ids, so an assertion added to the sheet is one the crew has to earn rather than one this
    // test quietly stops checking.
    const unearned = result.assertions.filter(
      (assertion) => assertion.outcome !== 'pass' && !NOT_THE_CREWS_TO_EARN.has(assertion.id),
    );
    expect(
      unearned.map((assertion) => `${assertion.id}=${JSON.stringify(assertion.observed)}`),
    ).toEqual([]);

    // Isolation reports the gap rather than a pass, and nothing in that section fails.
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
    expect(
      result.assertions
        .filter((assertion) => assertion.outcome === 'fail')
        .map((assertion) => assertion.id),
    ).toEqual(['agent.unscripted-generalist']);
    expect(result.machineVerdict).toBe('fail');

    await expect(verifyProofBundle(evidenceRoot, { requirePass: false })).resolves.toEqual({
      machineVerdict: 'fail',
      humanVerdict: 'pending',
    });
  }, 900_000);

  it('leaves a crew bundle that verifies after the fact, about the same Run', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vox-crew-proof-'));
    roots.push(parent);
    const evidenceRoot = join(parent, 'evidence');

    const result = await runNorthbridgeProof({
      provider: 'fixture',
      evidenceRoot,
      renderer: renderFixture,
      mediaProbe: probeFixture,
      agentDriver: createCrewAgentDriver({ plan: NORTHBRIDGE_FIXTURE_PLAN }),
    });

    // The crew's bundle travelled out of a work root that no longer exists, and the crew's own
    // verifier reads it where it landed.
    //
    // It says `pass` while the sheet says `fail`, and the two do not contradict each other: the
    // crew restates only the assertions it can observe about itself — the limits, the single
    // dispatch, the take, the compile, Preflight and the stage reached — and every one of them
    // passed. Authorship is not among them and could not be: an agent scoring
    // `agent.unscripted-generalist` would be the party being judged answering the question. The
    // aggregate a crew bundle reports is therefore about a subset, and the sheet's is the one
    // that scores the run.
    const crewBundle = join(evidenceRoot, 'agent-evidence');
    await expect(verifyCrewBundle(crewBundle)).resolves.toBe('pass');

    // Both bundles are about one Run, so the assertions the crew restates for itself have to
    // agree with the sheet's. This is the only place the two restatements meet: the crew
    // cannot read TypeScript and the sheet cannot see inside a Python process.
    const crewAssertions = JSON.parse(await readFile(join(crewBundle, 'assertions.json'), 'utf8'));
    const sheet = new Map(result.assertions.map((assertion) => [assertion.id, assertion]));
    const shared = crewAssertions.assertions.filter((assertion: { id: string }) =>
      sheet.has(assertion.id),
    );
    expect(shared.length).toBeGreaterThan(0);
    for (const restated of shared as Array<{ id: string; expected: unknown; outcome: string }>) {
      const scored = sheet.get(restated.id);
      expect(restated.expected, `${restated.id} expected`).toEqual(scored?.expected);
      if (restated.outcome !== 'not-evidenced') {
        expect(restated.outcome, `${restated.id} outcome`).toBe(scored?.outcome);
      }
    }
  }, 900_000);
});
