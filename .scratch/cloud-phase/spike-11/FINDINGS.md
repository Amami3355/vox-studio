# Ticket 11 — findings

**Run:** 2026-09-02 · **Image:** `vox-spike-11`, built from the Dockerfile reproduced in full below
**Host:** Docker Desktop 29.4.0, WSL2 kernel 6.6.87.2, 8 vCPU / 7.43 GiB available to the Linux VM

## The verdict

**The render completes in a Linux container.** `packages/production/tests/render/service-render.test.ts`
passes inside the image — the real `createRemotionRenderAdapter`, the real
`packages/video/src/remotion-entry.ts`, driven through `init → validate → preflight → compile →
render` and probed for H.264/AAC by `ffprobe`. That was the ticket's first and largest question and
the answer is yes.

**The Container-Optimized OS decision holds.** Nothing needed from the host: Remotion's Debian
dependency list plus its own compositor and Chrome Headless Shell is the whole of it. The Debian
escape hatch named on the map is not taken.

**Two things are wrong with the image, and both would have shipped silently.** They are the reason
this ticket existed and they are below.

## The number

| Configuration | Result | Wall | Peak RSS |
|---|---|---|---|
| Solo, 8 vCPU, browser downloaded at runtime | pass | 168 s | 2.16 GB |
| Solo, 8 vCPU, browser in the image | pass | **127 s** | **2.51 GB** |
| Solo, 2 vCPU / 8 GB cap, browser in the image | pass | **178 s** | **2.08 GB** |
| Whole `test:render` suite, 8 vCPU | 14 failed / 178 passed | 756 s | 2.97 GB |

Peak is the container cgroup's `memory.peak`, which counts the whole process tree — Node, vitest,
the bundler and every browser tab — not just the renderer.

**The machine type is `e2-standard-2`: 2 vCPU, 8 GB, `europe-west1`.** The constrained run is the
one that decides it, and it is pessimistic in the direction that matters: the cgroup capped CPU
*quota* at 2 but left `nproc` reporting 8, so Remotion sized its concurrency for an eight-core box
and ran it on two. It still peaked at 2.08 GB and still finished in under three minutes. On a real
two-vCPU VM `nproc` reports 2, concurrency drops, and the peak falls rather than rises. Four times
the headroom on memory, and it is the cheaper answer, which is what the demo cost envelope asked
for.

Three minutes per render is the figure ticket 07's request timeout and the platform's ceiling both
have to admit, and ticket 09 records as part of Brief-to-preview wall time.

## Finding 1 — the image downloads a browser on every start

The first two passing runs printed this and passed anyway:

```
Downloading from: https://remotion.media/chromium-headless-shell-linux-x64-149.0.7790.0.zip?clear
```

`RUN pnpm --filter @vox/video exec remotion browser ensure` installs to
`packages/video/node_modules/.remotion/`, because Remotion resolves the browser from
`node_modules/.remotion/` **relative to the working directory** and `@remotion/cli` lives in
`@vox/video`. The service renders from the repo root. It therefore finds nothing and fetches 92 MB
from `remotion.media` on every container start.

With egress restricted to the synthesizer's host — which ticket 07 requires — that download fails
and the service never renders at all. The failure would have arrived on the deployed VM, on a day
this plan does not have one to spare, and the local build would have kept passing.

The spike's Dockerfile symlinks the root path at build time and the render then needs no browser
download. **That symlink is a spike measure and ticket 07 should not inherit it.** The deterministic
fix is `browserExecutable`, which `@remotion/renderer` accepts on `openBrowser`, `selectComposition`
and `renderMedia`, and which `createRemotionRenderAdapter` currently threads nowhere: pin the path
rather than derive it from wherever the process is standing.

## Finding 2 — the render fetches four fonts over the network, below the denying adapter

Run with `--network none` and the browser already in place, the render **fails**:

```
Browser failed to load https://fonts.gstatic.com/s/archivo/v25/…woff2 (Font): net::ERR_INTERNET_DISCONNECTED
Browser failed to load https://fonts.gstatic.com/s/instrumentserif/v5/…woff2 (Font): net::ERR_INTERNET_DISCONNECTED
Browser failed to load https://fonts.gstatic.com/s/inter/v20/…woff2 (Font): net::ERR_INTERNET_DISCONNECTED
Browser failed to load https://fonts.gstatic.com/s/jetbrainsmono/v24/…woff2 (Font): net::ERR_INTERNET_DISCONNECTED
```

`envelope.outcome: 'failed'`, `run: null`, `exitCode: 1`, and those four requests are the only
network activity in the log.

`packages/video/src/design/fonts.ts` loads Archivo, Instrument Serif, Inter and JetBrains Mono
through `@remotion/google-fonts`, which resolves `woff2` files from `fonts.gstatic.com` **inside the
headless browser**. That path does not pass through `network: { request }` at `service-host.ts:59`,
so the denying adapter never sees it and ADR-0007's rule that only `record` reaches outbound network
is breached by a `render`. Locally nobody would notice, which is exactly what the ticket predicted.

Two things follow, and they pull in opposite directions:

- **It fails loudly rather than degrading silently.** A render that fell back to the CSS fallback
  stacks and produced subtly wrong type would have been far worse — it passes every automated check
  this system has, and ticket 09's answer to that is a human watching the preview. This one stops.
- **Egress restricted to the synthesizer's host breaks every render.** Ticket 07 requires that
  restriction. As the image stands, the two requirements are contradictory and the deployment fails
  on the day.

**This needs a decision and it is not ticket 11's to take.** The obvious repair is to self-host the
four faces — `@remotion/google-fonts` can be replaced by local `woff2` files in the image with
`@font-face` pointing at them, which removes the egress entirely and makes the fonts a property of
the image rather than of the internet. It touches `packages/video/src/design/fonts.ts` and it will
change every accepted still hash, which brings it into collision with finding 3. Cost is not large;
ownership is unassigned.

## Finding 3 — the accepted still hashes are Windows-recorded and do not transfer

The full `test:render` suite reports **14 failed / 178 passed / 3 skipped** in the container. Every
failure is a still-hash comparison in `packages/video/tests/render/` — line-chart, timeline,
quote, stat-counter, image-context, character-explainer, typographic-statement — and each differs in
every hash, not in one:

```
-   "canonical": "3a65c4d8bde17829083ced127e506a53"
+   "canonical": "6b839c262c6947eba7b1320749fa4813"
```

`packages/video/tests/render/quote.test.ts` was re-run on the Windows host in the same session and
**passes there**. So this is a platform property, not a regression: font rasterization differs
between Windows and the Linux image, and the hashes were accepted on Windows in August.

This is not on ticket 11's list and it is not a blocker for the deployment — the service render is
green in the container and the still tests are not part of it. It is on the list for **ticket 09**,
which asserts that recorded fixtures are unchanged across the whole phase. That assertion currently
cannot hold on both platforms at once, and the honest resolutions are to score the still hashes as
platform-scoped or to re-accept a Linux set. Finding 2's repair, if taken, moves them again.

## What this retires

- **Ticket 11's own question.** The render survives the container. The largest remaining unknown in
  the phase is closed and the answer is favourable.
- **"Nobody has confirmed the operator can build a container locally."** The daemon was started, the
  image built, and five containers ran. Retired.
- **"Whether the image can carry all of Remotion's dependencies"**, on the map's *Not yet specified*
  list. It can. Container-Optimized OS stands; the Debian escape hatch is not needed.

## The image

`.gitignore:15` versions only Markdown under `.scratch/`, so the two build files live beside this
one on disk and are reproduced here in full — this document is the versioned copy. Ticket 07
promotes them out of `.scratch/` and they become tracked files there.

`.scratch/cloud-phase/spike-11/Dockerfile`:

```dockerfile
# Spike image for cloud-phase ticket 11.
#
# This is the image ticket 07 will ship, built early so the render's envelope is
# measured rather than guessed. It is deliberately the *real* thing — the whole
# workspace, installed from the committed lockfile, running the real Remotion
# entry point — because an approximation that renders proves nothing about the
# image ticket 07 deploys.
#
# It lives under `.scratch/` rather than at the repo root because ticket 07 owns
# the shipped image and has not started. Promoting this file is that ticket's job.
#
# Build from the repo root:
#   docker build -f .scratch/cloud-phase/spike-11/Dockerfile -t vox-spike-11 .

FROM node:22-bookworm-slim

# Chrome Headless Shell's shared libraries, from Remotion's own Docker page
# (packages/docs/docs/docker.mdx). `ffmpeg` is here for the render suite's
# `ffprobe` assertion on the output's codecs, not for Remotion, which carries its
# own compositor.
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

# Dev dependencies are not optional here: the service runs from TypeScript source
# through `tsx`, which `@vox/production` declares as a devDependency.
RUN pnpm install --frozen-lockfile

# Chrome Headless Shell, fetched at build time so the render needs no network.
# Which is the point: a browser downloaded on first render is a network
# dependency the denying adapter never sees.
#
# The second line is not tidying, it is the fix for the first thing this spike
# found. Remotion resolves the browser at `node_modules/.remotion/...` relative
# to the *working directory*, and only `@remotion/cli` — which lives in
# `@vox/video` — can install it. The service renders with the repo root as its
# working directory, so a browser installed under `packages/video` is invisible
# to it and it silently downloads 92 MB from `remotion.media` on every container
# start. Measured: it did exactly that on the first two passing runs here.
#
# Ticket 07 should not inherit this symlink. The deterministic fix is to thread
# `browserExecutable` through `createRemotionRenderAdapter`, which pins the path
# instead of deriving it from wherever the process happens to be standing.
RUN pnpm --filter @vox/video exec remotion browser ensure \
    && ln -s /app/packages/video/node_modules/.remotion /app/node_modules/.remotion

COPY . .

CMD ["node", "--version"]
```

`.scratch/cloud-phase/spike-11/Dockerfile.dockerignore` — BuildKit prefers `<dockerfile>.dockerignore`
over the context root's, which keeps the spike from planting a `.dockerignore` at the repo root that
ticket 07 has not decided on:

```gitignore
# BuildKit reads `<dockerfile>.dockerignore` in preference to the context root's,
# so this file scopes the spike's context without adding a `.dockerignore` to the
# repo root that ticket 07 has not decided on yet.
**/node_modules
.git
.scratch
**/dist
**/out
**/.venv
**/__pycache__
**/*.exe
**/*.pdb
```

## Reproducing

```sh
docker build -f .scratch/cloud-phase/spike-11/Dockerfile -t vox-spike-11 .
docker run --rm vox-spike-11 npx vitest run --config vitest.render.config.ts \
  packages/production/tests/render/service-render.test.ts
# and, for finding 2:
docker run --rm --network none vox-spike-11 npx vitest run --config vitest.render.config.ts \
  packages/production/tests/render/service-render.test.ts
```
