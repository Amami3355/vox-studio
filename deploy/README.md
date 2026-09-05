# Deploying the trusted Production service

Cloud-phase ticket 07. This file is the deployment's own record: what it runs, what it may reach,
and which of those statements are enforced rather than merely intended.

## What runs

One container, on one Container-Optimized OS VM, from `Dockerfile` at the repo root.

- **`deploy/cloud-init.yaml`** is the restart mechanism. `gcloud compute instances
  create-with-container` is deprecated, so the container is started by a systemd unit delivered
  through the `user-data` metadata key. `Restart=always` is what "the platform owns restart"
  means here. **It is a template and is never uploaded as it stands** — see "How it is deployed".
- **`deploy/docker-entrypoint.sh`** exports `VOX_BROWSER_EXECUTABLE` from the path the image
  recorded at build time, then `exec`s the service so it is PID 1 and receives SIGTERM directly.
- **`packages/production/src/ipc/cloud-service-host.ts`** is the entry point. It reads the
  environment and starts `cloud-host.ts`, which binds the network host on loopback.

The local Windows service is `packages/production/src/ipc/service-host.ts` and is untouched by any
of this. The two are siblings, not stages — ADR-0018 decision 7.

## How it is deployed

Two wizards, and the split is deliberate.

- **`scripts/provision-cloud-project.sh`** — thirteen stages, ticket 03's. It creates the project,
  the two identities, the five production secrets, the registry, the network, the disk and the VM.
  Its stage 1 states that gcloud is its only prerequisite. It happens once.
- **`scripts/deploy-cloud-service.sh`** — eight stages, ticket 07's. It pushes the image, renders
  the unit file, applies the metadata and restarts the box. It needs docker as well as gcloud, and
  it happens on every release.

Bolting the second onto the first would make the provisioner's own prerequisite sentence false and
force a thirteen-stage re-run to replace an image. What crosses the seam is a check rather than a
convention: the deploy wizard's stage 2 reads Secret Manager and refuses to continue unless all five
secrets exist *and* are bound to the production identity, because a missing one is not a startup
warning — it is a container that crash-loops every ten seconds behind a tunnel.

### The order, and why it is not cosmetic

**Secrets → image → `service.env` → metadata → boot.** The unit is `Restart=always` with
`RestartSec=10` and it needs both the image and `--env-file /etc/vox/service.env`. Applying the
metadata before either exists produces a unit that restarts every ten seconds on a machine with no
external address, reachable only through IAP. Each deploy stage verifies its predecessor first.

### `cloud-init.yaml` is a template

Its `ExecStart` ends in a `VOX_IMAGE` placeholder that **nothing in the repository defines**, and
the unit carries no `Environment=` or `EnvironmentFile=` that could. systemd expands an undefined
substitution to *nothing*, not to an error — so an unrendered upload runs `docker run` with no image
argument and crash-loops. This was found by reading the file rather than by running it; it had never
been applied.

Stage 5 substitutes a **digest** read back from Artifact Registry, not the tag that was pushed:

```
europe-west1-docker.pkg.dev/<project>/vox/production@sha256:<digest>
```

The digest is the point. A moving tag under `Restart=always` means a restart weeks later can bring
up a different image with nothing on the VM recording the change. Stage 5 then refuses to hand on a
file with any substitution unresolved, and that check is literal — which is why this file and the
yaml's own header describe the placeholder instead of spelling it. Prose that spelled it would trip
the check on a file that had rendered correctly.

Stage 4 reads the digest back **from the registry** rather than trusting what the local daemon
reports having pushed, and stage 8 compares the digest actually running on the box against it.

### `/etc/vox/service.env`: the box fetches its own secrets

The unit passes `--env-file /etc/vox/service.env` to `docker run`, and `cloud-init.yaml` does not
create that file. Its absence is the same ten-second crash loop as a missing image, from a different
cause, so something has to put it there before the metadata is applied.

The obvious route — an operator pasting five values into a heredoc over SSH — was rejected. It puts
every production credential through a terminal and into the VM's shell history, and **ticket 03's
last criterion is that no credential appears in a repository, a transcript or a shell history.**
That route would have cost a criterion that is otherwise still true.

`deploy/fetch-service-env.sh` runs **on the VM** instead. The instance already runs as
`vox-production@…` with the `cloud-platform` scope, and all five secrets are bound readable by
exactly that identity, so the box asks the metadata server for a token and reads the values from the
Secret Manager REST API itself. No value is typed, echoed, or passed as an argv element `ps` could
show; the script's output is names and byte counts. Deploy wizard stage 6 copies it over the tunnel,
runs it under `sudo`, and deletes it.

**It refuses to write a partial file.** If any one secret cannot be read, nothing is written at all,
because a partial env file starts a container that fails on a missing variable behind a tunnel —
harder to diagnose than a file that was never created. It also refuses a value containing a newline,
which `--env-file` cannot carry: docker would take a truncated value plus a garbage line and the
container would start with a silently wrong secret. The file is built beside its target and moved
into place, so a failed run leaves the previous one intact.

`deploy/tests/fetch-service-env.test.mjs` runs the script end-to-end against a fake metadata server
and a fake Secret Manager, as root in a container, so its first execution was not on the VM with
five real credentials:

```
docker run --rm --user root -v "${PWD}:/work" -w /work --entrypoint bash node:22-bookworm-slim \
  -c "apt-get update -qq && apt-get install -y -qq curl && node deploy/tests/fetch-service-env.test.mjs"
```

Four of its five cases are refusals, and each guard was removed in turn and the harness watched
going red, so the checks are known to detect what they claim to.

**What is not verified.** All three are documented Google contracts and none has been executed on
this instance:

- that Container-Optimized OS carries `curl` and `base64` — the script checks for both and dies
  immediately and by name if either is absent, before touching anything. Note the **production image
  does not have curl**, which does not matter here because this runs on the COS host rather than in
  the container, but it is the kind of assumption worth not making twice.
- that the metadata server issues a token for the instance's service account at the documented path.
- that `/etc` on COS is a writable overlay surviving a reboot. This one does **not** fail loudly: it
  would look like a container that starts today and crash-loops after the next restart, which is why
  it is listed in what the conformance run still owes rather than treated as done.

### What stage 8 is for

It is the only place two documented-but-unexecuted claims get tested: that Container-Optimized OS
reads the `user-data` key and runs cloud-init over it, and that `mnt-disks-vox\x2druns.mount` is the
name systemd derives from the escaped mount path. Both are the documented contract and neither has
ever been run. Stage 8 polls for ten minutes — first boot pulls 2.06 GB from Artifact Registry,
which Private Google Access covers, so it does **not** cross Cloud NAT — and on failure prints the
cloud-init journal and both units' status rather than inviting a re-run.

The wizard takes that size from `docker images`, not from `docker image inspect --format {{.Size}}`.
Under Docker Desktop's containerd image store the latter reported **515 MB** for this image where
`docker images` and `docker system df` both say 2.06 GB, and the number matters in the two places it
is used: what the registry is billed for, and how long a first pull should be expected to take. An
operator told to expect 515 MB reads a normal pull as a hung deploy.

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

**One of the following has been executed; the other nine have not.** Each is listed so it is
claimed only once it is true, and the one tick below carries the date and the method that earned it.

**The first three now have a vehicle rather than only a description**: the wizard stage named
against each performs it. A stage existing is not the step being done — every one of these stays
unticked until a run has happened.

- [ ] `cloud-init.yaml` **rendered and** applied to the VM, and Container-Optimized OS confirmed to
      read `user-data` and run it. **Documented intent until then.** The instance exists and runs COS
      (`cos-stable-121-18867-584-3`) but carries **no `user-data` metadata**, so nothing on it
      starts a container today. — *deploy wizard stages 5, 7 and 8.*
- [ ] The image pushed to `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox`, which currently holds
      **0 items**. 2.06 GB, and the pull time and registry storage cost are still an open item — and
      stage 8's ten-minute poll is where the pull time stops being unknown. — *deploy wizard stage 4.*
- [x] `VOX_NETWORK_TOKEN` created in Secret Manager and bound to
      `vox-production@studio-prod-7f3a.iam.gserviceaccount.com`. **Read live with `gcloud` on
      2026-09-04: it exists, and all five of `ELEVENLABS_API_KEY`, `VOX_GRANT_KEY`,
      `VOX_RUN_HMAC_KEY`, `VOX_RUN_KEY_ID` and `VOX_NETWORK_TOKEN` are bound to that identity.**
      This is the only item on this list that is true, and it is why the deploy wizard's stage 2
      lets an operator through to stage 3.
      **What is ticked here is existence and the positive binding, and nothing more.** Stage 8's
      separate assertion — that the crew identity *cannot* read this secret — is a negative and has
      not been run; `VOX_CREW_MODEL_KEY`'s own binding was not read either. A secret being readable
      by the right identity is not evidence that it is unreadable by the wrong one.
      — *provisioning wizard stage 6 creates it, stage 8 proves the crew cannot read it, and the
      deploy wizard's stage 2 refuses to deploy without it.*
- [ ] `/etc/vox/service.env` written on the VM at mode 0600 by `deploy/fetch-service-env.sh`, with
      COS confirmed to carry `curl` and `base64` and the metadata server confirmed to issue a token
      for the instance's identity. The script has been run end-to-end against fakes, as root, in a
      container; it has never run on the VM. — *deploy wizard stage 6.*
- [ ] `/etc/vox/service.env` still present after a reboot — i.e. `/etc` on COS is the writable
      overlay it is documented to be. This is the one assumption in the env-file path that does
      **not** fail loudly: it looks like a container that starts today and crash-loops tomorrow.
- [ ] `prepare-disk.sh`, `run-check.sh` and `check.mjs` run against the real disk.
- [ ] `identity.txt` written; `check.mjs` exit 3 produced by a real run.
- [ ] A render completing on the VM with outbound traffic observed and compared against the two
      destinations above. `--network none` is **not** the control — it now fails by design.
- [ ] A non-`record` command attempting egress and being refused **by the adapter**, with the
      network available, so the test is of the adapter and not of the network's absence.
      **Demonstrated in a local container on 2026-09-04, and left unticked deliberately.**
      `deploy/container-smoke.mjs` went all-green against `vox-production:latest`
      (`sha256:92f9ca76…`) on Docker Desktop, control included: the container could reach
      `8.8.8.8:53`, and `deniedNetworkAdapter` still refused with `NETWORK_POLICY_DENIED`. What
      that buys is the *code path*, on a machine that is not the VM, under a runtime that is not
      COS and a network that is not the VPC. This list is what the **conformance run** owes, and
      the conformance run happens on the instance — so the local green is evidence toward this
      item, not the item.
- [ ] The tunnel measured under a three-minute synchronous render.
