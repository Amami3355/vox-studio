import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  WORK_ROOT_FILES,
  assembleWorkRoot,
  verifyWorkRoot,
  workRootViolations,
} from '../src/proof/workroot';

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const scratch = async () => {
  const parent = await mkdtemp(join(tmpdir(), 'vox-workroot-test-'));
  roots.push(parent);
  const launcherPath = join(parent, 'vox.exe');
  await writeFile(launcherPath, 'MZ-not-really-a-launcher');
  return { parent, launcherPath, workRoot: join(parent, 'agent') };
};

const request = { protocolVersion: 1, brief: { id: 'test-brief', text: 'a brief' } };

describe('work root contents', () => {
  it('names both what is missing and what should not be there', () => {
    expect(workRootViolations([...WORK_ROOT_FILES])).toEqual([]);
    expect(workRootViolations(['vox.exe'])).toEqual(['missing:request.json']);
    expect(workRootViolations(['request.json', 'vox.exe', 'notes.md', 'plan.json'])).toEqual([
      'unexpected:notes.md',
      'unexpected:plan.json',
    ]);
  });
});

describe('bootstrapping a work root', () => {
  it('produces exactly the launcher and the Brief request', async () => {
    const { launcherPath, workRoot } = await scratch();
    const result = await assembleWorkRoot({ workRoot, launcherPath, request });
    expect(result.action).toBe('created');
    expect(result.files).toEqual(['request.json', 'vox.exe']);
    expect(await readdir(workRoot)).toEqual(['request.json', 'vox.exe']);
    expect(JSON.parse(await readFile(join(workRoot, 'request.json'), 'utf8'))).toEqual(request);
  });

  it('is safe to re-run and produces the same result', async () => {
    const { launcherPath, workRoot } = await scratch();
    const first = await assembleWorkRoot({ workRoot, launcherPath, request });
    const second = await assembleWorkRoot({ workRoot, launcherPath, request });
    expect(second.action).toBe('rebuilt');
    expect(second.files).toEqual(first.files);
    expect(await readFile(join(workRoot, 'request.json'), 'utf8')).toBe(
      `${JSON.stringify(request, null, 2)}\n`,
    );
  });

  it("refuses a directory holding somebody's run rather than replacing it", async () => {
    const { launcherPath, workRoot } = await scratch();
    await assembleWorkRoot({ workRoot, launcherPath, request });
    await writeFile(join(workRoot, 'plan.json'), '{}');
    await expect(assembleWorkRoot({ workRoot, launcherPath, request })).rejects.toThrow(
      'WORKROOT_OCCUPIED:unexpected:plan.json',
    );
    // Refusing means leaving it exactly as it was, not tidying it up on the way out.
    expect((await readdir(workRoot)).sort()).toEqual(['plan.json', 'request.json', 'vox.exe']);
  });

  it('replaces an occupied work root only when told to explicitly', async () => {
    const { launcherPath, workRoot } = await scratch();
    await assembleWorkRoot({ workRoot, launcherPath, request });
    await writeFile(join(workRoot, 'plan.json'), '{}');
    const result = await assembleWorkRoot({ workRoot, launcherPath, request, force: true });
    expect(result.files).toEqual(['request.json', 'vox.exe']);
  });

  it('leaves nothing behind when the launcher is not there to copy', async () => {
    const { parent, workRoot } = await scratch();
    await expect(
      assembleWorkRoot({ workRoot, launcherPath: join(parent, 'absent.exe'), request }),
    ).rejects.toThrow();
    await expect(readdir(workRoot)).rejects.toThrow();
    // Not even the staging directory: a failed bootstrap adds nothing to the parent.
    expect((await readdir(parent)).sort()).toEqual(['vox.exe']);
  });

  it('accepts a work root somebody else built, and rejects one with an extra file', async () => {
    const { launcherPath, workRoot } = await scratch();
    await assembleWorkRoot({ workRoot, launcherPath, request });
    await expect(verifyWorkRoot(workRoot)).resolves.toEqual(['request.json', 'vox.exe']);
    await writeFile(join(workRoot, 'notes.md'), 'a hint the agent was never given');
    await expect(verifyWorkRoot(workRoot)).rejects.toThrow('WORKROOT_INVALID:unexpected:notes.md');
  });
});
