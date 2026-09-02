# 07: The trusted service is a container, without a launcher

Status: ready-for-agent
Type: task
Blocked by: 03, 06, 11

**Amended 2026-09-02, after the topology was chosen.** Four changes, and the ticket's argument is
otherwise intact:

- **The runtime is Container-Optimized OS on a Compute Engine VM**, pulling the image from Artifact
  Registry, with the platform owning restart. A plain Debian VM running Docker under a systemd unit
  is the named escape hatch, and ticket 11 decides whether it is needed.
- **The one-instance ceiling stops being a promise and becomes a fact.** It was recorded as a limit
  nobody had confirmed the runtime would honour — the replay cache is per-process and a second
  instance silently weakens ticket 06's guarantee. One VM running one container is structural. **That
  standing unverified claim is retired.**
- **The Remotion envelope moves to [ticket 11](11-remotion-renders-in-the-image-or-the-image-is-wrong.md)
  and lands before this ticket starts.** It was scheduled here with a day either side, which is the
  wrong shape for a risk that invalidates the machine type: 11 is unblocked, runs against local
  Docker, and needs no project. This ticket consumes its measured number rather than discovering it.
- **`VOX_LEDGER_ROOT` and `VOX_CALIBRATION_PATH` point into the persistent disk**, bind-mounted into
  the container. The refusal-to-start rule below is unchanged and matters more here, not less: a
  container that starts without its disk and writes a Run to its own ephemeral filesystem produces a
  Run that vanishes on the next restart, and the platform restarts it for you.

**Amended again 2026-09-02, after ticket 11 reported.** It ran, the render survives the container,
and it hands this ticket three things — see [`../spike-11/FINDINGS.md`](../spike-11/FINDINGS.md),
which reproduces the working image in full for this ticket to promote rather than rewrite.

- **The number.** `e2-standard-2` — 2 vCPU, 8 GB, `europe-west1`. A render peaks at **2.08 GB** and
  takes **178 s** under a two-vCPU cap, 2.51 GB and 127 s unconstrained. The request timeout, on the
  platform as well as in the host, has to admit three minutes.
- **The browser is pinned, not discovered.** Remotion resolves Chrome Headless Shell from
  `node_modules/.remotion/` relative to the *working directory*, and only `@remotion/cli` — which
  lives in `@vox/video` — installs it. The service renders from the repo root, finds nothing, and
  downloads 92 MB from `remotion.media` at every start. Under this ticket's own egress restriction
  that download fails and the service never renders. The spike works around it with a symlink; **this
  ticket threads `browserExecutable` through `createRemotionRenderAdapter` instead**, so the path is
  pinned rather than derived from where the process is standing.
- **Egress restricted to the synthesizer's host breaks every render as the image stands, and this
  ticket cannot ship both.** `packages/video/src/design/fonts.ts` loads four faces through
  `@remotion/google-fonts`, which fetches `woff2` files from `fonts.gstatic.com` inside the headless
  browser — below `service-host.ts:59`, so the denying adapter never sees them and ADR-0007's rule is
  breached by a `render`. With no network the render fails outright. **The fix is to self-host the
  four faces in the image**, which removes the egress and makes the fonts a property of the image;
  it will move every accepted still hash, which is ticket 09's problem too. This is now the largest
  open question in the phase.

## Problem Statement

`service-host.ts` is a Windows program that happens to be written in Node. Its last twelve lines
start `startProductionPipeBridge` against `vox-pipe-bridge.exe`, resolved out of `dist/service/`;
its first lines demand `VOX_PIPE_PATH` and reject anything that is not `\\.\pipe\<name>`; and it
publishes a private randomly-named pipe for the bridge to forward onto. None of that exists in a
container, and none of it should be made to.

The good news is structural and worth stating before the work is scoped, because the instinct is to
expect a port. **The trusted service is Node and is containerisable as it stands.** Decision 9 is
explicit: `vox.exe`, `vox-pipe-acl.exe` and `vox-pipe-bridge.exe` are the *local transport* and are
not ported — *"where the launcher's job — authenticate, forward, return the envelope — belongs to
the HTTP client instead."* Ticket 06 built that host; ticket 08 builds that client. What is missing
is an entry point that assembles the same `ProductionCommandService` without the Windows half.

Three things then have to be true that are not true today, and only one of them is code.

**The entry point is a different module, not a branch.** `service-host.ts` reads nine environment
variables at import time and throws on any that is missing. Adding `if (process.env.CLOUD)` to it
puts two deployment topologies in one file where a missing variable in either kills both, and makes
the local service's startup depend on cloud-shaped configuration being absent.

**The render has to survive the container, and nobody has checked.** `createRemotionRenderAdapter`
drives a headless browser. Decision 7 says the resource envelope is *"measured rather than guessed"*
and it has not been measured. This is the second-largest unknown in the phase after the volume, and
unlike the volume it cannot be retired by reading a specification.

**The paths become mount points.** `VOX_LEDGER_ROOT`, `VOX_CALIBRATION_PATH` and
`VOX_REMOTION_ENTRY` are `resolve()`d absolute paths today. Two of them live on ticket 04's volume
and one lives in the image, and confusing which is which produces a service that loses its
calibration on every restart.

## Solution

A container image, and a cloud entry point beside the local one.

**The cloud entry point assembles the same service and binds the network host.** The same
`ProductionCommandService` construction `service-host.ts:53-66` performs — same ledger root, same
HMAC key and key id, same calibration store, same denying network adapter, same ElevenLabs
synthesizer, same Remotion adapter, same compiler and renderer versions — with ticket 06's host in
place of the pipe host and no bridge at all.

**Secrets arrive from the managed store, bound to the environment by the runtime.** The reading code
does not change: `required()` still reads `process.env`. What changes is who populated it, and that
is ticket 03's provisioning rather than a code change here.

**The image carries the framework the render needs and nothing the agent may read.** A headless
browser, the Remotion entry point, the production runtime. The distribution allowlist and the leak
scan that ADR-0007's release gate already applies are applied to the image, because an image layer
is a readable file set and the threat model does not care that it is a tarball.

**The render's envelope is measured on the way through.** Memory, CPU and wall time for a showcase
render, recorded as the provisioning figure rather than as a note in a handoff.

## Implementation Decisions

- **A second entry point, not a branch in the first.** `service-host.ts` stays exactly as it is and
  remains the local service's startup. The shared part — constructing `ProductionCommandService` from
  a resolved configuration — is extracted so both entry points call it, which is the same extraction
  discipline ticket 06 applies to the host.
- **The pipe bridge and the pipe path are absent, not optional.** The cloud entry point does not
  read `VOX_PIPE_PATH` or `VOX_IPC_TOKEN` and does not import the bridge. A configuration key that
  exists but is ignored is a key someone will set and expect to matter.
- **The denying network adapter is kept, unchanged.** `network: { request: async () => reject(
  'NETWORK_POLICY_DENIED') }` is ADR-0007's rule that only `record` may reach outbound network, and
  it is enforced in code rather than by the local machine's firewall. In a container with egress it
  is the *only* thing enforcing it, so it matters more here than it did locally, not less.
- **Egress is restricted to what `record` needs.** The synthesizer's host and nothing else. This is
  provisioning rather than code, and it is the second lock on the property above.
- **The run store's mount is ticket 04's volume, and the image does not fall back to local disk if
  it is absent.** A service that starts without its volume and writes a Run to the container's
  ephemeral filesystem produces a Run that vanishes, and it produces it silently. Refuse to start.
- **Calibration lives on the volume, not in the image.** `DurationCalibrationStore` accumulates
  measurements across Runs; an image-local path resets it on every deploy and the preflight quietly
  gets worse.
- **The Remotion entry point lives in the image**, because it is production source and is exactly
  what the agent may not read.
- **One instance in this phase.** Ticket 06's replay cache is per-process and `RunStore`'s locks are
  advisory over a shared mount. Concurrency across instances is a real design question and this
  phase does not answer it; a second instance is a configuration change that silently invalidates
  ticket 06's replay guarantee, so the ceiling is set deliberately and written down.
- **The request timeout admits a synchronous render.** Decision 7. It has to be set on the platform
  as well as in the host, and the platform's ceiling is the binding one.

## Testing Decisions

**The container builds, boots, and rejects a malformed request, reaching no model or network in
CI.** The spec's own bar, from cloud-phase ticket 01's testing decisions, applied to this service.
The boot check asserts the service refuses to start when its volume is absent — the failure mode
above is worth a test precisely because its symptom is silence.

**The existing suite is unaffected.** No test learns that a second entry point exists. The workspace
vitest baseline is unchanged in count.

**The render is exercised in the container, once, against a showcase composition, and its memory,
CPU and wall time are recorded.** This is the ticket's measurement and, like ticket 04's, the result
is evidence whichever way it falls. A render that does not complete in the container redirects the
phase and is worth learning now.

**The leak scan runs over the image's readable layers.** The release gate already scans the agent
distribution for forbidden source; an image is a file set and gets the same treatment. This is the
assertion that keeps containerisation from quietly becoming a code-blindness regression.

**The denying network adapter is asserted from inside the container.** A command that is not
`record` attempts egress and is refused by the adapter, with the container's egress rule as the
second layer rather than the first — because a test that passes only because the network was
unavailable has not tested the adapter.

## Out of Scope

- **Hosting the crew.** Cloud-phase ticket 01, which needs crew ticket 20 first, and which is an
  independent track from this one.
- **Autoscaling, more than one instance, or multi-region.** Named above as a deliberate ceiling.
- **Asynchronous render.** Decision 7.
- **A CI/CD pipeline.** Deploys are operator-run in this phase.
- **Porting the proof harness.** It stays local and remains the authority for the local topology.
- **Object storage for exported artifacts.** Permitted by decision 6, not needed for a working
  deployment.

**Blocked by:**
`.scratch/cloud-phase/issues/04-the-volume-proves-posix-semantics-or-it-is-the-wrong-volume.md`,
`.scratch/cloud-phase/issues/06-a-second-transport-joins-the-first-over-one-surface.md`

- [ ] Constructing `ProductionCommandService` from configuration is extracted and called by both entry points
- [ ] A cloud entry point binds ticket 06's host, imports no pipe bridge, and reads no pipe configuration
- [ ] `service-host.ts` is unchanged in behaviour and still starts the local service
- [ ] Secrets are read from the environment the managed store populates, with no code change to how they are read
- [ ] The ledger root and the calibration path are on ticket 04's volume; the Remotion entry point is in the image
- [ ] The service refuses to start when its volume is absent, asserted
- [ ] The denying network adapter is unchanged and is asserted from inside the container, independently of the egress rule
- [ ] The four faces are served from the image, not from `fonts.gstatic.com`, and the render needs no font egress
- [ ] `createRemotionRenderAdapter` is given a pinned `browserExecutable` and downloads no browser at start
- [ ] Egress is restricted to the synthesizer's host
- [ ] The container builds, boots and rejects a malformed request, reaching no model or network in CI
- [ ] A showcase render completes in the container, with memory, CPU and wall time recorded — done by ticket 11: 2.08 GB peak, 178 s, two vCPU
- [ ] The request timeout admits that render, on the platform as well as in the host
- [ ] The leak scan passes over the image's readable layers
- [ ] The one-instance ceiling and its reason are written down
