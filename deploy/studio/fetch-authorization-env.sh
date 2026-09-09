#!/bin/bash
# Fetch only the dedicated Studio key on its two trusted hosts. Never print its value.
set -euo pipefail
test "$(id -u)" = 0
case "${1:-}" in
  production) disk=/mnt/disks/vox-runs; target=$disk/operator/studio/authorization.env ;;
  worker) disk=/mnt/disks/vox-crew; target=$disk/studio-operator/authorization.env ;;
  *) echo 'Expected production or worker' >&2; exit 1 ;;
esac
mountpoint -q "$disk"
test ! -e "$target"
umask 077
install -d -m 0700 "$(dirname "$target")"
json_field() { sed -n 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1; }
token=$(curl -sf --max-time 10 -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token | json_field access_token)
test -n "$token"
body=$(printf 'header = "Authorization: Bearer %s"\n' "$token" | curl -sf --max-time 30 --config - 'https://secretmanager.googleapis.com/v1/projects/studio-prod-7f3a/secrets/VOX_STUDIO_AUTHORIZATION_KEY/versions/1:access')
value=$(printf '%s' "$body" | json_field data | base64 -d)
[[ "$value" =~ ^[a-f0-9]{96}$ ]]
staging="$target.new"
test ! -e "$staging"
printf 'VOX_STUDIO_AUTHORIZATION_KEY=%s\n' "$value" > "$staging"
chmod 0600 "$staging"
chown root:root "$staging"
mv "$staging" "$target"
unset value body token
printf 'Dedicated Studio key installed: %s, root-only mode %s\n' "$target" "$(stat -c %a "$target")"
