# The Vox trusted Production service, as a container.
#
# Promoted from `.scratch/cloud-phase/spike-11/Dockerfile`, which ticket 11 built early so the
# render's envelope was measured rather than guessed. Ticket 11's numbers, on `e2-standard-2`
# (2 vCPU, 8 GB): a showcase render peaks at **2.08 GB** and takes **178 s** under a two-vCPU cap.
#
# Two things changed on promotion, both of them ticket 11's own recommendations:
#   1. The browser is pinned through `VOX_BROWSER_EXECUTABLE` rather than reached by a symlink.
#   2. The entry point is the cloud one, which binds the network host and imports no pipe bridge.
#
# Build from the repo root:
#   docker build -t vox-production .

FROM node:22-bookworm-slim

# Chrome Headless Shell's shared libraries, from Remotion's own Docker page. `ffmpeg` is here for
# the render suite's `ffprobe` assertion on the output's codecs, not for Remotion, which carries
# its own compositor.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 \
      libdbus-1-3 \
      libatk1.0-0 \
      libgbm-dev \
      libasound2 \
      libxrandr2 \
      libxkbcommon-dev \
      libxfixes3 \
      libxcomposite1 \
      libxdamage1 \
      libatk-bridge2.0-0 \
      libpango-1.0-0 \
      libcairo2 \
      libcups2 \
      ffmpeg \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate

WORKDIR /app

# Manifests first so a source edit does not re-run the install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/production/package.json packages/production/
COPY packages/video/package.json packages/video/
COPY packages/voice/package.json packages/voice/
COPY apps/component-studio/package.json apps/component-studio/

# Dev dependencies are not optional here: the service runs from TypeScript source through `tsx`,
# which `@vox/production` declares as a devDependency.
RUN pnpm install --frozen-lockfile

# Chrome Headless Shell, fetched at build time so the render needs no network for it.
#
# Ticket 11 measured what happens without this: Remotion resolves the browser from
# `node_modules/.remotion/` relative to the *working directory*, only `@remotion/cli` (in
# `@vox/video`) installs it, and the service renders from the repo root — so it finds nothing and
# downloads 92 MB from `remotion.media` at every container start. That download sits below the
# denying network adapter where nothing in this system can see it, and it is fatal once egress is
# restricted.
#
# The spike worked around it with a symlink. This records the real path instead, and
# `docker-entrypoint.sh` exports it as `VOX_BROWSER_EXECUTABLE`, so the browser is pinned rather
# than derived from wherever the process happens to be standing. `createRemotionRenderAdapter`
# additionally refuses a download outright when the pin is set, so a wrong path fails loudly
# instead of silently falling back to the network.
RUN pnpm --filter @vox/video exec remotion browser ensure \
    && find /app/packages/video/node_modules/.remotion -type f -name 'chrome-headless-shell' \
         -perm -u+x -print -quit > /app/.browser-path \
    && test -s /app/.browser-path

COPY . .
RUN pnpm --filter @vox/production exec tsx scripts/build-renderer.ts /app/.render-bundle

# The mount point for ticket 04's persistent disk. Creating it here is what makes the volume check
# necessary rather than optional: the directory exists in this layer, so when the disk fails to
# attach it is still present and still writable, and every Run would land on the container's own
# filesystem and vanish at the next restart. `persistent-volume.ts` compares device numbers for
# exactly this reason and refuses to start.
RUN mkdir -p /var/lib/vox

# In the image, not on the volume: it is production source and is exactly what the agent may not
# read. The ledger root and the calibration path are the opposite and are set at deploy time.
ENV VOX_REMOTION_ENTRY=/app/packages/video/src/remotion-entry.ts
ENV VOX_REMOTION_BUNDLE=/app/.render-bundle
ENV VOX_VOLUME_ROOT=/var/lib/vox

# No secret is baked. Every secret arrives in the environment, bound by the runtime from Secret
# Manager at deploy time; `image-scan.ts` asserts that this stayed true.
EXPOSE 8080
ENTRYPOINT ["/app/deploy/docker-entrypoint.sh"]
