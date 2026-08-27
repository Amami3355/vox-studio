import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeHashIndex, writeJson } from '../src/proof/evidence';
import type { HumanVerdictInput } from '../src/proof/sign-verdict';

/**
 * A sealed, unsigned bundle shaped like a crew Run's, shared by the tests that sign one.
 *
 * Here rather than in one test file because two now need it: the module tests and the tests that
 * drive `sign:verdict` and `verify:proof` as commands. A second copy would have been the thing
 * the signing path itself was just corrected for — two encodings of one shape, free to drift.
 *
 * `machineVerdict: 'not-evidenced'` is deliberate and is what a local crew run reports by design,
 * which is why these bundles are checked with `verifyProofBundle` rather than the `requirePass`
 * gate. No crew bundle can pass that gate and the human verdict is not the reason.
 */

const roots: string[] = [];

/** Every temporary bundle this fixture made. Call from `afterAll`. */
export const removeVerdictBundles = async (): Promise<void> => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
};

export const CRITERIA = [
  'narration is intelligible, complete, continuous and matches every fictional fact',
  'all eight catalogue capabilities are perceptibly distinct and synchronized to the voice',
  'character, chronology, trend, comparison, statistic and quote remain legible',
  'the image placeholder is honest visible degradation',
  'composition, typography, motion and pace remain coherent across the full film',
  'the complete preview is watchable and listenable without explanation',
] as const;

export const PREVIEW_SHA256 = 'a'.repeat(64);
export const TAKE_ID = '6a329bf5bc47';

export const SUMMARY = `# Fixture proof evidence

- Proof id: fixture-proof-v1
- Machine verdict: not-evidenced
- Human verdict: pending
- Code-blind end-to-end claim: no

Pending human review is incomplete, never pass.
`;

/**
 * A bundle with the smallest shape `verifyProofBundle` accepts, sealed and unsigned.
 *
 * `criteria` is a parameter so a sheet can be sealed with a row count a signed pass could never
 * satisfy. That is not a hypothetical shape: `scenarios.ts` supplies each scenario's rows as a
 * plain list, and nothing was holding it to six until `proof-scenarios.test.ts` began to.
 */
export const pendingBundle = async (criteria: readonly string[] = CRITERIA): Promise<string> => {
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
    rows: criteria.map((criterion) => ({ criterion, verdict: 'pending', note: null })),
    note: 'Pending is incomplete, never pass. This verdict does not close gap 8.',
  });
  await writeFile(join(root, 'SUMMARY.md'), SUMMARY, 'utf8');
  await writeHashIndex(root);
  return root;
};

/** A complete, well-formed signing input for the sealed sheet, before any override. */
export const verdictInput = (overrides: Partial<HumanVerdictInput> = {}): HumanVerdictInput => ({
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
