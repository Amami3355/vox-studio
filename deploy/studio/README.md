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

Creating a Studio film queues production without spending ceilings. Existing blocked films
wait for the user to select Resume. Historical numeric limits remain readable, but the worker
installs an unlimited signed successor before continuing their Run. Null limits and authorization
expiry explicitly mean unlimited. The generated compatibility contract remains available at
`/api/production-limits`; its source is `packages/production/src/contracts/studio-authorization.ts`.
Run contract generation to update the Python validator; do not edit that generated file directly.

Image checks run automatically. Final audiovisual model review is removed; the film is delivered
after rendering and full technical decoding of its video and audio streams. The crew corrects actionable issues and asks for
direction when corrections repeat without progress or reviews conflict. The browser exposes a
durable Stop after current operation action, real candidate history and consumption. A generated
image awaiting verification is retained and reviewed on resume without another generation.

Studio duration targets range from 30 to 300 seconds. Duration is an editorial target;
narration and rendering determine the delivered length.

Before deploying this version, install the same private `VOX_STUDIO_AUTHORIZATION_KEY` (at least
32 bytes) in Production and the Studio worker. Use a distinct key from the network, Run and image
grant keys. On the crew VM its root-only environment file is
`/mnt/disks/vox-crew/studio-operator/authorization.env`; `prepare_deployment.py` passes it only to
the worker. Install it through the existing trusted Production environment/secret delivery on
the Production host. Never put it in an API environment, image, public payload, shell argument,
log or repository file. Missing configuration leaves the user's choices saved and stops before
paid work. Deploy Production with protocol category version 4 before the new worker and API.

The September 8 rollout stores this dedicated key as Secret Manager secret
`VOX_STUDIO_AUTHORIZATION_KEY`, version 1, readable only by the Production and crew service
accounts through its secret-level bindings. `fetch-authorization-env.sh production|worker`
runs as root on the corresponding host and refuses to replace an existing file. It fetches
the value privately into the mounted disk: Production uses
`/mnt/disks/vox-runs/operator/studio/authorization.env`, the worker uses the path above.
Production's unit passes its separate file alongside the existing `service.env`; this preserves
the existing provider configuration and survives regeneration of that other environment file.
The API unit never receives this key. Provisioning a new version or rotating it requires a
coordinated update of both consumers.

The worker signs a Run/request-bound authorization, and Production records it with `run.authorize`
before paid preparation. Production retains image jobs and recording dispatches; the worker journal retains provider
consumption. Removing a ceiling never erases a receipt, resets consumption or replaces a Take.

Legacy operator admission remains available for Briefs saved without user-selected limits:

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
Studio automatically reviews images; earlier human decisions remain in the historical record.

After a worker crash, stop any supervisor restart loop before operator reconciliation:

```sh
python -m vox_crew.studio_worker reconcile --state /persistent/studio --crew-state /var/lib/vox-crew --config /etc/vox-crew/autonomous --job <submission-id>
```

This only queues unchanged, nonterminal checkpoints with no uncertain side effect after a
fresh signed snapshot comparison. It refuses unresolved renders, provider outcomes, terminal
blocks and changed ceilings. A refusal needs a diagnosis, not a new submission to reset spend.

For a worker crash with an unanswered `production.render`, inspect that same Run first.
If signed Production status confirms a completed render, the separate operator tool can adopt
its output without repeating render. Stop the worker and run the following in the operator
environment (mount the script read-only when using the worker image):

```sh
python deploy/studio/reconcile_render.py --state /persistent/studio --crew-state /var/lib/vox-crew --config /etc/vox-crew/autonomous --job <submission-id>
```

The default verifies and saves evidence only. Add `--apply` to archive the exact checkpoint
and journal, adopt the verified completion and queue technical delivery. Both executor locks
are held; all input artifacts, limits and authorization must match. The tool checks signed
status twice and fully decodes the digest-verified MP4. It refuses terminal blocks, unfinished
provider calls and changed Production inputs. It never sends a render or provider command.
If completion is still unknown, leave the job paused and observe the same Run.

## User correction and continuation

Completed but malformed model responses are recovered inside the worker before asking the
user to intervene. Preparation, composition substeps and media reviews share the signed
`maxTechnicalRepairs` total with PlanRepair. Each new repair is reserved durably before its
attempt; total provider calls and authorization expiry are checked again at dispatch. Parsing
and pre-plan shape checks run inside this boundary, so incomplete JSON and missing scene fills
cannot bypass recovery or become cached successes. Accepted steps, narration and media survive.
SDK transport retries remain disabled: uncertain calls, provider refusals, research dispatches,
image generation and recording do not acquire automatic retries from this mechanism.

The provider journal retains the finish reason, effective output cap and model version, plus
the existing public answer and usage counters. It never stores model thought content. Format
recovery uses a fresh role session with the original payload and validation feedback. SceneAuthor
and PlanRepair use the full published 65,536-token output capacity of the configured Gemini 3.5
or 3.6 Flash model from their first call, including retries carrying an older lower cap. This is
available capacity, not a target response length. Other ADK roles start at 8,192, and media review
starts at 4,096; malformed/truncated responses may grow to the configured model's published
capacity. Schema-only retries retain their existing cap. `model_output.py` owns the verified
model capacities; unrecognized model overrides retain the previous conservative defaults rather
than receiving an unverified maximum. Increasing capacity never changes the selected model or
extends user-selected attempt totals; tokens consumed per attempt may increase.

SceneAuthor writes one section per call, with a fresh session, the full immutable film structure,
the same selected capability specifications and exact earlier image requirements for continuity.
Each section has its own durable composition checkpoint. Missing, duplicate or out-of-section
scene fills cannot become successful checkpoints. All sections are assembled and validated
together before Production receives a plan. Format recovery repeats only the failed section;
PlanRepair still sees the complete plan and the specifications implicated by its findings.
Each section's initial call consumes the total provider-call allowance; retries additionally
consume the shared technical repair allowance. Studio reports section progress. Completed
sections survive safe continuations, and whole-film authoring checkpoints from earlier workers
are reused without generating those scenes again. A single-section film remains one author call.

An exhausted response recovery shows the failed public phase and saved-work message. Its
continuation needs no editorial instruction and requires remaining call and technical repair
allowances. Voluntary image, narration and visual revisions retain their separate controls.

For a historical diagnosed parser failure that predates automatic recovery, stop the worker
and inspect with the updated worker code and the operator environment:

```sh
python deploy/studio/reconcile_model_response.py --state /var/lib/vox-studio --crew-state /var/lib/vox-crew --job <submission-id>
```

The default archives checkpoint/journal evidence without changing production or queue state.
It verifies the saved request, exact pending failure, public-response replay (or recorded
recovery evidence), answered provider dispatches, remaining limits, existing unexpired signed
authorization and fresh matching Production status. `--apply` adopts that verified recovery
and queues the same Run. The next attempt consumes a technical repair. No authorization,
counter, accepted artifact, model pin or provider journal entry is replaced. Both executor locks
are held, and interrupted queueing after checkpoint adoption can finish idempotently. Deploy
the corrected worker before applying this recovery; the old worker does not understand it.

For a blocked or safely interrupted live Studio Run, the film page presents a guided decision.
The latest rejected image appears beside its proposed correction. **Add your direction** can
replace the suggestion; the full review and earlier versions remain available in details.
The API projects the minimum totals needed for the selected next action. An exhausted allowance
appears before submission with an explicit **Allow +N** control. This changes the form only;
**Authorize changes and continue** saves the exact correction and selected totals together.
These minima permit the next attempt, not a guaranteed complete film. Advanced limits and the
complete consumption table remain accessible. Saved continuation requests show acknowledgment
and queue status, including after refresh. The existing Take and unaffected approved images
remain bound to the same Run.

The September 9 image adapter uses stable **Gemini 3 Pro Image (`gemini-3-pro-image`) at 2K**
through the existing cloud identity and global region. This prioritizes instruction-following
quality; image counts are not monetary cost ceilings. Studio corrections now supply the rejected
image pixels as an editing reference. The optional `sourceCandidateSha256` participates in the
exact request digest; Production resolves and verifies the source from a rejected candidate of
the same identity and Run before a counted dispatch. Requests without a source retain their old
digest format. No arbitrary URL or caller-supplied image bytes cross this public boundary.
The media reviewer checks the current intention, treats actual renderer annotations separately,
and blocks material explanatory defects rather than minor aesthetic preferences. Human image
approval and final audiovisual review remain required. Model quality still needs live evaluation.

`POST /api/jobs/{id}/resume` persists the checkpoint digest, correction and selected limits with
an idempotency key. The worker archives checkpoint/journal bytes under `work/<id>/continuations/`
before installing the Production authorization and applying the correction. It preserves the
previous terminal in `userCorrections`. A pending decision survives worker restart; **Retry saved
correction** queues verification of that same decision through `/retry-continuation`. It cannot
be replaced while its outcome is unresolved. Browser retries after a lost response reuse the
saved payload/key, including after refresh.

Uncertain Production commands or provider outcomes remain refused. The existing render
reconciliation tool retains its narrower contract. A larger budget never bypasses image review
or final audiovisual review, nor does it permit changing recorded narration through a visual
correction. Expired authorizations stop further counted provider calls until the user confirms
a new authorization. The old operator envelopes and all provider journal entries remain intact.

The September 8 render-crash test override has been retired. Its preserved copy is
`/mnt/disks/vox-crew/studio-operator/rehearsal-retired-20260908/rehearsal.conf`; the normal worker
unit was restored without requeueing a run. Before a future hosted trial, check current
`DropInPaths` and process state again rather than assuming this historical observation is current.

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
The pending submission payload and idempotency key survive a lost admission response and refresh
in the same tab; successful admission or explicit logout clears them. An initial connection
failure exposes an explicit retry. Browser tests exercise both failures through the real API.
Run `python -m pytest services/agents/tests/test_studio.py services/agents/tests/test_studio_continuation.py services/agents/tests/test_studio_render_recovery.py services/agents/tests/test_autonomous.py`
from the repository root for admission, worker locks, media ranges, human decisions and existing
autonomous regression coverage. These checks do not dispatch providers.

`pnpm exec vitest run packages/production/tests/studio-authorization.test.ts` exercises signed
authorization, quota extension and image ceilings in the real Production service and ledger.
`pnpm --filter @vox/production contracts:check` checks the published contracts and generated
Python limits validator. Browser tests include selected limits, detailed rejections and a lost
continuation response followed by refresh. These local proofs do not claim a hosted accepted film.

For hosted playback, download, refresh, reconnection and logout evidence:

```sh
node deploy/studio/rehearse.cjs https://vox-studio-164544259455.europe-west1.run.app <job-id> <output-directory>
```

This uses the ignored local access-code file under `.scratch/hackathon-launch/runtime/studio/`
and installed Edge (`VOX_TEST_BROWSER` selects another channel). Install Playwright's FFmpeg
helper if browser recording is unavailable. The runner saves screenshots, three digest-verified
downloads, JSON assertions and a browser recording started after authentication. It does not
authorize work or submit image decisions. A rehearsal of a blocked preview retains that label.

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

The proxy accepts cleartext HTTP/2 (`http2 on`), and its Cloud Run service must be
deployed with `--use-http2` (container port name `h2c`). Both settings are required
for films over Cloud Run's 32 MiB fixed-length HTTP/1 response limit. The internal
API connection remains HTTP/1.1 with response buffering disabled. Preserve `Content-Range`,
`Accept-Ranges`, cookies and private cache headers; seeking and downloads use the
same authenticated media endpoint. A file passing technical decoding does not prove
its complete delivery through the edge. Verify an actual >32 MiB playback and full
download after proxy changes. `proxy/test_streaming.py` exercises the real nginx
container with synthetic large HTTP/2 responses, byte ranges, HEAD and authentication.
See [Cloud Run networking limits](https://docs.cloud.google.com/run/quotas#networking_limits_for_cloud_run).

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


## Independent images and production progress

ADK 2.7.1 schedules one durable pipeline per image identity. The worker image includes its
`db` extra; persist `image-workflow.sqlite3`, `image-pipelines/`, and the existing crew checkpoint
and journals together. `VOX_IMAGE_CONCURRENCY=2` and `VOX_IMAGE_REVIEW_CONCURRENCY=2` independently
bound active generations and reviews (valid range 1?16). Neither setting limits total spending.
Do not share per-image model contexts or one pending-operation slot across concurrent images.

A worker restart leaves interrupted films available for explicit Resume. Resume first reads
saved child checkpoints, completed model answers and signed Production image jobs. It preserves
accepted candidates and refuses a new dispatch if an earlier outcome remains unknown. A Stop
request prevents new operations, including queued generation/review calls; already dispatched
calls are allowed to save their outcome. Do not terminate a worker during paid work to deploy.

The UI displays independent image phases, accepted/required counts, saved timestamps, and
measured rendered/encoded frame counts. `run.progress` is a signed, read-only observation with
a short client timeout; an absent observation does not mean success. Polling failure never
retries render. The final `ready` state means accepted required images and a hash-verified,
fully decoded video/audio file. It must not be relabelled as audiovisual `reviewed`.

Production builds `VOX_REMOTION_BUNDLE=/app/.render-bundle` in the Docker source layer. Never
reuse this artifact with different source or dependencies; no Run media belongs in it. Each
render copies the immutable bundle and installs its own voiceover. `VOX_RENDER_CONCURRENCY`
optionally sets renderer workers; leave it unset until measured for the available CPU and memory.
`VOX_PROFILE_PRODUCTION=1` emits numeric receipt verification and render phase timings to stderr.
Historical inline-image receipts remain verifiable and are not rewritten during deployment.

See [the decision](../../docs/adr/0026-independent-image-work-and-technical-film-delivery.md).
