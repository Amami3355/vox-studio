# The negative control for cloud-phase ticket 04.
#
# A conformance check that has never gone red is a conformance check nobody
# should believe. This image runs the identical `check.mjs` against a
# FUSE-mounted Cloud Storage bucket — the storage the phase already ruled out —
# so the check is shown to fail on a mount that lacks the semantics before its
# pass on the real disk is trusted.
#
# Build on the VM, where the build has network through Cloud NAT:
#   sudo docker build -f negative-control.Dockerfile -t vox-volume-control .
#
# Run it privileged with /dev/fuse: gcsfuse is a filesystem, and a container
# that cannot mount one cannot host the control.

# The same base as the positive run and as ticket 11's image, so the only thing
# that differs between the two runs is the storage underneath.
FROM node:22-bookworm-slim

# The repository codename is pinned by the FROM line above rather than derived
# with `lsb_release`, which would be one more package for no more truth.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl gnupg ca-certificates fuse3 \
  && curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
       -o /usr/share/keyrings/cloud.google.asc \
  && echo "deb [signed-by=/usr/share/keyrings/cloud.google.asc] https://packages.cloud.google.com/apt gcsfuse-bookworm main" \
       > /etc/apt/sources.list.d/gcsfuse.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends gcsfuse \
  && rm -rf /var/lib/apt/lists/*

COPY check.mjs /check.mjs
COPY control-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
