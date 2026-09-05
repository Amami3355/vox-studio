import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type VolumeProbe,
  assertPersistentVolumeMounted,
  assertWritesLandOnVolume,
} from '../src/ipc/persistent-volume';

/**
 * Ticket 07: *"a container that starts without its disk and writes a Run to its own ephemeral
 * filesystem produces a Run that vanishes on the next restart, and the platform restarts it for
 * you."*
 *
 * The reason this is a real check rather than an `existsSync` is that the mount point is created
 * **by the image**. `WORKDIR`/`mkdir` puts `/var/lib/vox` in a layer, so when the disk fails to
 * attach the directory is still there, still writable, and every Run lands on the container's
 * own filesystem. Existence cannot tell the two cases apart. A device comparison against the
 * parent can: a mounted filesystem has its own device number and an image directory shares its
 * parent's.
 *
 * The probe is injected because the positive case — a genuinely separate filesystem — cannot be
 * constructed on the Windows machine this suite runs on. The negative case can, and does, below.
 */
/**
 * Stub keys go through `resolve` because the module under test does, and this suite runs on
 * Windows where `resolve('/var/lib/vox')` is `C:\var\lib\vox`. Keying on the literal POSIX string
 * would make every stub miss — which is how this fixture was first written, and the tests said so.
 */
const probeOf = (devices: Record<string, number>, missing: string[] = []): VolumeProbe => {
  const byPath = new Map(Object.entries(devices).map(([path, device]) => [resolve(path), device]));
  const absent = new Set(missing.map((path) => resolve(path)));
  return {
    exists: (path) => !absent.has(path),
    deviceOf: (path) => {
      const device = byPath.get(path);
      if (device === undefined) throw new Error(`no stub device for ${path}`);
      return device;
    },
  };
};

describe('refusing to start without the persistent volume', () => {
  it('accepts a mount point whose device differs from its parent', () => {
    const probe = probeOf({ '/var/lib/vox': 2049, '/var/lib': 254 });

    expect(() => assertPersistentVolumeMounted('/var/lib/vox', probe)).not.toThrow();
  });

  it('refuses a mount point that is only a directory in the image', () => {
    // The disk did not attach. The directory exists because a layer created it.
    const probe = probeOf({ '/var/lib/vox': 254, '/var/lib': 254 });

    expect(() => assertPersistentVolumeMounted('/var/lib/vox', probe)).toThrow(
      /VOLUME_NOT_MOUNTED/,
    );
  });

  it('refuses a mount point that is not there at all', () => {
    const probe = probeOf({ '/var/lib': 254 }, ['/var/lib/vox']);

    expect(() => assertPersistentVolumeMounted('/var/lib/vox', probe)).toThrow(/VOLUME_ABSENT/);
  });

  it('names the path it refused, so the operator knows which mount failed', () => {
    const probe = probeOf({ '/var/lib/vox': 254, '/var/lib': 254 });

    expect(() => assertPersistentVolumeMounted('/var/lib/vox', probe)).toThrow(/\/var\/lib\/vox/);
  });
});

/**
 * The default probe is the one that runs in the container, so it gets exercised against a real
 * filesystem rather than left to be first executed on the VM. A temporary directory under the
 * system temp root is not a mount point, which is precisely the negative case.
 */
describe('the default probe, against a real filesystem', () => {
  let root: string | null = null;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = null;
  });

  it('refuses an ordinary directory, having consulted the real filesystem', async () => {
    root = await mkdtemp(join(tmpdir(), 'vox-volume-'));

    expect(() => assertPersistentVolumeMounted(root as string)).toThrow(/VOLUME_NOT_MOUNTED/);
  });

  it('refuses a path that does not exist', async () => {
    root = await mkdtemp(join(tmpdir(), 'vox-volume-'));

    expect(() => assertPersistentVolumeMounted(join(root as string, 'absent'))).toThrow(
      /VOLUME_ABSENT/,
    );
  });
});

/**
 * The gap the mount check could not see, found by the spec review of `bc5a7dc..4915cef`: the
 * volume can be mounted, and correct, while every path the service writes to points somewhere
 * else. `assertPersistentVolumeMounted` stays green throughout, because it was never asked.
 */
describe('the paths the service writes to', () => {
  const VOLUME = '/var/lib/vox';

  it('accepts paths on the volume, and the volume root itself', () => {
    expect(() =>
      assertWritesLandOnVolume(VOLUME, {
        VOX_RUNS_ROOT: '/var/lib/vox/runs',
        VOX_LEDGER_ROOT: '/var/lib/vox/ledger',
        VOX_CALIBRATION_PATH: '/var/lib/vox/calibration.json',
        AT_THE_ROOT: '/var/lib/vox',
      }),
    ).not.toThrow();
  });

  it.each([
    ['VOX_LEDGER_ROOT', '/var/lib/ledger'],
    ['VOX_RUNS_ROOT', '/srv/runs'],
    ['VOX_CALIBRATION_PATH', '/tmp/calibration.json'],
  ])('refuses %s when it points off the volume', (name, path) => {
    expect(() => assertWritesLandOnVolume(VOLUME, { [name]: path })).toThrow(/VOLUME_ESCAPED/);
  });

  it('names the offending variable and its path, because the operator has to fix one of them', () => {
    expect(() => assertWritesLandOnVolume(VOLUME, { VOX_LEDGER_ROOT: '/var/lib/ledger' })).toThrow(
      /VOX_LEDGER_ROOT/,
    );
  });

  /**
   * A string prefix would accept this, and that is the reason `relative()` is used instead. The
   * sibling directory shares every character of the mount point and is a different filesystem.
   */
  it('refuses a sibling whose name merely starts with the mount point', () => {
    expect(() =>
      assertWritesLandOnVolume(VOLUME, { VOX_RUNS_ROOT: '/var/lib/voxen/runs' }),
    ).toThrow(/VOLUME_ESCAPED/);
  });

  it('refuses a path that climbs back out of the volume', () => {
    expect(() =>
      assertWritesLandOnVolume(VOLUME, { VOX_RUNS_ROOT: '/var/lib/vox/../elsewhere' }),
    ).toThrow(/VOLUME_ESCAPED/);
  });
});
