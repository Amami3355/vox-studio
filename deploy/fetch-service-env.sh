#!/bin/bash
#
# Writes /etc/vox/service.env on the production VM, by asking Secret Manager for the values the
# container needs. **This runs on the VM, not on a workstation.**
# `scripts/deploy-cloud-service.sh` stage 6 copies it over the IAP tunnel and runs it under sudo.
#
# ── Why the box fetches its own secrets ───────────────────────────────────────────────────────
#
# `cloud-init.yaml`'s unit passes `--env-file /etc/vox/service.env` to `docker run`, and cloud-init
# does not create that file. Something has to put it there, and the obvious route — an operator
# pasting five values into a heredoc over SSH — puts every production credential through a terminal
# and into the VM's shell history. Ticket 03's last criterion is that no credential appears in a
# repository, a transcript or a shell history, so that route would cost a criterion that is
# otherwise still true.
#
# The VM already runs as `vox-production@…` with the `cloud-platform` scope, and all five secrets
# are bound readable by exactly that identity. So the box can ask for them itself and no value ever
# leaves Google: no human sees one, nothing is typed, and there is nothing in a history to redact.
#
# ── What this script never does ──────────────────────────────────────────────────────────────
#
# It never prints a secret value, never passes one as an argv element that `ps` could show, and
# never writes one anywhere but the target file. Its output is names and byte counts. If you are
# reading its output to debug a wrong value, the value is not there and that is deliberate.
#
# ── What has NOT been verified ───────────────────────────────────────────────────────────────
#
# Every claim below is the documented contract of a Google product and **none has been executed on
# this instance**:
#   - that Container-Optimized OS carries `curl` and `base64` in its base image;
#   - that the metadata server issues a token for the instance's service account at the documented
#     path, with the `Metadata-Flavor: Google` header required;
#   - that `/etc` on COS is a writable overlay that survives a reboot.
# The first two fail loudly and immediately here if wrong. The third does not fail here at all — it
# would show up as a container that starts today and crash-loops after the next reboot, so the
# deploy wizard's closing summary lists "the env file survives a reboot" as unproven.

set -euo pipefail

# Both endpoints are overridable for one reason: so this script can be run end-to-end against a
# fake metadata server and a fake Secret Manager before it is ever pointed at real credentials.
# `deploy/tests/fetch-service-env.test.mjs` is that harness. On the VM the wizard invokes this under
# `sudo`, which resets the environment, so neither override survives into the real run.
METADATA="${VOX_METADATA_BASE:-http://metadata.google.internal/computeMetadata/v1}"
SECRET_API="${VOX_SECRET_API_BASE:-https://secretmanager.googleapis.com}"
TARGET="${VOX_SERVICE_ENV_PATH:-/etc/vox/service.env}"

# The five the container reads at start. Overridable by argument so a sixth does not need this file
# edited in two places, but the default is the list `deploy/README.md` documents.
SECRETS=("$@")
if [[ ${#SECRETS[@]} -eq 0 ]]; then
  SECRETS=(ELEVENLABS_API_KEY VOX_GRANT_KEY VOX_RUN_HMAC_KEY VOX_RUN_KEY_ID VOX_NETWORK_TOKEN)
fi

die() { printf 'fetch-service-env: %s\n' "$1" >&2; exit 1; }

[[ "$(id -u)" == "0" ]] || die "must run as root — the deploy wizard invokes this under sudo"
command -v curl   >/dev/null 2>&1 || die "curl is not on this image, so the metadata server cannot be reached"
command -v base64 >/dev/null 2>&1 || die "base64 is not on this image, so secret payloads cannot be decoded"

meta() {
  curl -sf -H 'Metadata-Flavor: Google' --max-time 10 "$METADATA/$1"
}

# A JSON field's value, by name, without a JSON parser: COS's base image carries neither jq nor
# python. Both responses read here are flat objects whose values are constrained character sets — a
# bearer token and a base64 payload — so neither can contain an escaped quote to trip this up. It is
# narrow on purpose; do not reach for it as a general parser.
json_field() {
  sed -n 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1
}

PROJECT=$(meta "project/project-id") || die "the metadata server did not answer — is this a GCE instance?"
[[ -n "$PROJECT" ]] || die "the metadata server returned an empty project id"

SA=$(meta "instance/service-accounts/default/email") || die "could not read this instance's service account"
printf 'fetch-service-env: project %s, identity %s\n' "$PROJECT" "$SA"

TOKEN=$(meta "instance/service-accounts/default/token" | json_field access_token)
[[ -n "$TOKEN" ]] || die "the metadata server issued no access token for $SA"
printf 'fetch-service-env: got an access token (%s bytes)\n' "${#TOKEN}"

umask 077
mkdir -p "$(dirname "$TARGET")"
# Built beside the target and moved into place at the end, so a failure halfway through leaves the
# previous file intact rather than a half-written one the unit would load and fail on.
STAGING="${TARGET}.new.$$"
trap 'rm -f "$STAGING"' EXIT
: > "$STAGING"
chmod 600 "$STAGING"

FAILED=()
for name in "${SECRETS[@]}"; do
  body=$(curl -sf --max-time 30 -H "Authorization: Bearer $TOKEN" \
    "${SECRET_API}/v1/projects/${PROJECT}/secrets/${name}/versions/latest:access" \
    2>/dev/null) || { FAILED+=("$name (request refused — is it bound to $SA?)"); continue; }

  encoded=$(printf '%s' "$body" | json_field data)
  if [[ -z "$encoded" ]]; then FAILED+=("$name (no payload in the response)"); continue; fi

  value=$(printf '%s' "$encoded" | base64 -d 2>/dev/null) || { FAILED+=("$name (payload did not decode)"); continue; }
  if [[ -z "$value" ]]; then FAILED+=("$name (decoded to an empty value)"); continue; fi

  # `docker run --env-file` parses one KEY=VALUE per line and has no continuation syntax, so a value
  # containing a newline does not become a multi-line value — it becomes a truncated one plus a
  # garbage line, and the container starts with a silently wrong secret. Refuse it here instead.
  if [[ "$value" == *$'\n'* ]]; then FAILED+=("$name (contains a newline, which --env-file cannot carry)"); continue; fi

  printf '%s=%s\n' "$name" "$value" >> "$STAGING"
  printf 'fetch-service-env: %s (%s bytes)\n' "$name" "${#value}"
done

if (( ${#FAILED[@]} )); then
  printf 'fetch-service-env: %s secret(s) could not be written:\n' "${#FAILED[@]}" >&2
  for f in "${FAILED[@]}"; do printf '  - %s\n' "$f" >&2; done
  die "refusing to write a partial $TARGET — the container would start with a missing secret"
fi

# The non-secret half. These are deployment decisions rather than credentials, and they are here
# rather than in the image because the volume layout is a property of this deployment: the disk
# carries runs/, ledger/ and calibration.json side by side, one level above ticket 04's original
# /var/lib/vox/runs, because ProductionPayloadSurface reads every directory under runsRoot as a Run.
cat >> "$STAGING" <<'SETTINGS'
VOX_VOLUME_ROOT=/var/lib/vox
VOX_RUNS_ROOT=/var/lib/vox/runs
VOX_LEDGER_ROOT=/var/lib/vox/ledger
VOX_CALIBRATION_PATH=/var/lib/vox/calibration.json
SETTINGS

chmod 600 "$STAGING"
chown root:root "$STAGING"
mv -f "$STAGING" "$TARGET"
trap - EXIT

printf 'fetch-service-env: wrote %s (%s lines, mode %s)\n' \
  "$TARGET" "$(wc -l < "$TARGET" | tr -d ' ')" "$(stat -c '%a' "$TARGET")"
