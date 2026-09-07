#!/bin/bash
set -euo pipefail
# A working signed probe is the positive control. These checks must then fail for
# the specific SSH policy reason, not merely because the network is unavailable.
options=(-o BatchMode=yes -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile=/etc/vox-crew/known_hosts -o IdentitiesOnly=yes
  -o ConnectTimeout=10 -i /mnt/disks/vox-crew/bridge/id_ed25519)
target=voxbridge@10.132.0.2
output=$(mktemp)
trap 'rm -f "$output"' EXIT
if timeout 15 ssh "${options[@]}" "$target" true >"$output" 2>&1; then
  echo 'FAIL: Production shell accepted'; exit 1
fi
cat "$output"
grep -Eq 'session open failed|channel .*open failed|shell request failed' "$output"
echo 'PASS: Production session channel refused'
if timeout 15 ssh "${options[@]}" -W 127.0.0.1:22 "$target" >"$output" 2>&1; then
  echo 'FAIL: forwarding to another port accepted'; exit 1
fi
cat "$output"
grep -q 'administratively prohibited' "$output"
echo 'PASS: forwarding to another port refused'
if timeout 15 ssh "${options[@]}" -o ExitOnForwardFailure=yes -NT -R 18081:127.0.0.1:8080 "$target" >"$output" 2>&1; then
  echo 'FAIL: remote forwarding accepted'; exit 1
fi
cat "$output"
grep -q 'remote port forwarding failed' "$output"
echo 'PASS: remote forwarding refused'
