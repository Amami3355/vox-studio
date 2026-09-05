# 07: The trusted service is a container, without a launcher

Status: done
**Deployed and conformance-tested as of 2026-09-05.** The service ran on `vox-service` from the
pushed digest, answered on `127.0.0.1:8080`, rendered the existing cloud Run while its connections
were observed, and passed the live adapter refusal with egress available. The VM was stopped after
the checks; the image, metadata and persistent Run disk remain. See "Closure, 2026-09-05" below.
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

**Amended a third time 2026-09-02, when the user settled the font question.** The contradiction
above is resolved the other way: **`fonts.gstatic.com` is added to the egress allowlist and the
faces continue to be fetched at render time.** Self-hosting was recommended and was not taken; the
decision is the user's and it is recorded here rather than argued again.

- **The egress rule names two hosts, not one**: the synthesizer's host, and `fonts.gstatic.com`.
  Both are written down with the reason each is there, because an allowlist whose entries have no
  stated cause grows without anyone deciding to grow it.
- **`fonts.gstatic.com` is the only font host observed, and that is a measurement, not a guarantee.**
  Ticket 11's `--network none` run named exactly four failing loads and all four were `gstatic`;
  `@remotion/google-fonts` carries its CSS in the bundle, so `fonts.googleapis.com` was never
  reached. If a future face resolves through a host not on this list the render fails the same way,
  and the same negative control finds it.
- **ADR-0007's claim weakens, and ADR-0018 must say so rather than inherit it.** The property being
  deployed is no longer "the render reaches nothing" — it is "the render reaches two hosts named in
  advance, and the denying adapter still refuses everything the service itself attempts". The
  adapter's guarantee at `service-host.ts:59` is untouched. What is lost is the second lock: font
  traffic below the adapter now has a permitted path out, so the egress rule is no longer a
  redundant confirmation of the adapter for that traffic. See ticket 02.
- **The still-hash divergence is now independent of this ticket.** Self-hosting would have moved
  every accepted hash; fetching the same faces from the same host does not. The fourteen failing
  fixtures remain exactly what ticket 11 measured — a Windows-versus-Linux question — and are
  ticket 09's to settle on their own timetable.
- **The negative control changes shape and does not go away.** `--network none` will now fail by
  design, so it stops being the proof. The proof for this ticket is a run on the VM with outbound
  traffic observed, which must render green while a non-`record` command attempting any egress is
  still refused by the adapter.

**Amended a fourth time 2026-09-02, from the Google Cloud docs read while writing ticket 03's
wizard.** Three corrections, and two of them shrink what this ticket can claim:

- **Egress cannot be restricted to a host.** `gcloud compute firewall-rules create` takes
  `--destination-ranges`, which is CIDR only, and both the synthesizer and the font host sit behind
  CDNs. The two-host list is **documented intent, not an enforced control**, and the denying
  adapter is the only egress lock this deployment actually enforces. ADR-0018 decision 5 was
  corrected the same day. Enforcing it properly means Secure Web Proxy or Cloud NGFW FQDN objects,
  which is a later ticket and a real cost.
- **The VM reaches the internet through Cloud NAT.** An instance with no external address reaches
  no non-Google host without it — Private Google Access covers Artifact Registry and Secret
  Manager, and covers neither the synthesizer nor the font host. Ticket 03's wizard provisions the
  router and the gateway; this ticket inherits them and should not be surprised by the line item.
- **`gcloud compute instances create-with-container` is deprecated.** The docs say deploying a
  container at VM creation through the container startup agent is on its way out. This ticket's
  "the platform owns restart" needs a mechanism that is not that flag — a `cloud-init` unit on
  Container-Optimized OS is the near neighbour — and **choosing it is this ticket's work, not an
  assumption it may inherit.** The wizard creates the bare VM and stops there deliberately.

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

- [x] Constructing `ProductionCommandService` from configuration is extracted and called by both entry points
- [x] A cloud entry point binds ticket 06's host, imports no pipe bridge, and reads no pipe configuration
- [x] `service-host.ts` is unchanged in behaviour and still starts the local service
- [x] Secrets are read from the environment the managed store populates, with no code change to how they are read
- [x] The ledger root and the calibration path are on ticket 04's volume; the Remotion entry point is in the image — **enforced rather than arranged, 2026-09-05.** This was true only because a heredoc in `deploy/fetch-service-env.sh` wrote it that way: all three write paths could point off the volume with the mount check green, which is the failure that check exists to prevent, reached by a one-line env edit. `assertWritesLandOnVolume` now refuses to start on it
- [x] The service refuses to start when its volume is absent, asserted — in unit tests and by a real container, which printed `VOLUME_NOT_MOUNTED` and exited 1
- [x] The denying network adapter is unchanged and is asserted from inside the deployed container, independently of the egress rule — with a reachability control first, so the refusal is the adapter and not the network's absence. The smoke asserts the adapter object from the deployed digest; `cloud-host.test.ts` separately asserts that the running host is constructed with that object. The two observations meet at the image digest rather than at a test-only public command
- [x] `createRemotionRenderAdapter` is given a pinned `browserExecutable` and downloads no browser at start — and refuses a download outright when the pin is set, so a wrong path fails loudly
- [x] The two intended egress destinations — the synthesizer's host and `fonts.gstatic.com` — are written down with their reasons, and the ticket states plainly that nothing at the network layer enforces the list — `deploy/README.md`
- [x] A render completes on the VM with its outbound traffic observed and compared against those two destinations — the no-new-take probe rendered the existing compiled document and audio while sampling the container's established connections. `fonts.gstatic.com` resolved to `74.125.140.94` and `2a00:1450:400c:c08::5e`; the only observed external HTTPS endpoint was `74.125.140.94:443`, with no unexpected endpoint
- [x] The weakened ADR-0007 property is stated in ADR-0018, not inherited
- [x] The container builds, boots and rejects a malformed request, reaching no model or network — run against a real container, `deploy/container-smoke.mjs`, eight checks. **"in CI" struck 2026-09-05:** there is no CI job for this. It was a manual `docker exec` on Docker Desktop under Windows, on a bridge network — not COS, not the VM, not the VPC. The same assertion is worth different amounts in different places, and the conformance run happens on the instance
- [x] A showcase render completes in the container, with memory, CPU and wall time recorded — done by ticket 11: 2.08 GB peak, 178 s, two vCPU
- [x] The request timeout and platform path are measured rather than assumed. The host allows 15 minutes. The SSH forwarding path failed after 181 s and 137 s while the container remained healthy, so a long synchronous response is a measured platform failure rather than a timeout success; direct loopback recovery returned in 1 s after the server-side render completed
- [x] The leak scan passes over the image's readable layers — **with a narrowing recorded in ADR-0018 decision 8**, because the agent-distribution scan cannot be run over an image that is the production runtime. **A second narrowing, found and closed 2026-09-05:** the scan walked `/app` alone while claiming the image's layers, so `/root/.npmrc` — the likeliest baked credential in a Node image, and named in `CREDENTIAL_FILENAMES` since the scan was written — was never looked at. It now walks `/app`, `/root`, `/pnpm` and `/etc/vox`, and reports an absent root rather than passing over it in silence. **The widened scan was run on 2026-09-05 and passed** — 310 files across `/app`, `/root` and `/pnpm`, with `/etc/vox` absent and no violations. There is no `/root/.npmrc` in this image, which is the credential the widening was looking for, and `/pnpm` contributed nothing because its only child is the skipped `store`
- [x] The one-instance ceiling and its reason are written down — `deploy/README.md` and `deploy/cloud-init.yaml`

## Closure, 2026-09-05

The paid end-to-end Run supplied the capability proof; this follow-up supplied the conformance
evidence without opening a new Run or calling ElevenLabs.

- `deploy/container-smoke.mjs` ran inside the deployed digest. Its egress control reached
  `8.8.8.8:53`; `deniedNetworkAdapter` then refused with `NETWORK_POLICY_DENIED`. The malformed,
  forged-MAC, signed-request and replay checks were green in the same invocation.
- A fresh render was driven from the existing Run's compiled document and audio while the
  container's established TCP connections were sampled. The only external HTTPS endpoint was the
  current IPv4 answer for `fonts.gstatic.com`; no unexpected HTTPS endpoint appeared. The probe
  preview was 16,798,495 bytes. It was temporary and was removed after the observation.
- The first real Run exposed that a fresh disk has no `runs/` or `ledger/`. The systemd unit now
  creates both at mode 0700 after the hard mount dependency and before Docker starts. Corrected
  `user-data`, still pinned to digest `sha256:f136e0bf…`, was applied and reboot-tested on the VM.
- The deploy wizard now waits for the `127.0.0.1:8080` listener. It no longer treats
  `systemctl is-active` as readiness; the real boot proved that state can be green before a
  container exists.
- The VM was stopped after the checks. The one-instance ceiling therefore remains structural when
  the service is started, and no idle compute is intentionally left running.

Two findings are deliberately not repaired by this ticket: the container runs as root, which
ticket 12 must disposition, and the SSH tunnel cannot carry a long synchronous render response,
which is the forcing fact for a later asynchronous-render decision.

## What was built before conformance, 2026-09-03

**This section is the pre-deploy record and is preserved as history.** At this point the code half
was done and nothing below had touched a VM. The closure above records what the later deployment
and conformance run established.

### The second entry point

`service-configuration.ts` holds what both topologies share — the environment resolver and the
`ProductionCommandService` construction, denying network adapter and grant verifier included.
`service-host.ts` now calls it and keeps only the local transport: the public pipe path, its private
counterpart, the bridge, and the secret those use. **The construction stayed above the socket
timeout on purpose**, because both can throw and their order decides which variable an operator with
two things wrong is told about first.

`cloud-host.ts` is the assembly and holds the one authorised `createProductionNetworkHost` call —
the name `network-host.test.ts` had been holding an empty allowlist for. `cloud-service-host.ts` is
the container's `CMD` and holds no logic, so the assembly stays importable and is driven by twelve
tests over a real loopback socket rather than by a text scan.

The two transports now hold **separate key material**, not only separate signing domains:
`VOX_NETWORK_TOKEN`. Ticket 06 separated the domains, which closed the cross-socket forgery;
separating the keys means a leak of one transport's secret does not hand over the other. ADR-0018
decision 7 records it.

### The volume check is a device comparison, not an existence check

The mount point is created **by the image**, so when the disk fails to attach the directory is still
there and still writable — and every Run lands on the container's own filesystem and vanishes at the
next restart, which the platform performs for you. `existsSync` cannot tell those apart. Comparing
the device number against the parent can. A real container printed `VOLUME_NOT_MOUNTED` and exited 1.

Its known limit, written where the function is: it proves a *separate* filesystem, not the intended
one. A `tmpfs` passes. `identity.txt` is the check that would close that, and it still has never
been written.

### The image

Promoted from `spike-11/Dockerfile`, with the symlink replaced by a build-time recorded path and
`VOX_BROWSER_EXECUTABLE`. `createRemotionRenderAdapter` also passes `onBrowserDownload` when the pin
is set, which **refuses** the download rather than performing it — so a wrong pin fails loudly
instead of silently falling back to 92 MB from `remotion.media`.

### Three things the ticket did not ask for, with their causes

1. **`onBrowserDownload` refusing outright.** Reading Remotion's installed types to confirm
   `browserExecutable` turned up a hook that fires when it is about to download. Pinning a path is a
   claim; refusing the download is a check that can fail.
2. **`.dockerignore` tightened, found by running the leak scan for the first time.** `COPY . .` was
   putting `services/agents/.venv` — a 130 MB Windows-built Python virtualenv, `cacert.pem` files
   included — and the whole test suite into a Linux production image. Image 2.24 GB → 2.06 GB,
   scanned files 30,155 → 320.
3. **A readiness gate in `container-smoke.mjs`.** Its refusal checks compared `status === 0`, which
   is what a destroyed socket *and* a service that never started both produce. Run against a
   container still binding, it printed three green refusals and proved nothing. It now waits for the
   port, fails loudly if it never comes, and requires a refusal to be `ECONNRESET`/`EPIPE` rather
   than `ECONNREFUSED`. **The gate was then made to fail on purpose, against a port with nothing on
   it, before being believed.**

### The leak-scan criterion could not be met as written

ADR-0018 decision 8 said "the leak scan, run over the image's readable layers", meaning
`scanReadableFiles`. **That scan cannot run over this image.** It answers *may the agent read this?*
and forbids the `.ts` extension, the marker `ProductionCommandService`, and any repository path —
and the image is the production runtime, made of exactly those. It would fail on nearly every file
by design, and a gate that must be suppressed to pass is not a gate.

`image-scan.ts` is what replaces it: no secret material, no agent distribution. The ADR is corrected
rather than the criterion quietly ticked, and **the narrowing is stated: this deployment does not
evidence that the image is free of agent-readable source, and never could.**

The scan found two false-positive classes against real files before it was believed — an assignment
to an identifier (`VOX_IPC_TOKEN: ipcSecret` in `harness.ts`, which is source code doing its job),
and a negated character class matching newlines so a value ran across lines into the next quote.
Both are pinned by tests. It also flagged its own source, which is why its comments describe the
offending shape rather than quoting it.

### What was documented intent rather than evidence

The closure above supersedes these unknowns; they remain here because they were the explicit list
the conformance run had to answer rather than a success narrative reconstructed afterward.

- **`cloud-init.yaml` has never run.** `--metadata-from-file` is confirmed against the gcloud
  reference; that Container-Optimized OS reads `user-data` and runs cloud-init over it is the
  documented COS contract and **was not executed by this session**.
- **The container path moved from ticket 04's `/var/lib/vox/runs` to `/var/lib/vox`**, because
  `ProductionPayloadSurface` reads every directory under `runsRoot` as a Run and the ledger and
  calibration must be persistent too. The host mount point is unchanged at `/mnt/disks/vox-runs`.
  **No conformance run has exercised the new layout.**
- **The systemd `.mount` unit is named `mnt-disks-vox\x2druns.mount`** because systemd derives the
  name from the path and a mismatch simply does not start. That was corrected by reasoning, not by
  a run.
- The shell scripts, `identity.txt`, `check.mjs`'s exit 3 and the tunnel under a three-minute render
  are all still owed, unchanged.

### Suite

1018 tests, 1017 passing. The one failure is `record-command.test.ts > treats changed text as a
distinct autonomous Recording input within budget`, which passes alone in 1.6 s and timed out at
13.7 s under load — the flake `-f` and `-g` both name. Baseline 965 + 53 new = 1018.


## What the conformance run is actually blocked on, checked 2026-09-03

**The project is provisioned and the VM is running.** This section replaces the earlier assumption
that no infrastructure existed; it was checked with the Cloud CLI rather than inferred.

Present in `studio-prod-7f3a`:

| Resource | State |
| --- | --- |
| `vox-service` | RUNNING, `e2-standard-2`, `europe-west1-c`, **`cos-stable-121-18867-584-3`**, no external address |
| `vox-runs` | 50 GB `pd-balanced`, READY, attached as device name `vox-runs` — so `/dev/disk/by-id/google-vox-runs` in `cloud-init.yaml` is right |
| Service account | `vox-production@studio-prod-7f3a.iam.gserviceaccount.com`, `cloud-platform` scope |
| Cloud NAT | router `vox-router`, gateway `vox-nat`, ALL_SUBNETWORKS_ALL_IP_RANGES |
| Firewall | `vox-allow-iap-ssh` from `35.235.240.0/20`, `vox-deny-all-ingress` from `0.0.0.0/0` |
| Secrets | `ELEVENLABS_API_KEY`, `VOX_GRANT_KEY`, `VOX_RUN_HMAC_KEY`, `VOX_RUN_KEY_ID` and — since 2026-09-04 — `VOX_NETWORK_TOKEN`, each bound to the production SA |
| Artifact Registry | `vox`, DOCKER, `europe-west1` |

**Two things are missing, and both are deploy steps rather than provisioning.** *Corrected
2026-09-05: this said three, and one of them has since been done — see the note under item 2.*

1. ~~**The registry is empty.**~~ **Done, 2026-09-05.** The image is pushed:
   `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox/production:9db484c`, digest
   `sha256:99c160c55d7f…`, read back from the registry rather than taken from the local daemon.
   **2m36s to push.** The registry reports the repository at **515.9 MB** — the compressed size,
   which is what is stored and transferred; the 2.06 GB carried through eight handoffs is the size
   after decompression on disk, and the two were being used interchangeably. Registry storage and
   egress remain unpriced *in currency*; the pull time is still unknown and is stage 8's to measure.
2. ~~**`VOX_NETWORK_TOKEN` does not exist in Secret Manager.**~~ **Done, 2026-09-04.** It exists and
   is bound to `vox-production@studio-prod-7f3a.iam.gserviceaccount.com`, read live with `gcloud`,
   and all five secrets are now bound to that identity. `deploy/README.md` ticked this on the 4th;
   **this file went on asserting the opposite until the 5th**, which is worse than either statement
   alone — a later session reading one of the two gets a confident answer and no hint that the
   other exists. What the read covers is existence and the positive binding only; stage 8's
   negative, that the crew identity *cannot* read it, is unrun, and `VOX_CREW_MODEL_KEY`'s own
   binding is unread.
3. ~~**The instance carries no `user-data` metadata.**~~ **Applied 2026-09-05.** The key list was
   empty and now reads `user-data`. The rendered file passes every check the wizard's stage 5 makes
   — no placeholder survives, 6354 bytes against the 262144 byte ceiling, `ExecStart` pinning the
   digest above — and the *stored* value was confirmed byte-identical to it by reading the Compute
   REST API directly.
   **But nothing on the VM starts a container yet, because the box has not been rebooted.**
   `cloud-init` reads `user-data` at boot; applying the metadata to a running machine changes
   nothing. The stop/start was refused by the agent's auto-mode write gate — which allowed
   `add-metadata` and not `instances stop`/`start` — so **the claim that COS reads this key and runs
   cloud-init over it is still unexecuted, and it is now the only thing between here and the
   conformance run.** An operator running the wizard hits no such gate.

## What the 2026-09-05 deploy established

**The service is deployed and running.** Stages 1 through 8 were performed by hand, following the
wizard step for step. `vox-production.service` is `active (running)`, `docker inspect` reports the
container's image as `…/production@sha256:99c160c5…` — **the digest that was pushed** — and the
service logged `Vox Production service ready on 127.0.0.1:8080`. `ss` confirms the bind is loopback
and not `0.0.0.0`, so `--network host` behaves as `cloud-init.yaml` claims. **Boot to ready: 55
seconds. Image pull: 35 seconds.**

**The first boot failed, and that is the most useful result of the day.** `/etc` on COS does not
survive a restart, so the hand-written `service.env` was gone and the unit crash-looped fifty times
in eight minutes on a missing `--env-file`. The env fetch moved into the boot path as
`vox-service-env.service` and the second boot came up clean. Both `deploy/fetch-service-env.sh` and
`deploy/README.md` had named this assumption as the one that would not fail loudly.

What the run turned from documented intent into observation:

- **The IAP tunnel answers**, and is the vehicle for everything below.
- **COS carries `curl`, `base64`, `docker`, `docker-credential-gcr` and `findmnt`** — checked by
  name rather than assumed. Two of those were standing unverified claims.
- **`/etc` on COS is writable**, probed directly rather than inferred from the documentation. What
  is *not* yet shown is that it survives a reboot, which is the failure mode that looks like a
  container starting today and crash-looping tomorrow.
- **All five secrets are readable by the production identity**, re-read live on the 5th rather than
  resting on the 4th's read.
- **`deploy/fetch-service-env.sh` ran on the instance against real Secret Manager**, its first
  execution outside fakes. It wrote `/etc/vox/service.env`, `600 root:root`, 491 bytes, nine keys,
  and the four path variables point into `/var/lib/vox` as intended.
- **COS reads `user-data` and runs cloud-init over it.** All four stages `active (exited)`,
  `cloud-init.target` up, unit files written to `/etc/systemd/system` dated to the boot. This is the
  claim the phase has carried as documented intent since the topology was chosen, and the
  `create-with-container` deprecation that prompted the whole cloud-init route cost nothing.
- **cloud-init rewrites `/etc` on every boot, not once per instance** — which is what makes the
  env-file fix sound rather than a coincidence. The second boot materialised two units that had
  never existed on that box.
- **The mount unit's escaped name is the one systemd derives.** `mnt-disks-vox\x2druns.mount`,
  `loaded active mounted`, `/dev/sdb` on `/mnt/disks/vox-runs`, `ext4`. Recorded on 2026-09-03 as
  "corrected by reasoning, not by a run"; the reasoning was right.
- **`assertWritesLandOnVolume` ran on the instance and passed.** New code in the boot path, where
  being wrong fails the deployment closed, and previously exercised only by unit tests and one local
  container start.
- **The uid is root.** `uid=0(root) gid=0(root)`. This was an open question and now has an answer
  that wants a decision: the production runtime runs as root in the VM. Inherited from the image
  rather than chosen here, and it belongs in ticket 12's proof sheet as a stated property.

And two defects it found, both of the shape this phase keeps naming:

- **The wizard's stage 6 could not have verified what it claimed.** Its `stat` ran unprivileged
  against a 0600 file in a 0700 directory, so it read EACCES and reported `MISSING` — and would have
  halted the deploy with "the fetcher reported success but it is not there" *immediately after the
  fetcher succeeded*. Fixed with `sudo` on both reads. A check that can only ever return its failure
  branch is not a check.
- **The registry size and the disk size were being used as one number.** 515.9 MB stored versus
  2.06 GB on disk; the wizard's stage 3 comment argued explicitly that the smaller figure was a
  four-fold understatement of the same quantity. It is not the same quantity. Corrected in the
  wizard and in `deploy/README.md`.

And one near-miss worth carrying, because it produced a convincing false alarm: **reading the
applied metadata back with `gcloud` on Windows showed a payload 15 bytes short with eight `?` in
it**, which reads as a metadata write that corrupted the file the machine boots from. The stored
value is in fact byte-identical; `gcloud`'s stdout encoding does the replacing, and it does it
through `PYTHONIOENCODING=utf-8` and a UTF-8 console alike. **A verification that runs through the
tool being verified is not independent of it.** The REST API is, and is what settled it.

The later Run answered the disk reboot, uid and tunnel questions. The standalone `identity.txt` and
`check.mjs` exit-3 artifacts remain a ticket 04 harness replay, not an unobserved deployment
property; `/dev/sdb` and the persisted Run directories identify the deployed disk directly.
