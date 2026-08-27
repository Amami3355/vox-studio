import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { verifyProofBundle, writeHashIndex, writeJson } from '../src/proof/evidence';
import { type HumanVerdictInput, signHumanVerdict } from '../src/proof/sign-verdict';

/**
 * `human-verdict.json` is written `pending` at seal time and is meant to be filled in by a
 * person afterwards — but it is one of the hashed entries in `hash-index.json`, so hand-editing
 * it breaks verification before the verdict is ever read. The signing path exists to close that,
 * and these tests hold it to the two properties that make it worth having:
 *
 * - a signed bundle still verifies, and
 * - signing rewrites **only** the verdict's own hash, so it cannot be the step that launders a
 *   bundle somebody else edited.
 *
 * The fixture is shaped like a crew bundle on purpose: `machineVerdict: 'not-evidenced'`, which
 * is what a local crew run reports by design (ticket 15's third criterion). That is why these
 * tests check `verifyProofBundle` rather than the `requirePass: true` gate — no crew bundle can
 * pass that gate, and the verdict is not the reason.
 */

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const CRITERIA = [
  'narration is intelligible, complete, continuous and matches every fictional fact',
  'all eight catalogue capabilities are perceptibly distinct and synchronized to the voice',
  'character, chronology, trend, comparison, statistic and quote remain legible',
  'the image placeholder is honest visible degradation',
  'composition, typography, motion and pace remain coherent across the full film',
  'the complete preview is watchable and listenable without explanation',
] as const;

const PREVIEW_SHA256 = 'a'.repeat(64);
const TAKE_ID = '6a329bf5bc47';

const SUMMARY = `# Fixture proof evidence

- Proof id: fixture-proof-v1
- Machine verdict: not-evidenced
- Human verdict: pending
- Code-blind end-to-end claim: no

Pending human review is incomplete, never pass.
`;

/** A bundle with the smallest shape `verifyProofBundle` accepts, sealed and unsigned. */
const pendingBundle = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'vox-sign-verdict-'));
  roots.push(root);
  await mkdir(join(root, 'main-run'), { recursive: true });
  await writeJson(join(root, 'main-run', 'run.json'), {
    bindings: {
      render: { preview: { sha256: PREVIEW_SHA256 } },
      take: { takeId: TAKE_ID },
    },
  });
  await writeJson(join(root, 'assertions.json'), {
    machineVerdict: 'not-evidenced',
    assertions: [
      {
        id: 'scenario.brief-compliance',
        expected: [],
        observed: [],
        outcome: 'pass',
        pass: true,
        evidence: ['main-run/run.json'],
      },
      {
        id: 'isolation.repository-denied',
        expected: true,
        observed: null,
        outcome: 'not-evidenced',
        pass: false,
        evidence: ['main-run/run.json'],
      },
    ],
  });
  await writeJson(join(root, 'human-verdict.json'), {
    humanVerdict: 'pending',
    evaluator: null,
    evaluatedAt: null,
    displayAndAudioSetup: null,
    previewSha256: PREVIEW_SHA256,
    takeId: TAKE_ID,
    verticalSliceReviewed: false,
    rows: CRITERIA.map((criterion) => ({ criterion, verdict: 'pending', note: null })),
    note: 'Pending is incomplete, never pass. This verdict does not close gap 8.',
  });
  await writeFile(join(root, 'SUMMARY.md'), SUMMARY, 'utf8');
  await writeHashIndex(root);
  return root;
};

const input = (overrides: Partial<HumanVerdictInput> = {}): HumanVerdictInput => ({
  humanVerdict: 'pass',
  evaluator: 'A Person',
  evaluatedAt: '2026-08-27T20:00:00.000Z',
  displayAndAudioSetup: '27-inch display at 100%, wired headphones',
  rows: CRITERIA.map((criterion, position) => ({
    criterion,
    verdict: 'pass' as const,
    note: `watched, row ${position + 1} holds`,
  })),
  ...overrides,
});

const readJson = async (root: string, path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(join(root, path), 'utf8')) as Record<string, unknown>;

describe('signHumanVerdict', () => {
  it('signs a pending verdict, and the bundle it leaves behind still verifies', async () => {
    const root = await pendingBundle();
    const result = await signHumanVerdict(root, input());
    expect(result).toEqual({ machineVerdict: 'not-evidenced', humanVerdict: 'pass' });
    await expect(verifyProofBundle(root)).resolves.toEqual({
      machineVerdict: 'not-evidenced',
      humanVerdict: 'pass',
    });
  });

  it('records the evaluator, the setup, the time and all six notes', async () => {
    const root = await pendingBundle();
    await signHumanVerdict(root, input());
    const verdict = await readJson(root, 'human-verdict.json');
    expect(verdict.evaluator).toBe('A Person');
    expect(verdict.evaluatedAt).toBe('2026-08-27T20:00:00.000Z');
    expect(verdict.displayAndAudioSetup).toBe('27-inch display at 100%, wired headphones');
    expect(verdict.rows).toEqual(
      CRITERIA.map((criterion, position) => ({
        criterion,
        verdict: 'pass',
        note: `watched, row ${position + 1} holds`,
      })),
    );
  });

  it('defaults the evaluation time to the moment of signing', async () => {
    const root = await pendingBundle();
    const before = Date.now();
    await signHumanVerdict(root, input({ evaluatedAt: undefined }));
    const verdict = await readJson(root, 'human-verdict.json');
    expect(Date.parse(verdict.evaluatedAt as string)).toBeGreaterThanOrEqual(before);
  });

  it('leaves the artifact bindings, the criteria and gap 8 exactly as sealed', async () => {
    const root = await pendingBundle();
    await signHumanVerdict(root, input());
    const verdict = await readJson(root, 'human-verdict.json');
    expect(verdict.previewSha256).toBe(PREVIEW_SHA256);
    expect(verdict.takeId).toBe(TAKE_ID);
    // Gap 8 is a separate watch of the shipped vertical slice. This script is not that review,
    // and the sealed note says so, so neither field moves.
    expect(verdict.verticalSliceReviewed).toBe(false);
    expect(verdict.note).toBe(
      'Pending is incomplete, never pass. This verdict does not close gap 8.',
    );
  });

  it('restates the verdict line in SUMMARY.md rather than leaving it contradicting the file', async () => {
    const root = await pendingBundle();
    await signHumanVerdict(root, input());
    const summary = await readFile(join(root, 'SUMMARY.md'), 'utf8');
    expect(summary).toContain('- Human verdict: pass (A Person, 2026-08-27T20:00:00.000Z)');
    expect(summary).not.toContain('- Human verdict: pending');
    expect(summary).toContain('- Machine verdict: not-evidenced');
  });

  it('rewrites only the two hashes it actually changed', async () => {
    const root = await pendingBundle();
    const before = await readJson(root, 'hash-index.json');
    await signHumanVerdict(root, input());
    const after = await readJson(root, 'hash-index.json');
    const moved = Object.keys(after).filter((path) => after[path] !== before[path]);
    expect(moved.sort()).toEqual(['SUMMARY.md', 'human-verdict.json']);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  });

  it('still catches a byte tampered anywhere else after signing', async () => {
    const root = await pendingBundle();
    await signHumanVerdict(root, input());
    await writeFile(join(root, 'main-run', 'run.json'), '{"bindings":{}}\n', 'utf8');
    await expect(verifyProofBundle(root)).rejects.toThrow('PROOF_HASH_MISMATCH:main-run/run.json');
  });

  it('refuses to sign a bundle whose hashes have already moved', async () => {
    const root = await pendingBundle();
    await writeFile(join(root, 'SUMMARY.md'), `${SUMMARY}tampered\n`, 'utf8');
    await expect(signHumanVerdict(root, input())).rejects.toThrow('PROOF_HASH_MISMATCH:SUMMARY.md');
  });

  it('refuses to sign a verdict twice', async () => {
    const root = await pendingBundle();
    await signHumanVerdict(root, input());
    await expect(signHumanVerdict(root, input())).rejects.toThrow('VERDICT_ALREADY_SIGNED:pass');
  });

  it('refuses a row count the sealed sheet does not have', async () => {
    const root = await pendingBundle();
    const rows = input().rows.slice(0, 5);
    await expect(signHumanVerdict(root, input({ rows }))).rejects.toThrow('VERDICT_ROW_COUNT:6:5');
  });

  it('refuses notes pasted against the wrong criteria', async () => {
    const root = await pendingBundle();
    const rows = [CRITERIA[1], CRITERIA[0], ...CRITERIA.slice(2)].map((criterion) => ({
      criterion,
      verdict: 'pass' as const,
      note: 'watched',
    }));
    await expect(signHumanVerdict(root, input({ rows }))).rejects.toThrow(
      'VERDICT_ROW_CRITERION_MISMATCH:0',
    );
  });

  it.each([
    ['evaluator', { evaluator: '   ' }, 'VERDICT_EVALUATOR_ABSENT'],
    ['setup', { displayAndAudioSetup: '' }, 'VERDICT_SETUP_ABSENT'],
    ['a parseable time', { evaluatedAt: 'yesterday' }, 'VERDICT_EVALUATED_AT_INVALID'],
  ])('refuses a verdict with no %s', async (_label, overrides, error) => {
    const root = await pendingBundle();
    await expect(signHumanVerdict(root, input(overrides))).rejects.toThrow(error);
  });

  it('refuses a blank note, which is the shape a hurried signature takes', async () => {
    const root = await pendingBundle();
    const rows = input().rows.map((row, position) =>
      position === 3 ? { ...row, note: ' ' } : row,
    );
    await expect(signHumanVerdict(root, input({ rows }))).rejects.toThrow(
      'VERDICT_ROW_NOTE_ABSENT:3',
    );
  });

  it('refuses a pass whose rows do not all pass', async () => {
    const root = await pendingBundle();
    const rows = input().rows.map((row, position) =>
      position === 2 ? { ...row, verdict: 'fail' as const } : row,
    );
    await expect(signHumanVerdict(root, input({ rows }))).rejects.toThrow(
      'VERDICT_ROW_CONTRADICTS_PASS:2',
    );
  });

  it('signs a fail, which may carry failing rows and still has to be complete', async () => {
    const root = await pendingBundle();
    const rows = input().rows.map((row, position) =>
      position === 2 ? { ...row, verdict: 'fail' as const, note: 'the third scene drifts' } : row,
    );
    const result = await signHumanVerdict(root, input({ humanVerdict: 'fail', rows }));
    expect(result.humanVerdict).toBe('fail');
    await expect(verifyProofBundle(root)).resolves.toEqual({
      machineVerdict: 'not-evidenced',
      humanVerdict: 'fail',
    });
    const summary = await readFile(join(root, 'SUMMARY.md'), 'utf8');
    expect(summary).toContain('- Human verdict: fail (A Person,');
  });

  it('refuses a verdict word that is neither pass nor fail', async () => {
    const root = await pendingBundle();
    const bad = input({ humanVerdict: 'pending' as unknown as HumanVerdictInput['humanVerdict'] });
    await expect(signHumanVerdict(root, bad)).rejects.toThrow('VERDICT_OUTCOME_INVALID:pending');
  });

  it('writes nothing at all when the input is refused', async () => {
    const root = await pendingBundle();
    const before = await readJson(root, 'hash-index.json');
    await expect(signHumanVerdict(root, input({ evaluator: '' }))).rejects.toThrow();
    expect(await readJson(root, 'hash-index.json')).toEqual(before);
    expect((await readJson(root, 'human-verdict.json')).humanVerdict).toBe('pending');
    await expect(verifyProofBundle(root)).resolves.toEqual({
      machineVerdict: 'not-evidenced',
      humanVerdict: 'pending',
    });
  });
});
