#!/bin/bash
set -euo pipefail
systemctl is-active vox-production.service
docker inspect --format '{{.Config.Image}}' vox-production
docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' vox-production
findmnt -no SOURCE,TARGET,FSTYPE /mnt/disks/vox-runs
ss -H -ltn | awk '$4 ~ /127\.0\.0\.1:8080$/ {print}'
