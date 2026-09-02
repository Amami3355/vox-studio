#!/bin/sh
#
# The negative control's entrypoint: mount the bucket, then run the *same*
# check.mjs against it. Only the storage underneath changes, which is what makes
# the contrast worth anything.

set -e

if [ -z "${CONTROL_BUCKET:-}" ]; then
  echo "CONTROL_BUCKET is required." >&2
  exit 2
fi

mkdir -p /mnt/bucket

# Credentials come from the metadata server, so no key file is mounted and none
# exists to leak. --implicit-dirs is what makes an empty bucket look like a
# directory tree at all.
# gcsfuse logs JSON to stdout, which would land in front of the check's own JSON
# result and make it unparseable. Its output goes to stderr with the rest of the
# commentary; stdout carries the result and nothing else.
gcsfuse --implicit-dirs "$CONTROL_BUCKET" /mnt/bucket >&2

exec node /check.mjs /mnt/bucket "$@"
