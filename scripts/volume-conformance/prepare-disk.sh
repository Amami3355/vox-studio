#!/usr/bin/env bash
#
# Format (once) and mount the run store's persistent disk. Runs on the VM, as
# root, driven by run-check.sh.
#
#   sudo prepare-disk.sh [disk-name] [mount-point]
#
# It will format a device that has no filesystem and it will never reformat one
# that has. The run store is the thing this whole phase is trying to keep, and a
# script that can silently erase it is not one to keep around.

set -euo pipefail

DISK_NAME="${1:-vox-runs}"
MOUNT_POINT="${2:-/mnt/disks/vox-runs}"
BY_ID="/dev/disk/by-id/google-${DISK_NAME}"

fail() {
  printf 'prepare-disk: %s\n' "$1" >&2
  exit 1
}

[[ -e "$BY_ID" ]] || fail "no attached disk named '${DISK_NAME}' (looked for ${BY_ID})"
DEVICE="$(readlink -f "$BY_ID")"

detect_fs() {
  if command -v blkid >/dev/null 2>&1; then
    blkid -o value -s TYPE "$DEVICE" 2>/dev/null || true
  elif command -v lsblk >/dev/null 2>&1; then
    lsblk -no FSTYPE "$DEVICE" 2>/dev/null | head -n1 || true
  fi
}

EXISTING_FS="$(detect_fs)"
FORMATTED="no"
MKFS_VIA="n/a"
MKFS_OPTIONS="-m 0 -E lazy_itable_init=0,lazy_journal_init=0,discard"

if [[ -z "$EXISTING_FS" ]]; then
  # Container-Optimized OS is deliberately thin, so the filesystem tools may not
  # be on the host. A privileged container carrying e2fsprogs formats the same
  # device just as well, and which path was taken is recorded rather than
  # assumed.
  if command -v mkfs.ext4 >/dev/null 2>&1; then
    # shellcheck disable=SC2086
    mkfs.ext4 -F $MKFS_OPTIONS "$DEVICE" >/dev/null
    MKFS_VIA="host"
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm --privileged -v /dev:/dev debian:12-slim \
      sh -c "mkfs.ext4 -F $MKFS_OPTIONS $DEVICE" >/dev/null
    MKFS_VIA="container(debian:12-slim)"
  else
    fail "no mkfs.ext4 on the host and no docker to borrow one from"
  fi
  FORMATTED="yes"
  EXISTING_FS="$(detect_fs)"
fi

mkdir -p "$MOUNT_POINT"
ALREADY_MOUNTED="yes"
if ! mountpoint -q "$MOUNT_POINT" 2>/dev/null && ! grep -q " ${MOUNT_POINT} " /proc/mounts; then
  mount -o discard,defaults "$DEVICE" "$MOUNT_POINT"
  ALREADY_MOUNTED="no"
fi

# Ownership is left as root's, deliberately. `chmod a+w` is what the generic
# guide says and it is wrong for a store that holds attested runs; which uid the
# service container runs as, and who owns this directory, is ticket 07's
# decision and it should make it knowingly.
OWNERSHIP="$(stat -c '%U:%G %a' "$MOUNT_POINT")"
UUID="$(blkid -o value -s UUID "$DEVICE" 2>/dev/null || echo unknown)"
MOUNT_LINE="$(grep " ${MOUNT_POINT} " /proc/mounts | head -n1)"

# Key=value rather than JSON: the driver captures this, and the VM is not
# guaranteed to carry a JSON tool.
cat <<REPORT
disk_name=${DISK_NAME}
by_id=${BY_ID}
device=${DEVICE}
filesystem=${EXISTING_FS}
uuid=${UUID}
formatted_this_run=${FORMATTED}
mkfs_via=${MKFS_VIA}
mkfs_options=${MKFS_OPTIONS}
mount_point=${MOUNT_POINT}
mounted_this_run=$([[ "$ALREADY_MOUNTED" == "no" ]] && echo yes || echo no)
mount_line=${MOUNT_LINE}
ownership=${OWNERSHIP}
persists_across_reboot=no
kernel=$(uname -srm)
os=$(grep -E '^PRETTY_NAME=' /etc/os-release | cut -d= -f2- | tr -d '"')
REPORT
