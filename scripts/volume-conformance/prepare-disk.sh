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

# Three answers, not two. A probe that found a filesystem prints it; a probe that
# ran and found nothing prints nothing; a probe that could not run at all returns
# non-zero. Collapsing the third into the second is how a script that promises
# never to reformat a disk reformats one: `blkid` exits 2 for "nothing here" and
# something else entirely when it cannot read the device, and `|| true` cannot
# tell those apart.
#
# The probe is chosen here rather than inside the function, because the function
# is called in a command substitution and anything it assigns dies with the
# subshell.
if command -v blkid >/dev/null 2>&1; then
  FS_PROBE="blkid"
elif command -v lsblk >/dev/null 2>&1; then
  FS_PROBE="lsblk"
else
  FS_PROBE="none"
fi

detect_fs() {
  local output status
  case "$FS_PROBE" in
    blkid)
      output="$(blkid -o value -s TYPE "$DEVICE" 2>/dev/null)"
      status=$?
      case "$status" in
        0) printf '%s' "$output"; return 0 ;;
        2) return 0 ;;
        *) return 1 ;;
      esac
      ;;
    lsblk)
      output="$(lsblk -no FSTYPE "$DEVICE" 2>/dev/null | head -n1)"
      status=$?
      [[ "$status" -eq 0 ]] || return 1
      printf '%s' "${output//[[:space:]]/}"
      return 0
      ;;
    *) return 1 ;;
  esac
}

if ! EXISTING_FS="$(detect_fs)"; then
  fail "cannot tell whether ${DEVICE} already carries a filesystem — the ${FS_PROBE} probe did not answer. Refusing to format: 'cannot tell' is not 'blank', and this disk is the run store."
fi
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
  EXISTING_FS="$(detect_fs)" || EXISTING_FS="unknown"
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
fs_probe=${FS_PROBE}
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
