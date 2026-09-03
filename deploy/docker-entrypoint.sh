#!/bin/sh
# The container's entry point.
#
# It exists for one reason: `VOX_BROWSER_EXECUTABLE` is a path discovered at build time — the
# Chrome Headless Shell version is Remotion's to choose, not ours — and `ENV` cannot read a file.
# Everything else here is deliberately absent, so that the service's own startup remains the thing
# that reads configuration and refuses to start without it.
set -eu

if [ ! -s /app/.browser-path ]; then
  echo "BROWSER_PIN_MISSING: the image recorded no browser path at build time." >&2
  exit 1
fi

VOX_BROWSER_EXECUTABLE="$(cat /app/.browser-path)"
export VOX_BROWSER_EXECUTABLE

if [ ! -x "$VOX_BROWSER_EXECUTABLE" ]; then
  echo "BROWSER_PIN_INVALID: ${VOX_BROWSER_EXECUTABLE} is not executable." >&2
  exit 1
fi

# `tsx` is a devDependency of `@vox/production`, so pnpm places it in that package's `.bin` rather
# than the workspace root's. It is named directly instead of through `pnpm exec` so that the
# working directory stays `/app` — the render bundles from here, and the whole browser-resolution
# defect ticket 11 found was Remotion resolving relative to wherever the process was standing.
TSX=/app/packages/production/node_modules/.bin/tsx
if [ ! -x "$TSX" ]; then
  echo "RUNTIME_MISSING: ${TSX} is not executable." >&2
  exit 1
fi

# `exec` so the service is PID 1 and receives SIGTERM directly. Container-Optimized OS stops a
# container with SIGTERM and waits before SIGKILL; a shell in between would swallow it and a render
# in flight would be cut off mid-write rather than finishing.
exec "$TSX" /app/packages/production/src/ipc/cloud-service-host.ts
