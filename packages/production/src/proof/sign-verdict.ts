import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SIGNED_VERDICT_ROWS, sha256, verifyProofBundle, writeJson } from './evidence';

/**
 * The one path by which a human verdict may enter a sealed bundle.
 *
 * `human-verdict.json` is written `pending` and is meant to be completed by a person, but it is
 * a hashed entry in `hash-index.json` like every other file, so hand-editing it makes the bundle
 * fail `PROOF_HASH_MISMATCH` before the verdict is ever read. Exempting it from the index was
 * the alternative and was rejected: the bundle would then stop attesting the one thing a human
 * put into it. So the verdict is rewritten *and re-hashed*, and this module is the only thing
 * that does it.
 *
 * Two properties are what make that safe, and `proof-sign-verdict.test.ts` holds both:
 *
 * - **The bundle is verified before anything is written.** Every other file's hash is confirmed
 *   intact first, so signing can never be the step that launders a bundle somebody edited.
 * - **Only the entries this module actually rewrites move.** It never re-seals the index from
 *   the current file contents, which would silently bless whatever else had changed.
 *
 * It signs the verdict and the SUMMARY line that states it. Everything else the sheet asserts —
 * the artifact bindings, the criteria, `verticalSliceReviewed` — is left exactly as sealed.
 *
 * **Why these codes are `VERDICT_*` and not `PROOF_*` like the rest of `src/proof`.** They answer
 * different questions. A `PROOF_*` code says a bundle does not hold together and is what a reader
 * of somebody else's evidence meets. A `VERDICT_*` code says *this signing input was refused and
 * nothing was written*, which is a fact about the request rather than about the bundle — the
 * bundle it names is still exactly as sealed. Keeping the namespaces apart is what lets a caller
 * tell "your input was wrong" from "the evidence you were handed is broken"; folding them together
 * would make a rejected paste look like a corrupted proof.
 */

export type HumanVerdictRowInput = {
  /**
   * Checked against the sealed criterion at the same position: six notes pasted in the wrong
   * order are otherwise indistinguishable from six correct ones.
   *
   * Required, not optional. It was optional, and an optional guard against mis-ordering is not a
   * guard — an input that simply omitted the field got the silent misfiling the field exists to
   * prevent, which is the one failure `--template` is built around. The template emits it, so
   * the path a person actually walks already satisfies this.
   */
  criterion: string;
  verdict: 'pass' | 'fail';
  note: string;
};

export type HumanVerdictInput = {
  humanVerdict: 'pass' | 'fail';
  evaluator: string;
  /** ISO 8601. Defaults to the moment of signing. */
  evaluatedAt?: string;
  displayAndAudioSetup: string;
  rows: HumanVerdictRowInput[];
};

type SealedRow = { criterion: string; verdict: string; note: string | null };
type SealedVerdict = Record<string, unknown> & { humanVerdict: string; rows: SealedRow[] };

const PENDING_SUMMARY_LINE = '- Human verdict: pending';

const oneLine = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replaceAll(/\s+/g, ' ') : '';

/**
 * Validation is a single pass that returns the two files to write, so a refusal cannot leave a
 * half-signed bundle behind: nothing is written until every field has been accepted.
 */
const signedContents = (
  sealed: SealedVerdict,
  summary: string,
  input: HumanVerdictInput,
): { verdict: SealedVerdict; summary: string } => {
  if (input.humanVerdict !== 'pass' && input.humanVerdict !== 'fail') {
    throw new Error(`VERDICT_OUTCOME_INVALID:${input.humanVerdict}`);
  }
  const evaluator = oneLine(input.evaluator);
  if (evaluator.length === 0) throw new Error('VERDICT_EVALUATOR_ABSENT');
  const displayAndAudioSetup = oneLine(input.displayAndAudioSetup);
  if (displayAndAudioSetup.length === 0) throw new Error('VERDICT_SETUP_ABSENT');
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  if (typeof evaluatedAt !== 'string' || Number.isNaN(Date.parse(evaluatedAt))) {
    throw new Error(`VERDICT_EVALUATED_AT_INVALID:${String(input.evaluatedAt)}`);
  }
  // The sealed sheet is checked against the count a signed pass has to have, before the input is
  // checked against the sealed sheet. Only the second was here, which made this function agree
  // with whatever the bundle happened to hold rather than with the verifier: a sheet sealed with
  // five criteria accepted five notes, both files were written, and `verifyProofBundle` then
  // refused the result with `PROOF_HUMAN_VERDICT_INCOMPLETE` — a bundle signed `pass` and no
  // longer verifiable, which is the one outcome this module promises cannot happen. Refusing the
  // sheet up front costs nothing and cannot leave anything behind.
  if (input.humanVerdict === 'pass' && sealed.rows.length !== SIGNED_VERDICT_ROWS) {
    throw new Error(`VERDICT_SHEET_ROW_COUNT:${SIGNED_VERDICT_ROWS}:${sealed.rows.length}`);
  }
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (rows.length !== sealed.rows.length) {
    throw new Error(`VERDICT_ROW_COUNT:${sealed.rows.length}:${rows.length}`);
  }
  const signedRows = sealed.rows.map((sealedRow, position) => {
    const row = rows[position];
    if (row === null || typeof row !== 'object') {
      throw new Error(`VERDICT_ROW_MALFORMED:${position}`);
    }
    if (row.criterion !== sealedRow.criterion) {
      throw new Error(`VERDICT_ROW_CRITERION_MISMATCH:${position}`);
    }
    if (row.verdict !== 'pass' && row.verdict !== 'fail') {
      throw new Error(`VERDICT_ROW_VERDICT_INVALID:${position}`);
    }
    if (input.humanVerdict === 'pass' && row.verdict !== 'pass') {
      throw new Error(`VERDICT_ROW_CONTRADICTS_PASS:${position}`);
    }
    const note = typeof row.note === 'string' ? row.note.trim() : '';
    if (note.length === 0) throw new Error(`VERDICT_ROW_NOTE_ABSENT:${position}`);
    return { criterion: sealedRow.criterion, verdict: row.verdict, note };
  });
  if (!summary.includes(PENDING_SUMMARY_LINE)) {
    throw new Error('VERDICT_SUMMARY_LINE_ABSENT');
  }
  return {
    verdict: {
      ...sealed,
      humanVerdict: input.humanVerdict,
      evaluator,
      evaluatedAt,
      displayAndAudioSetup,
      rows: signedRows,
    },
    summary: summary.replace(
      PENDING_SUMMARY_LINE,
      `- Human verdict: ${input.humanVerdict} (${evaluator}, ${evaluatedAt})`,
    ),
  };
};

/** Re-hashes the named paths from the bytes on disk, leaving every other entry alone. */
const reindex = async (root: string, paths: string[]): Promise<void> => {
  const indexPath = resolve(root, 'hash-index.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8')) as Record<string, string>;
  for (const path of paths) {
    index[path] = sha256(await readFile(resolve(root, path)));
  }
  await writeJson(indexPath, index);
};

export const signHumanVerdict = async (
  root: string,
  input: HumanVerdictInput,
): Promise<{ machineVerdict: string; humanVerdict: 'pass' | 'fail' | 'pending' }> => {
  const absoluteRoot = resolve(root);
  const sealedState = await verifyProofBundle(absoluteRoot);
  if (sealedState.humanVerdict !== 'pending') {
    throw new Error(`VERDICT_ALREADY_SIGNED:${sealedState.humanVerdict}`);
  }
  const verdictPath = resolve(absoluteRoot, 'human-verdict.json');
  const summaryPath = resolve(absoluteRoot, 'SUMMARY.md');
  const signed = signedContents(
    JSON.parse(await readFile(verdictPath, 'utf8')) as SealedVerdict,
    await readFile(summaryPath, 'utf8'),
    input,
  );
  await writeJson(verdictPath, signed.verdict);
  await writeFile(summaryPath, signed.summary, 'utf8');
  await reindex(absoluteRoot, ['human-verdict.json', 'SUMMARY.md']);
  // Re-read the bundle the way anyone else will, rather than reporting what was intended.
  const state = await verifyProofBundle(absoluteRoot);
  if (state.humanVerdict !== input.humanVerdict) throw new Error('VERDICT_SIGN_FAILED');
  return state;
};
