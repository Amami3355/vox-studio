import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * The two filesystem questions this check asks, injectable so both answers can be stubbed.
 *
 * `exists` is *exists and is a directory*: a regular file at the mount point is not a mount and
 * is refused by the same branch, because the operator's mistake is the same shape.
 */
export type VolumeProbe = {
  exists: (path: string) => boolean;
  deviceOf: (path: string) => number;
};

const defaultProbe: VolumeProbe = {
  exists: (path) => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  },
  deviceOf: (path) => statSync(path).dev,
};

/**
 * Refuses to continue unless `mountPoint` is a *separately mounted* filesystem.
 *
 * **Existence is not the check, and this is the whole point of the function.** The mount point is
 * created by the image — a layer makes `/var/lib/vox` so the container has somewhere to mount —
 * so when the disk fails to attach the directory is still present and still writable. Every Run
 * then lands on the container's own filesystem and disappears at the next restart, which the
 * platform performs for you. The symptom is silence, and ADR-0018 decision 8 requires the refusal
 * be asserted rather than assumed for exactly that reason.
 *
 * A mounted filesystem has its own device number; a directory in the image shares its parent's.
 * That comparison distinguishes the two cases, and nothing cheaper does.
 *
 * **The known limit: this proves a separate filesystem, not the *intended* one.** A `tmpfs` at the
 * mount point passes. Identifying the specific disk is ticket 04's `identity.txt`, which is
 * written onto the volume and read back — a different check, owed at the conformance run, and not
 * a substitute for this one.
 */
export const assertPersistentVolumeMounted = (
  mountPoint: string,
  probe: VolumeProbe = defaultProbe,
): void => {
  const path = resolve(mountPoint);
  const parent = dirname(path);

  if (!probe.exists(path)) {
    throw new Error(
      `VOLUME_ABSENT: the persistent volume is not present at ${mountPoint}. The service refuses to start rather than write Runs that vanish at the next restart.`,
    );
  }

  // The filesystem root is its own parent. It is not a plausible mount point for this volume and
  // the comparison below would compare a path with itself, so it is refused explicitly.
  if (parent === path) {
    throw new Error(
      `VOLUME_NOT_MOUNTED: ${mountPoint} is a filesystem root and is not this service's volume.`,
    );
  }

  if (probe.deviceOf(path) === probe.deviceOf(parent)) {
    throw new Error(
      `VOLUME_NOT_MOUNTED: ${mountPoint} exists but shares a device with ${parent}, so it is a directory in the image rather than the attached disk. A Run written here would be lost at the next restart.`,
    );
  }
};
