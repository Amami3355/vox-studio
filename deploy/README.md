# Deploying the trusted Production service

Cloud-phase ticket 07. This file is the deployment's own record: what it runs, what it may reach,
and which of those statements are enforced rather than merely intended.

## What runs

One container, on one Container-Optimized OS VM, from `Dockerfile` at the repo root.

- **`deploy/cloud-init.yaml`** is the restart mechanism. `gcloud compute instances
  create-with-container` is deprecated, so the container is started by a systemd unit delivered
  through the `user-data` metadata key: `--metadata-from-file=user-data=deploy/cloud-init.yaml`.
  `Restart=always` is what "the platform owns restart" means here.
- **`deploy/docker-entrypoint.sh`** exports `VOX_BROWSER_EXECUTABLE` from the path the image
  recorded at build time, then `exec`s the service so it is PID 1 and receives SIGTERM directly.
- **`packages/production/src/ipc/cloud-service-host.ts`** is the entry point. It reads the
  environment and starts `cloud-host.ts`, which binds the network host on loopback.

The local Windows service is `packages/production/src/ipc/service-host.ts` and is untouched by any
of this. The two are siblings, not stages — ADR-0018 decision 7.

## Exactly one instance

**The replay cache is an in-process `Map`, so one container is one cache.** A request captured
inside the skew window and replayed against a *second* instance is accepted, because that instance
has never seen the request id. This is a real weakening relative to the local topology, where one
machine ran one host.

Running a second instance therefore changes a property of ADR-0018 and owes its own decision. It is
not a configuration knob. See ADR-0018 decision 8 and `packages/production/src/ipc/boundary.ts`.

## Egress: two destinations, and nothing enforces the list

The service is *intended* to reach exactly two hosts:

| Destination | Why it is there |
| --- | --- |
| The ElevenLabs synthesizer's host | `record` is the only command permitted outbound network, and this is where it goes. ADR-0007. |
| `fonts.gstatic.com` | `packages/video/src/design/fonts.ts` loads four faces through `@remotion/google-fonts`, which fetches `woff2` files **inside the headless browser** — below the denying adapter, which therefore never sees them. Ticket 11 measured the render failing outright without it. |

**Nothing at the network layer enforces this list.** `gcloud compute firewall-rules create` takes
`--destination-ranges`, which is CIDR only, and both hosts sit behind CDNs with wide, shifting
ranges. Restricting egress by hostname needs Secure Web Proxy or Cloud NGFW FQDN objects — real
products, real cost, and out of scope for this phase.

So the list is **documented intent, not an enforced control**. What remains true and worth keeping:
it is the record of which outbound destinations this system is supposed to have, and a destination
appearing in a traffic log that is not on it is a finding.

`fonts.gstatic.com` is the only font host **observed** — ticket 11's four failing loads were all
`gstatic`, and the font CSS ships in the bundle so `fonts.googleapis.com` was never reached. It is
not the only host possible. A face that later resolves elsewhere fails the same way.

**The lock that is enforced** is the denying network adapter in
`packages/production/src/ipc/service-configuration.ts`, which refuses every outbound request the
service itself makes outside `record`. It is code, it is total, and in a container with egress it
is the only egress lock this deployment actually has. It matters more here than it did locally.

The VM reaches the internet through **Cloud NAT** — an instance with no external address reaches no
non-Google host without it, and Private Google Access covers Artifact Registry and Secret Manager
but neither of the two hosts above. Ticket 03's wizard provisions the router and gateway.

## The request timeout admits a synchronous render

Ticket 11 measured a showcase render at **178 s** under a two-vCPU cap on `e2-standard-2` (2 vCPU,
8 GB, `europe-west1`), peaking at **2.08 GB**.

- **In the host:** `DEFAULT_IPC_SOCKET_TIMEOUT_MS` is 15 minutes, asserted against the measured
  figure in `cloud-host.test.ts`.
- **On the platform:** the binding ceiling is the SSH/IAP tunnel's, not the host's. A tunnel that
  drops at three minutes turns a healthy render into an indistinguishable outage report. This has
  **not been measured** — see the conformance run below.

## Secrets

Every secret arrives in the environment, bound by the runtime from Secret Manager. The reading code
does not change: `resolveProductionServiceConfiguration` still reads `process.env`.

**No secret is baked into the image**, and `packages/production/src/proof/image-scan.ts` asserts it
— it refuses env files, credential files, and any of the secret-bearing variables *assigned* a
value in any layer. Naming one is permitted; the Dockerfile and this file both do.

## The volume

`VOX_LEDGER_ROOT` and `VOX_CALIBRATION_PATH` are on ticket 04's disk, mounted at `/var/lib/vox`.
`VOX_REMOTION_ENTRY` is in the image, because it is production source.

**The service refuses to start if the disk did not attach.** The mount point exists in the image —
a layer creates it — so an `existsSync` cannot tell an attached disk from a missing one, and every
Run would land on the container's own filesystem and vanish at the next restart, silently, with the
platform restarting the container for you. `persistent-volume.ts` compares device numbers against
the parent directory instead. Its known limit: it proves a *separate* filesystem, not the intended
one. A `tmpfs` would pass. Identifying the specific disk is ticket 04's `identity.txt`.

## Environment

| Variable | Where it points |
| --- | --- |
| `VOX_VOLUME_ROOT` | The mount point to verify. `/var/lib/vox`, set in the image. |
| `VOX_RUNS_ROOT` | Run directories, on the volume. |
| `VOX_LEDGER_ROOT` | The private ledger, on the volume. |
| `VOX_CALIBRATION_PATH` | Duration calibration, on the volume — it accumulates across Runs, and an image-local path resets it on every deploy. |
| `VOX_REMOTION_ENTRY` | In the image. Set by the Dockerfile. |
| `VOX_BROWSER_EXECUTABLE` | In the image. Set by the entrypoint from the build-time path. |
| `VOX_NETWORK_TOKEN` | This transport's HMAC secret. **Not the pipe transport's** — the two sign under different domain tags and hold different key material. |
| `VOX_NETWORK_PORT` / `VOX_NETWORK_BIND` | Default `8080` and `127.0.0.1`. A non-loopback bind is refused. |
| `VOX_GRANT_KEY`, `VOX_RUN_HMAC_KEY`, `VOX_RUN_KEY_ID`, `ELEVENLABS_API_KEY` | From Secret Manager. |

## What the conformance run still owes

None of the following has been executed. Each is listed so it is claimed only once it is true.

- [ ] The VM created from `cloud-init.yaml`, and Container-Optimized OS confirmed to read
      `user-data` and run it. **Documented intent until then.**
- [ ] `prepare-disk.sh`, `run-check.sh` and `check.mjs` run against the real disk.
- [ ] `identity.txt` written; `check.mjs` exit 3 produced by a real run.
- [ ] A render completing on the VM with outbound traffic observed and compared against the two
      destinations above. `--network none` is **not** the control — it now fails by design.
- [ ] A non-`record` command attempting egress and being refused **by the adapter**, with the
      network available, so the test is of the adapter and not of the network's absence.
- [ ] The tunnel measured under a three-minute synchronous render.
