# Private Vox Studio

The product frontend is `apps/studio`; `apps/component-studio` remains the capability gallery.
The API and worker live in `services/agents/src/vox_crew/studio_*.py`.
See [ADR-0025](../../docs/adr/0025-studio-admission-is-durable-and-separate-from-production-authority.md).

## Local workspace

Install the Python project's `studio` extra in the same environment as the crew, then build
the frontend with `pnpm studio:build`. Set `VOX_STUDIO_ACCESS_CODE` to a private random value
of at least 16 characters and `VOX_STUDIO_ORIGIN` to the exact browser origin. Do not put the
access code in a command argument, frontend bundle or tracked file.

```sh
python -m vox_crew.studio_api --state /persistent/studio --assets apps/studio/dist --port 8780
```

The default listener and origin are `http://127.0.0.1:8780`. For frontend development run
`pnpm studio:app`, set the API origin to `http://127.0.0.1:5274`, and keep the API on 8780.
The Vite development proxy forwards `/api`; production serves the built frontend from the API.
Use HTTPS when exposing hosted access. API instances need the same persistent local filesystem;
this SQLite database must not be deployed on an ephemeral Cloud Run filesystem or object mount.
The API container receives only the Studio access code, its state and static assets.

## Provider admission and execution

Saving a brief makes no provider call. Requests cannot carry policy, grants, provider names,
model configuration or arbitrary image ceilings. The initial implementation deliberately
requires the existing operator authorization boundary before queueing a production:

```sh
python -m vox_crew.studio_worker prepare --state /persistent/studio --config /etc/vox-crew/autonomous --job <submission-id>
```

This prints the exact Production request and its request digest. With an explicit budget
authorization, the Production operator installs a new envelope under the existing autonomous
envelope directory. Follow [the autonomous runbook](../crew/autonomous/README.md); preserve
all earlier envelopes and recovery policies. Copy that same public envelope to Studio, then:

```sh
python -m vox_crew.studio_worker authorize --state /persistent/studio --config /etc/vox-crew/autonomous --job <submission-id> --envelope /operator/envelope.json
python -m vox_crew.studio_worker work --state /persistent/studio --crew-state /var/lib/vox-crew --config /etc/vox-crew/autonomous
```

The worker needs the existing hosted crew environment and forwarding capability. It acquires
both the Studio lock and the existing crew lock; a second executor cannot start. Production
still enforces its own grants. Run API and worker as separate supervised processes so an HTTP
restart does not kill production. Preserve both state volumes and immutable deployment references.
The worker can wait for a human image decision without holding an HTTP request open.

After a worker crash, stop any supervisor restart loop before operator reconciliation:

```sh
python -m vox_crew.studio_worker reconcile --state /persistent/studio --crew-state /var/lib/vox-crew --config /etc/vox-crew/autonomous --job <submission-id>
```

This only queues unchanged, nonterminal checkpoints with no uncertain side effect after a
fresh signed snapshot comparison. It refuses unresolved renders, provider outcomes, terminal
blocks and changed ceilings. A refusal needs a diagnosis, not a new submission to reset spend.

## Recorded evidence

Import an existing public delivery folder containing `evidence.json`, `export-index.json`
and the referenced media. Each imported media digest is verified; video/audio tracks decode.
The resulting submission is explicitly recorded and cannot be authorized as a new live attempt.

```sh
python -m vox_crew.studio_worker import --state /persistent/studio --source /operator/delivery/sky
```

## Verification

`pnpm --filter @vox/studio typecheck`, `pnpm exec biome check apps/studio` and
`pnpm studio:build` check the frontend. `pnpm studio:test` uses a disposable API workspace and
the locally installed Edge on Windows; set `VOX_TEST_BROWSER` for another installed Playwright
channel. Tests cover login, saved brief, browser refresh, private media access and mobile layout.
Run `python -m pytest services/agents/tests/test_studio.py services/agents/tests/test_autonomous.py`
from the repository root for admission, worker locks, media ranges, human decisions and existing
autonomous regression coverage. These checks do not dispatch providers.

Completion still needs the hosted private URL, current signed connectivity evidence, a newly
authorized browser submission reaching a complete reviewed film, human viewing, and a saved
rehearsal. The existing Sky draft proves playback only and remains incomplete.

## Hosted layout and rollback

The canonical browser origin is `https://vox-studio-164544259455.europe-west1.run.app`.
Cloud Run also reports a hashed alias; use the canonical origin above for sign-in because
mutation Origin validation and the operator environment are bound to it.

`deploy/studio/Dockerfile` has `api` and `worker` targets. Build them from the repository root;
the Dockerfile-specific context allowlist excludes local dependencies, tests, runtime state and
secrets. The API serves only the built frontend and has no provider environment. The worker
extends the pinned, previously deployed crew image. Scan both images with `scan_image.py`,
push them, and read back registry digests before `prepare_deployment.py` emits boot metadata.
That preparation tool appends the Studio services to the archived crew metadata, preserving
the old services and Production configuration. It enables only the API on boot.

The stateless proxy image under `proxy/` forwards only to `10.132.0.3:8780`. Cloud Run service
`vox-studio` uses the separate role-free `vox-studio-edge` service account, Direct VPC egress
through subnet `vox-studio-edge` (`10.42.0.0/26`), and a maximum of one instance with a zero
minimum. Firewall `vox-allow-studio-edge-api` permits only that range to TCP 8780 on the crew
service account. The existing deny-ingress rule and Production-only SSH allowance remain.
The Cloud Run startup probe tests the actual backend path. See Google's
[Direct VPC guidance](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc) and
[application-authenticated public entry point configuration](https://docs.cloud.google.com/run/docs/authenticating/public).

On the VM, `/mnt/disks/vox-crew/studio` is owned by UID 10001 and persists SQLite/media.
The separately provisioned `/mnt/disks/vox-crew/studio-operator/studio.env` is root-only and
contains only the access code and canonical origin. It is never embedded in cloud-init metadata.
The worker additionally mounts the existing crew state and separately installed operator config.
`vox-studio-worker.service` is explicitly started; it does not automatically resume interrupted
paid work. Stop it before checkpoint reconciliation so the operator can obtain its OS lock.

For rollback, stop the Studio worker and API, restore the archived crew boot metadata and
prior unit configuration, and remove traffic from the Cloud Run revision. Preserve the Studio
and crew state directories, credentials, envelopes and journals. Do not reset Production or
delete its historical Runs. Runtime deployment records and the pre-install metadata archive
are under `.scratch/hackathon-launch/runtime/studio-deploy/` on the operator workstation.
