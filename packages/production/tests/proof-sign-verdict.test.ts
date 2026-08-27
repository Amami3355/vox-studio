import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { verifyProofBundle } from '../src/proof/evidence';
import { type HumanVerdictInput, signHumanVerdict } from '../src/proof/sign-verdict';
import {
  CRITERIA,
  PREVIEW_SHA256,
  SUMMARY,
  TAKE_ID,
  verdictInput as input,
  pendingBundle,
  removeVerdictBundles,
} from './verdict-fixture';

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

afterAll(removeVerdictBundles);

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

  it('refuses a sheet whose row count a signed pass could never satisfy, before writing', async () => {
    // The defect this closes: the input was checked against the *sealed* sheet and the sealed
    // sheet against nothing, so five criteria accepted five notes. Both files were written and
    // re-hashed, and only the re-verification afterwards refused the result — leaving a bundle
    // signed `pass` that no longer verified. The refusal now happens before the first write.
    const short = CRITERIA.slice(0, 5);
    const root = await pendingBundle(short);
    const before = await readJson(root, 'hash-index.json');
    const rows = short.map((criterion, position) => ({
      criterion,
      verdict: 'pass' as const,
      note: `watched, row ${position + 1} holds`,
    }));
    await expect(signHumanVerdict(root, input({ rows }))).rejects.toThrow(
      'VERDICT_SHEET_ROW_COUNT:6:5',
    );
    expect(await readJson(root, 'hash-index.json')).toEqual(before);
    expect((await readJson(root, 'human-verdict.json')).humanVerdict).toBe('pending');
    await expect(verifyProofBundle(root)).resolves.toEqual({
      machineVerdict: 'not-evidenced',
      humanVerdict: 'pending',
    });
  });

  it('still signs a fail against a sheet that could not carry a pass', async () => {
    // The count gates a *pass*, which is the verdict `verifyProofBundle` holds to six complete
    // rows. A fail is not held to it there, so refusing one here would be this module inventing
    // a rule the verifier does not have.
    const short = CRITERIA.slice(0, 5);
    const root = await pendingBundle(short);
    const rows = short.map((criterion, position) => ({
      criterion,
      verdict: (position === 0 ? 'fail' : 'pass') as 'pass' | 'fail',
      note: `watched, row ${position + 1}`,
    }));
    await expect(signHumanVerdict(root, input({ humanVerdict: 'fail', rows }))).resolves.toEqual({
      machineVerdict: 'not-evidenced',
      humanVerdict: 'fail',
    });
  });

  it('refuses a row that omits its criterion, rather than filing it wherever it landed', async () => {
    // The guard used to be skipped when the field was absent, which made it opt-in: the input
    // most likely to be mis-ordered — one typed by hand rather than from `--template` — was
    // exactly the one that went unchecked.
    const root = await pendingBundle();
    const rows = CRITERIA.map((_criterion, position) => ({
      verdict: 'pass' as const,
      note: `watched, row ${position + 1} holds`,
    })) as unknown as HumanVerdictInput['rows'];
    await expect(signHumanVerdict(root, input({ rows }))).rejects.toThrow(
      'VERDICT_ROW_CRITERION_MISMATCH:0',
    );
    expect((await readJson(root, 'human-verdict.json')).humanVerdict).toBe('pending');
  });
});
