/**
 * A work root is exactly two files: the launcher and the Brief's request. That is not a tidiness
 * preference — it is the whole of the agent's readable world, and `isolation.initial-two-files`
 * asserts it after the fact. Assembling one by hand is precisely how the invariant quietly stops
 * being true: an extra note, a leftover plan from the last attempt, an editor's backup file, and
 * the agent is reading something nobody decided to give it.
 *
 * So there is one way to build one, it verifies what it built, and it refuses rather than leaving
 * a work root that is nearly right. A nearly-right work root fails much later, in the leak scan or
 * in an assertion, long after the run that produced it has been forgotten.
 */

import { cp, mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/** Sorted, because that is how both the inventory and the assertion compare them. */
export const WORK_ROOT_FILES = ['request.json', 'vox.exe'] as const;

/**
 * What is wrong with a work root's contents, as a list rather than a boolean, so a refusal can
 * name the file that should not be there instead of only saying no.
 */
export const workRootViolations = (entries: readonly string[]): string[] => {
  const present = new Set(entries);
  const violations = WORK_ROOT_FILES.filter((name) => !present.has(name)).map(
    (name) => `missing:${name}`,
  );
  return [
    ...violations,
    ...entries
      .filter((entry) => !(WORK_ROOT_FILES as readonly string[]).includes(entry))
      .sort()
      .map((entry) => `unexpected:${entry}`),
  ];
};

const entriesOf = async (directory: string): Promise<string[] | null> =>
  readdir(directory).then(
    (entries) => entries.sort(),
    () => null,
  );

/**
 * Whether an existing directory is one of ours and may therefore be rebuilt. A work root holding
 * anything else belongs to somebody's run, and replacing it would destroy evidence.
 */
const isRebuildable = (entries: string[]): boolean =>
  entries.length === 0 || workRootViolations(entries).length === 0;

export type WorkRootResult = {
  workRoot: string;
  files: string[];
  action: 'created' | 'rebuilt';
};

/**
 * Builds the work root in a staging directory and moves it into place only once it is complete
 * and verified, so an interrupted bootstrap leaves either the previous work root or nothing —
 * never half of a new one.
 */
export const assembleWorkRoot = async (input: {
  workRoot: string;
  launcherPath: string;
  request: unknown;
  /** Replace a work root holding something other than the two files. Off by default. */
  force?: boolean;
}): Promise<WorkRootResult> => {
  const workRoot = resolve(input.workRoot);
  const existing = await entriesOf(workRoot);
  if (existing !== null && !isRebuildable(existing) && input.force !== true) {
    throw new Error(`WORKROOT_OCCUPIED:${workRootViolations(existing).join(',')}`);
  }

  const staging = await mkdtemp(`${workRoot}.staging-`);
  try {
    await cp(resolve(input.launcherPath), join(staging, 'vox.exe'));
    await writeFile(
      join(staging, 'request.json'),
      `${JSON.stringify(input.request, null, 2)}\n`,
      'utf8',
    );
    const staged = await entriesOf(staging);
    const stagedViolations = workRootViolations(staged ?? []);
    if (stagedViolations.length > 0) {
      throw new Error(`WORKROOT_STAGING_INVALID:${stagedViolations.join(',')}`);
    }
    await mkdir(dirname(workRoot), { recursive: true });
    await rm(workRoot, { recursive: true, force: true });
    await rename(staging, workRoot);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }

  // Verified from disk rather than from what we believe we wrote, because the point of this
  // function is that nobody downstream has to check.
  const files = (await entriesOf(workRoot)) ?? [];
  const violations = workRootViolations(files);
  if (violations.length > 0) {
    await rm(workRoot, { recursive: true, force: true });
    throw new Error(`WORKROOT_INVALID:${violations.join(',')}`);
  }
  return { workRoot, files, action: existing === null ? 'created' : 'rebuilt' };
};

/**
 * Asserts the invariant on a work root somebody else built. The harness builds its own disposable
 * work root inline; this is how it fails at the point of the mistake rather than in an assertion
 * an hour later.
 */
export const verifyWorkRoot = async (workRoot: string): Promise<string[]> => {
  const files = (await entriesOf(resolve(workRoot))) ?? [];
  const violations = workRootViolations(files);
  if (violations.length > 0) throw new Error(`WORKROOT_INVALID:${violations.join(',')}`);
  return files;
};
