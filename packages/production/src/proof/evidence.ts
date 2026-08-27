import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, relative, resolve } from 'node:path';
import { type ProofAssertion, type ProofOutcome, machineVerdict, withOutcomes } from './assertions';

export type FileInventoryEntry = { path: string; bytes: number; sha256: string };
export type LeakScan = { pass: boolean; scanned: string[]; violations: string[] };

const forbiddenExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.map',
  '.pdb',
  '.zip',
  '.jar',
  '.asar',
]);

const forbiddenMarkers = [
  'sourcesContent',
  'sourceMappingURL',
  'ProductionCommandService',
  'reportDegradedAsset',
  'Collected while the sections are built and gated once at the end',
  'node_modules',
  'packages/production',
  'packages\\production',
  'packages/video/src',
  'packages\\video\\src',
  'ELEVENLABS_API_KEY',
  'VOX_GRANT_KEY',
  'VOX_RUN_HMAC_KEY',
] as const;

export const sha256 = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex');

const walk = async (root: string): Promise<string[]> => {
  const paths: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Evidence path is a link: ${entry.name}`);
    if (entry.isDirectory()) paths.push(...(await walk(path)));
    else if (entry.isFile()) paths.push(path);
  }
  return paths.sort();
};

export const inventoryFiles = async (root: string): Promise<FileInventoryEntry[]> => {
  const absoluteRoot = resolve(root);
  const entries: FileInventoryEntry[] = [];
  for (const path of await walk(absoluteRoot)) {
    const bytes = await readFile(path);
    entries.push({
      path: relative(absoluteRoot, path).replaceAll('\\', '/'),
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
  }
  return entries;
};

export const scanReadableFiles = async (
  root: string,
  repositoryPath: string,
): Promise<LeakScan> => {
  const files = await walk(resolve(root));
  const violations: string[] = [];
  const repository = resolve(repositoryPath).toLowerCase();
  for (const path of files) {
    const item = relative(resolve(root), path).replaceAll('\\', '/');
    const extension = extname(path).toLowerCase();
    if (forbiddenExtensions.has(extension)) violations.push(`${item}:forbidden-extension`);
    const bytes = await readFile(path);
    if (bytes.indexOf(Buffer.from('PK\x03\x04', 'latin1')) !== -1) {
      violations.push(`${item}:embedded-archive`);
    }
    const views = [bytes.toString('latin1'), bytes.toString('utf16le')];
    for (const marker of forbiddenMarkers) {
      if (views.some((view) => view.includes(marker))) violations.push(`${item}:marker:${marker}`);
    }
    if (views.some((view) => view.toLowerCase().includes(repository))) {
      violations.push(`${item}:repository-path`);
    }
  }
  return {
    pass: violations.length === 0,
    scanned: files.map((path) => relative(resolve(root), path).replaceAll('\\', '/')),
    violations,
  };
};

export const writeJson = async (path: string, value: unknown): Promise<void> => {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

export const writeJsonLines = async (path: string, values: unknown[]): Promise<void> => {
  await writeFile(path, `${values.map((value) => JSON.stringify(value)).join('\n')}\n`, 'utf8');
};

export const writeHashIndex = async (root: string): Promise<Record<string, string>> => {
  const index = Object.fromEntries(
    (await inventoryFiles(root))
      .filter((entry) => entry.path !== 'hash-index.json')
      .map((entry) => [entry.path, entry.sha256]),
  );
  await writeJson(resolve(root, 'hash-index.json'), index);
  return index;
};

/**
 * How many criteria a signed human verdict answers.
 *
 * Exported because two modules have to agree on it and once did not. This file decides whether a
 * signed pass is complete; `sign-verdict.ts` decides whether an input may be written at all. When
 * the second checked the input against the *sealed* sheet's row count and the first checked it
 * against a literal six, a sheet sealed with any other number could be signed and only then fail
 * to verify — files written, bundle unreadable. One constant, read by both, is what stops that.
 *
 * It is a fixed number rather than the sealed sheet's own length because the six criteria are the
 * watch-and-listen sheet, not a per-scenario detail: `proof-scenarios.test.ts` holds every
 * scenario to it, so a scenario that grows a seventh criterion fails there — where the decision
 * is — rather than here, on a bundle somebody was trying to sign.
 */
export const SIGNED_VERDICT_ROWS = 6;

export const verifyProofBundle = async (
  root: string,
  options: { requirePass?: boolean } = {},
): Promise<{ machineVerdict: ProofOutcome; humanVerdict: 'pass' | 'fail' | 'pending' }> => {
  const absoluteRoot = resolve(root);
  const index = JSON.parse(
    await readFile(resolve(absoluteRoot, 'hash-index.json'), 'utf8'),
  ) as Record<string, string>;
  const actual = await inventoryFiles(absoluteRoot);
  const actualPaths = actual
    .map((entry) => entry.path)
    .filter((path) => path !== 'hash-index.json')
    .sort();
  const indexedPaths = Object.keys(index).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(indexedPaths)) {
    throw new Error('PROOF_HASH_INDEX_INCOMPLETE');
  }
  for (const entry of actual) {
    if (entry.path !== 'hash-index.json' && index[entry.path] !== entry.sha256) {
      throw new Error(`PROOF_HASH_MISMATCH:${entry.path}`);
    }
  }

  const bundle = JSON.parse(await readFile(resolve(absoluteRoot, 'assertions.json'), 'utf8')) as {
    machineVerdict: ProofOutcome;
    assertions: Array<Omit<ProofAssertion, 'outcome'> & { outcome?: ProofOutcome }>;
  };
  if (!Array.isArray(bundle.assertions) || bundle.assertions.length === 0) {
    throw new Error('PROOF_ASSERTIONS_ABSENT');
  }
  const assertions = withOutcomes(bundle.assertions);
  for (const assertion of assertions) {
    if (
      !assertion.id ||
      !Array.isArray(assertion.evidence) ||
      assertion.evidence.length === 0 ||
      typeof assertion.pass !== 'boolean' ||
      !['pass', 'fail', 'not-evidenced'].includes(assertion.outcome) ||
      assertion.pass !== (assertion.outcome === 'pass')
    ) {
      throw new Error('PROOF_ASSERTION_MALFORMED');
    }
    for (const evidence of assertion.evidence) {
      await lstat(resolve(absoluteRoot, evidence)).catch(() => {
        throw new Error(`PROOF_ASSERTION_EVIDENCE_MISSING:${assertion.id}:${evidence}`);
      });
    }
  }
  // Re-derived rather than trusted, and derived by the same function the harness used, so the
  // bundle cannot record a verdict its own assertions do not support.
  const derivedMachineVerdict = machineVerdict(assertions);
  if (bundle.machineVerdict !== derivedMachineVerdict) {
    throw new Error('PROOF_MACHINE_VERDICT_MISMATCH');
  }

  const human = JSON.parse(await readFile(resolve(absoluteRoot, 'human-verdict.json'), 'utf8')) as {
    humanVerdict: 'pass' | 'fail' | 'pending';
    evaluator?: unknown;
    evaluatedAt?: unknown;
    displayAndAudioSetup?: unknown;
    previewSha256?: unknown;
    takeId?: unknown;
    rows?: Array<{ verdict?: unknown; note?: unknown }>;
  };
  if (!['pass', 'fail', 'pending'].includes(human.humanVerdict)) {
    throw new Error('PROOF_HUMAN_VERDICT_MALFORMED');
  }
  const checkpoint = JSON.parse(
    await readFile(resolve(absoluteRoot, 'main-run/run.json'), 'utf8'),
  ) as {
    bindings?: {
      render?: { preview?: { sha256?: unknown } } | null;
      take?: { takeId?: unknown } | null;
    };
  };
  if (
    human.previewSha256 !== checkpoint.bindings?.render?.preview?.sha256 ||
    human.takeId !== checkpoint.bindings?.take?.takeId
  ) {
    throw new Error('PROOF_HUMAN_VERDICT_ARTIFACT_MISMATCH');
  }
  if (human.humanVerdict === 'pass') {
    const signed =
      typeof human.evaluator === 'string' &&
      human.evaluator.length > 0 &&
      typeof human.evaluatedAt === 'string' &&
      !Number.isNaN(Date.parse(human.evaluatedAt)) &&
      typeof human.displayAndAudioSetup === 'string' &&
      human.displayAndAudioSetup.length > 0 &&
      human.rows?.length === SIGNED_VERDICT_ROWS &&
      human.rows.every(
        (row) => row.verdict === 'pass' && typeof row.note === 'string' && row.note.length > 0,
      );
    if (!signed) throw new Error('PROOF_HUMAN_VERDICT_INCOMPLETE');
  }
  if (options.requirePass && (derivedMachineVerdict !== 'pass' || human.humanVerdict !== 'pass')) {
    throw new Error('PROOF_VERDICT_NOT_PASS');
  }
  if (options.requirePass) {
    const environment = JSON.parse(
      await readFile(resolve(absoluteRoot, 'environment.json'), 'utf8'),
    ) as {
      provider?: unknown;
      agent?: unknown;
      claimEligible?: unknown;
      transcriptComplete?: unknown;
      directNetworkPolicy?: { denied?: unknown; events?: unknown[] };
    };
    if (
      environment.provider !== 'elevenlabs' ||
      environment.agent !== 'fresh-generalist' ||
      environment.claimEligible !== true ||
      environment.transcriptComplete !== true ||
      environment.directNetworkPolicy?.denied !== true ||
      environment.directNetworkPolicy.events?.length !== 0
    ) {
      throw new Error('PROOF_ENVIRONMENT_NOT_CLAIM_ELIGIBLE');
    }
  }
  if ((await stat(resolve(absoluteRoot, 'SUMMARY.md'))).size < 1) {
    throw new Error('PROOF_SUMMARY_ABSENT');
  }
  if (basename(absoluteRoot).length < 1 || (await lstat(absoluteRoot)).isSymbolicLink()) {
    throw new Error('PROOF_ROOT_INVALID');
  }
  return { machineVerdict: derivedMachineVerdict, humanVerdict: human.humanVerdict };
};
