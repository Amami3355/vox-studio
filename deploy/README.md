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

- **In the host:** the library fallback remains 15 minutes. The deployed unit explicitly sets
  `VOX_IPC_SOCKET_TIMEOUT_MS=1800000` (30 minutes), admitting the crew HTTP client's full request
  window. `cloud-deployment-contract.test.mjs` checks this relationship. The September 9 climate
  film took 862 seconds to render, too close to the former 900-second socket limit.
  A render exceeding the client's 30-minute window still requires reconciliation; increasing a
  timeout does not supply asynchronous job tracking or authorize a duplicate render.
- **On the platform:** the binding ceiling is the SSH/IAP tunnel's, not the host's. A tunnel that
  drops at three minutes turns a healthy render into an indistinguishable outage report. This has
  **not been measured** — see the conformance run below.

## Secrets

Every secret arrives in the environment, bound by the runtime from Secret Manager. The reading code
does not change: `resolveProductionServiceConfiguration` still reads `process.env`.

**No secret is baked into the image**, and `packages/production/src/proof/image-scan.ts` asserts it
— it refuses env files, credential files, and any of the secret-bearing variables *assigned* a
value in any layer. Naming one is permitted; the Dockerfile and this file both do.

**What that scan looks at, since the sentence above used to imply more than the code did.** Until
2026-09-05 `deploy/image-leak-scan.mjs` walked `/app` alone — the right first root, because `/app` is
where a careless `COPY . .` lands, and not where a credential in a Node image usually ends up.
`/root/.npmrc` is written by npm and pnpm as a matter of course, has been named in the scan's
`CREDENTIAL_FILENAMES` since it was written, and nothing ever walked the directory holding it. The
scan now walks `/app`, `/root`, `/pnpm` and `/etc/vox`, skipping the package store on the auxiliary
roots for the same stated reason it skips `node_modules`, and reporting an absent root as absent
rather than passing over it silently.

**The widened scan was run against the image on 2026-09-05 and passed**: 307 files under `/app`, 3 under `/root`, 0 under `/pnpm`, `/etc/vox` absent — 310 files, no violations. Two things that only a run could say. **There is no `/root/.npmrc` in this image**, so the credential the widening went looking for is not there; that is now a measurement rather than a hope. And **`/pnpm` contributed nothing**, because its only child is the `store` directory the auxiliary skip list excludes by design — the root is walked, and it has nothing else in it. Docker Desktop under Windows, so it is a statement about the image, which is the same image everywhere, rather than about COS.

`SECRET_NAMES` in that scan is deliberately not the same list as the deploy wizard's
`PRODUCTION_SECRETS`. The wizard's list is *what to fetch from Secret Manager*, so it carries
`VOX_RUN_KEY_ID`, an identifier rather than a secret. The scan's list is *what must never be baked
into an image*, so it drops the identifier and adds `VOX_IPC_TOKEN`, which is a real secret in the
local topology and would be a real finding here. Both lists are right; neither is drifting.

## The volume

`VOX_LEDGER_ROOT` and `VOX_CALIBRATION_PATH` are on ticket 04's disk, mounted at `/var/lib/vox`.

**They are on it because the code requires it, which was not true until 2026-09-05.** The mount
check proves a separate filesystem is attached; it says nothing about whether anything is written
to it. All three write paths — `VOX_RUNS_ROOT`, `VOX_LEDGER_ROOT`, `VOX_CALIBRATION_PATH` — could
point at the container's own filesystem with that check green, and the only thing holding them on
the volume was a heredoc in `deploy/fetch-service-env.sh` writing them that way. That is a
deployment artifact agreeing with the code by convention. `assertWritesLandOnVolume` now refuses to
start on any of the three, and `VOX_REMOTION_ENTRY` is deliberately exempt: it is read from the
image, not written to.
`VOX_REMOTION_ENTRY` is in the image, because it is production source.

**The service refuses to start if the disk did not attach.** The mount point exists in the image —
a layer creates it — so an `existsSync` cannot tell an attached disk from a missing one, and every
Run would land on the container's own filesystem and vanish at the next restart, silently, with the
platform restarting the container for you. `persistent-volume.ts` compares device numbers against
the parent directory instead. Its known limit: it proves a *separate* filesystem, not the intended
one. A `tmpfs` would pass. Identifying the specific disk is ticket 04's `identity.txt`.

**The containment check found something the first time it ran, and it was in the runbook.** Starting
the container from Git Bash on Windows with `-e VOX_RUNS_ROOT=/var/lib/vox/runs` does not set that
value: MSYS rewrites any argument that looks like an absolute POSIX path, and the service received
`/app/C:/Program Files/Git/var/lib/vox/runs`. **Every previous local smoke run passed with those
three variables mangled**, because nothing compared them to the mount — the mount itself is set by
the image, so `assertPersistentVolumeMounted` was reading a correct value while all three write
paths pointed into the container's own filesystem. This is the exact failure the volume check
exists to prevent, sitting underneath a green volume check for as long as the recipe has existed.

Prefix the whole command with `MSYS_NO_PATHCONV=1` when starting it by hand from Git Bash. It is the
same rewrite the wizard's `dk()` comment warns about for `docker run --volume`, arriving through
`-e` instead.

**Do not prefix `gcloud` with it.** Found on 2026-09-05, deploying for the first time: the Windows
`gcloud` wrapper locates its own `lib/gcloud.py` through a path that MSYS is *supposed* to convert,
so `MSYS_NO_PATHCONV=1 gcloud …` fails before it parses an argument, with
`can't open file 'C:\c\Users\…\lib\gcloud.py'`. The rule is per-tool and the two tools want opposite
things: **`docker` needs the rewrite suppressed, `gcloud` needs it left alone.** The deploy wizard
never hits this because it passes no absolute POSIX paths to either.

### `gcloud`'s own output cannot verify what `gcloud` uploaded, on Windows

Also 2026-09-05, and the more dangerous of the two. Reading the applied `user-data` back with
`gcloud compute instances describe --format='value(metadata.items[0].value)'` returned a value
**15 bytes shorter than the file that was uploaded**, with all eight em-dashes replaced by `?`. That
looks exactly like a metadata write that mangled its payload, which for a file the machine boots
from is a stop-everything result.

It is not. Read from the Compute REST API with `curl` and a bearer token — no Python between the
bytes and the file — **the stored value is byte-identical: 6354 bytes, eight U+2014, no `?`.** The
replacement happens in gcloud's *stdout* encoding on Windows, and it survives both
`PYTHONIOENCODING=utf-8` and setting the PowerShell console to UTF-8, because the CLI's output is a
redirected pipe in every case.

**So a diff between a rendered file and a `gcloud`-printed read-back is not evidence of anything on
Windows.** To check what a metadata write actually stored:

```sh
TOK=$(gcloud auth print-access-token)
curl -s -H "Authorization: Bearer $TOK" \
  "https://compute.googleapis.com/compute/v1/projects/<project>/zones/<zone>/instances/<instance>" \
  -o instance.json
```

and read `metadata.items[].value` out of the JSON. The wizard does not read the metadata back at
all, so it is not affected — but anyone verifying a deploy by hand will hit this, and the false
result points at the scariest possible cause.

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

## Conformance record

**Twelve of the following have been executed.** The two unticked entries are the standalone ticket
04 harness artifacts (`check.mjs` and `identity.txt`), not untested properties of the deployed
service: the intended `/dev/sdb` ext4 disk has separately survived controlled reboots with its Run
data intact. Each item stays listed so the evidence mechanism is not silently substituted.

**The deployment observations were earned on 2026-09-05**, across the first paid Run and the
no-new-take conformance follow-up.
**The deployment was conformance-tested on `vox-service` from the digest that was pushed, with the
service answering on `127.0.0.1:8080`.** The VM was stopped after the checks; the image, corrected
`user-data` and persistent disk remain.

**It did not work the first time, and the failure is the most valuable thing in this section.** The
first boot crash-looped fifty times in eight minutes because `/etc` on COS does not survive a
restart — see the env-file item below. The design changed in response, and the second boot came up
in 55 seconds.

The paid Run and the no-new-take follow-up supplied the render, adapter and tunnel observations.
The wizard itself remains a deploy tool: its existence is not evidence, so every tick below names
the independent run that earned it.

- [x] `cloud-init.yaml` **rendered and** applied to the VM, and Container-Optimized OS confirmed to
      read `user-data` and run it. The final correction was rendered to 20,675 bytes, inside the
      262,144-byte metadata ceiling, with no placeholder surviving and `ExecStart` pinning
      `sha256:f136e0bf…`. It adds idempotent creation of `runs/` and `ledger/` after the mount and
      before Docker. The installed unit, both successful ExecStartPre results, directory modes and
      pinned digest were read back after a controlled reboot.
      **Executed on the reboot of 2026-09-05, and this is the claim the whole phase had been
      carrying as documented intent.** Container-Optimized OS read the `user-data` key and ran
      cloud-init over it: `cloud-init-local`, `cloud-init`, `cloud-config` and `cloud-final` all
      reached `active (exited)` and `cloud-init.target` came up, with the unit files it writes
      appearing in `/etc/systemd/system` dated to that boot. **`gcloud compute instances
      create-with-container` was never needed, and the deprecation noted in ticket 07's fourth
      amendment cost this deployment nothing.** — *deploy wizard stages 5, 7 and 8.*
- [x] **The mount unit's systemd-escaped name is the one systemd derives.** `mnt-disks-vox\x2druns.mount`
      came up `loaded active mounted`, description "Vox persistent Run store", with
      `/dev/sdb` on `/mnt/disks/vox-runs` as `ext4`. That name was worked out by reasoning on
      2026-09-03 and explicitly recorded as "corrected by reasoning, not by a run". It has now been
      run, and the reasoning was right.
- [x] The image pushed to `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox`. **Done 2026-09-05**,
      by hand rather than through the wizard, following its stages 3 and 4 step for step. Tag
      `906caf2` / `cloud-09`, digest `sha256:f136e0bf…`, and **the digest was read back from the registry** with
      `gcloud artifacts docker images describe --format='value(image_summary.digest)'` — which also
      retires the standing doubt about whether that field name is right. **The push took 2m36s.**
      Two untagged manifests landed alongside the tagged one and are believed to be buildkit
      attestation manifests; that is an inference, not a read, and the unit pins the tagged digest
      regardless.
      **The storage figure was wrong by a factor of four, in the safe direction.** The repository
      reports **515.9 MB**, not the 2.06 GB carried across eight handoffs: 515.9 MB is the
      compressed size that is stored and transferred, and 2.06 GB is what it decompresses to on
      disk. The wizard's stage 3 comment had these the other way round and is corrected.
      **Registry storage and egress are still unpriced in currency** — the size is now measured, the
      rate is not; `cloud.google.com/artifact-registry/pricing` did not come back through the doc
      tools on the 5th.
      **Pull time: 35 seconds**, measured on the instance's second boot — `09:04:51` "Pulling from"
      to `09:05:26` "Status: Downloaded". Within the region, from a `e2-standard-2`. The wizard's
      stage 8 polls for ten minutes and warns the operator that a first pull is slow; the real
      figure is seventeen times inside that budget, and the poll is now generous rather than tight.
      — *deploy wizard stage 4.*
- [x] `VOX_NETWORK_TOKEN` created in Secret Manager and bound to
      `vox-production@studio-prod-7f3a.iam.gserviceaccount.com`. **Read live with `gcloud` on
      2026-09-04: it exists, and all five of `ELEVENLABS_API_KEY`, `VOX_GRANT_KEY`,
      `VOX_RUN_HMAC_KEY`, `VOX_RUN_KEY_ID` and `VOX_NETWORK_TOKEN` are bound to that identity.**
      This is the prerequisite the deploy wizard's stage 2 requires before stage 3.
      **What is ticked here is existence and the positive binding, and nothing more.** Stage 8's
      separate assertion — that the crew identity *cannot* read this secret — is a negative and has
      not been run; `VOX_CREW_MODEL_KEY`'s own binding was not read either. A secret being readable
      by the right identity is not evidence that it is unreadable by the wrong one.
      — *provisioning wizard stage 6 creates it, stage 8 proves the crew cannot read it, and the
      deploy wizard's stage 2 refuses to deploy without it.*
- [x] `/etc/vox/service.env` written on the VM at mode 0600 by `deploy/fetch-service-env.sh`.
      **Done 2026-09-05, on the instance, against real Secret Manager.** COS carries `curl` and
      `base64` — checked by name before the run, along with `docker`, `docker-credential-gcr` and
      `findmnt`. The metadata server issued a token for the instance's identity (1024 bytes) and all
      five secrets were read: `ELEVENLABS_API_KEY` (51), `VOX_GRANT_KEY` (64), `VOX_RUN_HMAC_KEY`
      (64), `VOX_RUN_KEY_ID` (12), `VOX_NETWORK_TOKEN` (64). The file is `600 root:root`, 491 bytes,
      nine keys, in a `/etc/vox` that is `700 root:root`. No value passed through the terminal.
      **This run found a defect in the wizard stage that performs it.** Stage 6 verified the file
      with an *unprivileged* `stat`, which on a 0600 file inside a 0700 directory fails with EACCES
      rather than printing a mode — so `2>/dev/null || echo MISSING` answered `MISSING` for a file
      that was present and correct, and the wizard would have halted with "the fetcher reported
      success but it is not there" immediately after succeeding. Both reads now use `sudo`. The
      check could only ever have reported the absence it was written to detect and never the state
      it claimed to read. — *deploy wizard stage 6.*
- [x] `/etc/vox/service.env` still present after a reboot. **Answered 2026-09-05, and the answer was
      no — this assumption was wrong, and the design changed because of it.**
      `/etc` on Container-Optimized OS is writable and **stateless**: it is rebuilt at boot. The file
      was written over the tunnel at mode 0600 and verified present; after the restart `/etc/vox` did
      not exist at all, and `vox-production.service` crash-looped **fifty times in eight minutes** on
      `docker: open /etc/vox/service.env: no such file or directory`. This item predicted the exact
      symptom — "a container that starts today and crash-loops tomorrow" — and it arrived on the same
      day rather than the next one.
      **The fix is that the box fetches its secrets at every boot**, as `vox-service-env.service`: a
      oneshot with `RemainAfterExit=yes`, ordered `Before=vox-production.service`, which takes a hard
      `Requires=` on it so a failed fetch stops the service rather than letting docker fail every ten
      seconds. `deploy/fetch-service-env.sh` is rendered into the unit file base64-encoded by the
      wizard's stage 5, so it keeps one copy in the repository. A oneshot rather than an
      `ExecStartPre` because `Restart=always` with `RestartSec=10` would otherwise ask Secret Manager
      for five secrets every ten seconds for as long as nobody was watching.
      **Verified on the second boot**: the unit ran at 09:04:49, fetched all five secrets, and wrote
      the file at `600 root:root`, 491 bytes — with the fetcher itself present at `700 root:root`,
      7818 bytes, byte-identical to the repository's copy.
- [x] **cloud-init rewrites `/etc` on every boot, not once per instance.** Not previously on this
      list, and it is what makes the fix above sound. The written unit files carried the new boot's
      timestamp while `/etc/vox` was gone, and the second boot materialised two units that had never
      existed on the box before. COS also configures `runcmd` at `always` frequency, in
      `/etc/cloud/cloud.cfg`.
- [ ] `prepare-disk.sh`, `run-check.sh` and `check.mjs` run against the real disk.
- [ ] `identity.txt` written; `check.mjs` exit 3 produced by a real run.
- [x] **The service starts on the instance and binds loopback.** 2026-09-05:
      `Vox Production service ready on 127.0.0.1:8080`, `node` holding the socket, with `ss` showing
      the bind is `127.0.0.1` and not `0.0.0.0` — so `--network host` puts the listener on the VM's
      loopback, where the IAP tunnel lands, exactly as `cloud-init.yaml`'s comment claims. Boot to
      ready was **55 seconds**, pull included.
      **`assertWritesLandOnVolume` ran on the instance for the first time and passed.** It was added
      on 2026-09-05 to close a review finding, failed correctly on its first local execution, and had
      never run on the VM — new code in the boot path, where being wrong fails the deployment closed.
      It is now exercised where it matters.
- [x] **The uid the container runs as.** Answered, and the answer wants a decision rather than a
      tick: **`uid=0(root) gid=0(root)`.** The volume and its populated `runs/` and `ledger/`
      directories are owned by root; the service has persisted a complete Run there. Running the production
      runtime as root inside the VM is not something this phase decided; it is something it
      inherited from the image, and it belongs in ticket 12's proof sheet as a stated property
      rather than being discovered by whoever reads the Dockerfile next.
- [x] A render completed on the VM with outbound traffic observed and compared against the two
      destinations above. The follow-up reused the existing compiled document and audio, opened no
      Run and called no synthesizer. `fonts.gstatic.com` resolved to `74.125.140.94` and
      `2a00:1450:400c:c08::5e`; the only observed external HTTPS endpoint was
      `74.125.140.94:443`, with no unexpected endpoint. `--network none` is **not** the control —
      it fails by design.
- [x] The deployed image's denying adapter was exercised with the network available. On the VM,
      `deploy/container-smoke.mjs` first reached `8.8.8.8:53`, then the adapter refused with
      `NETWORK_POLICY_DENIED`; its malformed, forged-MAC, signed-request and replay checks were
      green in the same invocation. `cloud-host.test.ts` separately holds the service assembly to
      that adapter, because no test-only egress command is added to the public production surface.
- [x] The tunnel was measured under a long synchronous render. It failed after 181 s and 137 s
      while the container remained healthy; the second render completed server-side. A loopback
      recovery answered in 1 s. This is a measured platform limit, not a passing timeout claim.
