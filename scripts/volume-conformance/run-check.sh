#!/usr/bin/env bash
#
# Volume conformance check, driven from the operator's machine — cloud-phase
# ticket 04.
#
# The claim being tested is about the mount *as the runtime delivers it*, so the
# check runs from a container on the real VM, against the real disk, under the
# production identity. Running it anywhere else proves something adjacent.
#
#   scripts/volume-conformance/run-check.sh [--yes] [--skip-control] [--control-only] [--keep-bucket]
#
# On Windows, run it through Git's bash rather than PowerShell's `bash`, which
# resolves to WSL's stub:
#   & "C:\Program Files\Git\bin\bash.exe" scripts/volume-conformance/run-check.sh
#
# Results land in .scratch/cloud-phase/ticket-04/ and are the point of the run:
# a mount that fails is a finding worth as much as a pass.

set -euo pipefail

# ── presentation, matching scripts/provision-cloud-project.sh ──────────────
if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

TOTAL_STAGES=6
_STAGE_INDEX=0
stage() {
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' "$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}
say()  { printf '  %s\n' "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
bad()  { printf '  %s✗%s %s\n' "$RED" "$RESET" "$1"; }
die()  { bad "$1"; exit 1; }
confirm() {
  local reply=""
  # --yes exists so the run works with no terminal attached. Without it and
  # without a terminal, `read` sees EOF and the answer is no, which would skip
  # the control silently — the one outcome this check cannot afford.
  if [[ "${ASSUME_YES:-no}" == "yes" ]]; then
    printf '  %s? %s [y/N] %syes (--yes)%s\n' "$YELLOW" "$1" "$GREEN" "$RESET"
    return 0
  fi
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

SKIP_CONTROL="no"
CONTROL_ONLY="no"
KEEP_BUCKET="no"
ASSUME_YES="no"
for argument in "$@"; do
  case "$argument" in
    --skip-control) SKIP_CONTROL="yes" ;;
    --control-only) CONTROL_ONLY="yes" ;;
    --keep-bucket)  KEEP_BUCKET="yes" ;;
    --yes|-y)       ASSUME_YES="yes" ;;
    *) die "unknown option $argument" ;;
  esac
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
EVIDENCE_DIR="$REPO_ROOT/.scratch/cloud-phase/ticket-04"
mkdir -p "$EVIDENCE_DIR"

# ── gcloud, resolved once ─────────────────────────────────────────────────
# The wizard looks for `gcloud` and `gcloud.cmd` on PATH. That is not enough on
# a Windows box where the SDK installed itself but the shell predates the PATH
# it added, which is exactly the state this machine was in.
#
# The SDK's extensionless `gcloud` is a shell script and is executable here; the
# `gcloud.cmd` beside it is not — `[[ -x ]]` is false for it under Git Bash even
# though it runs. So the shell wrapper is preferred at every location, the .cmd
# is a fallback, and the test is `-f` rather than `-x`.
GCLOUD=""
for candidate in gcloud gcloud.cmd \
  "$HOME/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud" \
  "$HOME/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd" \
  "/c/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud" \
  "/c/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd" \
  "$HOME/google-cloud-sdk/bin/gcloud"; do
  if command -v "$candidate" >/dev/null 2>&1 || [[ -f "$candidate" ]]; then
    GCLOUD="$candidate"; break
  fi
done
gc() { "$GCLOUD" "$@"; }

# ── configuration, from the wizard's own record ───────────────────────────
ENV_FILE="${VOX_CLOUD_ENV_FILE:-$HOME/.vox-cloud.env}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi
PROJECT="${VOX_CLOUD_PROJECT:-}"
REGION="${VOX_CLOUD_REGION:-europe-west1}"
ZONE="${VOX_CLOUD_ZONE:-europe-west1-c}"
INSTANCE="${VOX_CLOUD_INSTANCE:-vox-service}"
DISK="${VOX_CLOUD_DISK:-vox-runs}"
PRODUCTION_SA="${VOX_PRODUCTION_SA:-}"

MOUNT_POINT="/mnt/disks/${DISK}"
IN_CONTAINER="/var/lib/vox/runs"   # where ticket 07 will mount it
REMOTE_DIR="vc-04"
IMAGE="node:22-bookworm-slim"      # the base ticket 11 measured and ticket 07 ships
CONTROL_IMAGE="vox-volume-control"
CONTROL_BUCKET="${VOX_CONTROL_BUCKET:-${PROJECT}-volume-control}"

# The real disk gets the full run; the bucket gets a smaller one, because every
# write there is an upload. The parameters are recorded in each result, so the
# two are never mistaken for the same measurement.
CHECK_ARGS="--renames=200 --size=1048576 --rounds=200 --racers=4"
CONTROL_ARGS="--renames=20 --size=65536 --rounds=25 --racers=3"

on_vm() {
  gc compute ssh "$INSTANCE" --zone="$ZONE" --project="$PROJECT" \
    --tunnel-through-iap --quiet --command="$1"
}
# The remote home is captured rather than written as `~`: gcloud on Windows
# shells out to PuTTY's pscp, which does not expand a tilde and fails with
# "remote filespec ~/…: not a directory".
REMOTE_HOME=""
copy_to_vm() {
  gc compute scp --tunnel-through-iap --zone="$ZONE" --project="$PROJECT" \
    "$@" "${INSTANCE}:${REMOTE_HOME}/${REMOTE_DIR}/"
}
# The remote command's stdout is the JSON result; gcloud's own chatter goes to
# stderr. The result is pretty-printed, so it opens with a line that is exactly
# `{` — matching any line *starting* with `{` would also catch a single-line JSON
# log from something mounted underneath, which is how gcsfuse got in front of a
# result once.
extract_json() { awk 'seen || /^\{$/ { seen = 1; print }'; }

printf '\n%s%s  Volume conformance — cloud-phase ticket 04%s\n' "$BOLD" "$BLUE" "$RESET"
note "  $TOTAL_STAGES stages · results land in .scratch/cloud-phase/ticket-04/"

# ── 1 ─────────────────────────────────────────────────────────────────────
stage "The project, the box and the operator's tools"
[[ -n "$GCLOUD" ]] || die "gcloud was not found. Install it, or set PATH, and re-run."
[[ -n "$PROJECT" ]] || die "no project: $ENV_FILE is missing VOX_CLOUD_PROJECT. Run the provisioning wizard first."
ok "gcloud at $GCLOUD"
ok "project $PROJECT · zone $ZONE · instance $INSTANCE · disk $DISK"

STATUS="$(gc compute instances describe "$INSTANCE" --zone="$ZONE" --project="$PROJECT" \
  --format='value(status)' 2>/dev/null || true)"
[[ "$STATUS" == "RUNNING" ]] || die "instance $INSTANCE is '${STATUS:-not found}', not RUNNING."
ok "instance is RUNNING"

# ── 2 ─────────────────────────────────────────────────────────────────────
stage "What the box actually carries"
say "Container-Optimized OS is deliberately thin. What it has decides how the disk"
say "gets formatted, and it is recorded rather than assumed."
TOOLING="$(on_vm 'echo "user=$(id -un) uid=$(id -u)"; echo "home=$HOME"; echo "os=$(grep ^PRETTY_NAME= /etc/os-release | cut -d= -f2- | tr -d \")"; for t in docker mkfs.ext4 mount mountpoint lsblk blkid; do printf "%s=%s\n" "$t" "$(command -v $t 2>/dev/null || echo missing)"; done' 2>/dev/null || true)"
[[ -n "$TOOLING" ]] || die "could not reach $INSTANCE over the IAP tunnel."
printf '%s\n' "$TOOLING" | sed 's/^/    /'
printf '%s\n' "$TOOLING" > "$EVIDENCE_DIR/host-tooling.txt"
grep -q '^docker=/' <<<"$TOOLING" || die "no docker on the box; the check has nowhere to run."
ok "reachable over IAP, and docker is present"

REMOTE_HOME="$(printf '%s\n' "$TOOLING" | sed -n 's/^home=//p' | tr -d '\r')"
[[ -n "$REMOTE_HOME" ]] || die "could not read the remote home directory."
REMOTE_WORK="${REMOTE_HOME}/${REMOTE_DIR}"

on_vm "mkdir -p ${REMOTE_WORK}" >/dev/null
copy_to_vm "$HERE/check.mjs" "$HERE/prepare-disk.sh" \
  "$HERE/negative-control.Dockerfile" "$HERE/control-entrypoint.sh" >/dev/null
ok "check copied to ${REMOTE_WORK} on the box"

# ── 3 ─────────────────────────────────────────────────────────────────────
stage "The disk is formatted once and mounted"
if [[ "$CONTROL_ONLY" == "yes" ]]; then
  note "skipped: --control-only"
else
  say "It formats a device with no filesystem and never reformats one that has."
  DISK_REPORT="$(on_vm "sudo bash ${REMOTE_WORK}/prepare-disk.sh ${DISK} ${MOUNT_POINT}" 2>&1 || true)"
  printf '%s\n' "$DISK_REPORT" | grep -E '^[a-z_]+=' | sed 's/^/    /' || true
  printf '%s\n' "$DISK_REPORT" > "$EVIDENCE_DIR/mount-identity.txt"
  grep -q '^mount_point=' <<<"$DISK_REPORT" || die "the disk was not prepared: $DISK_REPORT"
  ok "mounted at $MOUNT_POINT"
  warn "this mount does not survive a reboot; persisting it is ticket 07's decision."
fi

# ── 4 ─────────────────────────────────────────────────────────────────────
stage "The check runs in a container, on the real disk"
if [[ "$CONTROL_ONLY" == "yes" ]]; then
  note "skipped: --control-only"
else
  say "Mounted where ticket 07 will mount it, on the VM whose identity is the"
  say "production service account. $CHECK_ARGS"
  RUN_CMD="sudo docker run --rm -v ${MOUNT_POINT}:${IN_CONTAINER} -v ${REMOTE_WORK}/check.mjs:/check.mjs:ro ${IMAGE} node /check.mjs ${IN_CONTAINER} ${CHECK_ARGS}"
  set +e
  on_vm "$RUN_CMD" > "$EVIDENCE_DIR/positive.raw" 2> >(tee "$EVIDENCE_DIR/positive.log" >&2)
  POSITIVE_STATUS=$?
  set -e
  extract_json < "$EVIDENCE_DIR/positive.raw" > "$EVIDENCE_DIR/positive.json"
  rm -f "$EVIDENCE_DIR/positive.raw"
  if [[ "$POSITIVE_STATUS" == "0" ]]; then
    ok "every asserted primitive holds on $MOUNT_POINT"
  else
    bad "the real disk did not pass (exit $POSITIVE_STATUS) — this is a finding, not a failure to hide"
  fi
  note "result: .scratch/cloud-phase/ticket-04/positive.json"
fi

# ── 5 ─────────────────────────────────────────────────────────────────────
stage "The negative control: the same check, on a mount known to lack the semantics"
if [[ "$SKIP_CONTROL" == "yes" ]]; then
  warn "skipped: --skip-control. A check that has never gone red is one nobody should believe."
else
  say "A FUSE-mounted bucket is the storage this phase already ruled out, which is"
  say "what makes it the control: the check has to fail here to be worth its pass."
  say ""
  note "This creates gs://$CONTROL_BUCKET in $REGION, grants the production identity"
  note "object access on that bucket alone, and deletes both at the end."
  if confirm "Create the control bucket and run it?"; then
    if gc storage buckets describe "gs://$CONTROL_BUCKET" --project="$PROJECT" >/dev/null 2>&1; then
      ok "bucket gs://$CONTROL_BUCKET already exists"
    else
      gc storage buckets create "gs://$CONTROL_BUCKET" --project="$PROJECT" \
        --location="$REGION" --uniform-bucket-level-access >/dev/null
      ok "created gs://$CONTROL_BUCKET"
    fi
    if [[ -n "$PRODUCTION_SA" ]]; then
      for role in roles/storage.objectAdmin roles/storage.legacyBucketReader; do
        gc storage buckets add-iam-policy-binding "gs://$CONTROL_BUCKET" \
          --member="serviceAccount:${PRODUCTION_SA}" --role="$role" >/dev/null
      done
      ok "granted the production identity object access on that bucket only"
    else
      warn "no VOX_PRODUCTION_SA in $ENV_FILE; gcsfuse may be refused."
    fi

    say "building the control image on the box (its network is Cloud NAT)…"
    on_vm "sudo docker build -q -f ${REMOTE_WORK}/negative-control.Dockerfile -t ${CONTROL_IMAGE} ${REMOTE_WORK}" >/dev/null \
      || die "the control image did not build; see the output above."
    ok "control image built"

    CONTROL_CMD="sudo docker run --rm --privileged --device /dev/fuse -e CONTROL_BUCKET=${CONTROL_BUCKET} ${CONTROL_IMAGE} ${CONTROL_ARGS}"
    set +e
    on_vm "$CONTROL_CMD" > "$EVIDENCE_DIR/control.raw" 2> >(tee "$EVIDENCE_DIR/control.log" >&2)
    CONTROL_STATUS=$?
    set -e
    extract_json < "$EVIDENCE_DIR/control.raw" > "$EVIDENCE_DIR/control.json"
    rm -f "$EVIDENCE_DIR/control.raw"
    if [[ "$CONTROL_STATUS" != "0" ]]; then
      ok "the check went red on the bucket (exit $CONTROL_STATUS) — it can detect a wrong mount"
    else
      bad "the check PASSED on a FUSE-mounted bucket. Do not trust its pass on the disk."
    fi
    note "result: .scratch/cloud-phase/ticket-04/control.json"

    if [[ "$KEEP_BUCKET" == "yes" ]]; then
      warn "keeping gs://$CONTROL_BUCKET as asked; it costs until you delete it."
    else
      gc storage rm --recursive "gs://$CONTROL_BUCKET" --quiet >/dev/null 2>&1 \
        && ok "deleted gs://$CONTROL_BUCKET" \
        || warn "could not delete gs://$CONTROL_BUCKET; remove it by hand."
    fi
  else
    warn "control skipped by the operator."
  fi
fi

# ── 6 ─────────────────────────────────────────────────────────────────────
stage "What was learned"
say "Both results carry the mount's identity — filesystem, device, options, the"
say "container's uid — because \"the volume passed\" is not a claim anyone can"
say "re-check without knowing which volume."
for file in "$EVIDENCE_DIR"/*.json; do
  [[ -e "$file" ]] || continue
  verdict="$(grep -m1 '"verdict"' "$file" | sed 's/.*: *"\(.*\)".*/\1/')"
  printf '    %s → %s\n' "$(basename "$file")" "${verdict:-unreadable}"
done
printf '\n'
note "Next: write the finding into .scratch/cloud-phase/ticket-04/FINDINGS.md and"
note "tick ticket 04's criteria against these files, whichever way they fell."
printf '\n'
