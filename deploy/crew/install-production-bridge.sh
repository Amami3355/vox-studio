#!/bin/bash
set -euo pipefail
# No shell, SFTP, sudo, Docker group or metadata-managed authorized keys for this account.
id voxbridge >/dev/null 2>&1 || useradd --no-create-home --home-dir /nonexistent --shell /bin/false voxbridge
usermod --password '*' voxbridge
/usr/sbin/sshd -t
systemctl reload sshd.service
