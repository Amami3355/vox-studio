# User corrections and Production limits

Local implementation completed on September 8, 2026, on `feat/adk-production-crew`.
At the time of implementation, the feature had **not been deployed**. The later
[hosted rollout](studio-limits-deployment-2026-09-08.md) now makes it available. No new paid Run
or image decision was submitted in either session.
The earlier [image rejection diagnosis](studio-image-rejections-2026-09-08.md) remains the
reference for the blocked hosted Run; this record does not claim that its images or film pass review.

## Implemented behavior

- The user selects total provider calls, searches, image generations, narration recordings,
  and image/editorial/film/technical correction limits when submitting a Brief. A saved legacy
  Brief can also be explicitly authorized with these limits. Defaults retain the historical
  40 calls, four searches, five images and one Take; they are editable.
- Studio shows detailed rejection observations, consumption and remaining authorization.
  A correction targets an eligible image or work phase; the worker preserves reusable work,
  previous decisions and consumption. Image/visual correction preserves the existing Take.
- The API durably saves the exact correction, checkpoint digest, limits and idempotency key.
  Browser response-loss retries survive refresh. Interrupted saved decisions have a retry path.
  The original Brief is retained rather than silently replaced by the continuation request.
- The worker archives checkpoint and provider-journal bytes before adoption, revalidates both
  local and signed Production state, and obtains a scoped, expiring authorization in the same
  Run receipt chain. Limits may increase; prior consumption and image grants are retained.
  The API and browser never receive the signing key. The Python limits validator is generated
  from the same Zod contract published by Production (protocol version 4).
- Uncertain provider outcomes, changed checkpoints and stale candidates refuse continuation.
  A lost authorization response and a crash after checkpoint adoption reconcile the same decision.
  Expiry prevents further counted provider calls. Increasing limits never accepts a rejected image.
- The user's image correction reaches both the authoring payload and the provider request.
  Bitmap instructions are separated from renderer annotations, which must resolve to real
  scene properties or events. Repeating a previously rejected request stops before another dispatch.

The public contract, ownership and deployment order are documented in `CONTEXT.md`,
[ADR-0025](../../../docs/adr/0025-studio-admission-is-durable-and-separate-from-production-authority.md)
and the [Studio runbook](../../../deploy/studio/README.md).

## Validation without providers

- The combined Studio, autonomous, continuation and render-recovery Python suite passed
  **67 tests**. After the final legacy-start projection and refusal-message changes, the
  continuation suite passed **15 tests**, including its newly added legacy-start test.
  Existing test-client/SDK deprecation warnings are not test failures.
- Production checks passed **74 distinct tests across targeted runs**: Studio authorization
  (3), public contracts (11), payload surface (19), Run store (5), service configuration (13),
  image commands (19) and replacement grants (4). The real service and ledger exercise image
  ceilings, extensions preserving consumption, signature/scope/expiry checks and exact replay.
- **Six browser tests** passed through a disposable authenticated API workspace: admission,
  refresh/private media, lost responses, connection retry, selected limits and detailed correction
  followed by response loss and refresh. No worker or provider executes in that fixture.
- Studio build, Studio/Production type checks, generated-contract consistency, targeted Biome
  checks, deployment contract checks and `git diff --check` passed.

The continuation tests run the real autonomous state machine with fake provider roles and
Production adapters. They preserve the recorded Take, the separately accepted image, rejected
candidate history and the exact prior provider journal. They establish local behavior, not the
quality of a newly generated bitmap or acceptance of a hosted film.

## Hosted test-harness retirement

Before removal, the targeted render-crash override was inspected and its SHA-256 verified:
`25149399594a8101a977c56c17d89f915ef4ef2df0f1e4034e1fb423d532fb95`.
The Studio database reported no queued, running or image-waiting jobs. The worker was stopped,
the exact override and unit configuration archived, the override removed, systemd reloaded,
and the original pinned worker restarted. The resulting unit had empty `DropInPaths`,
`ActiveState=active`, `SubState=running`, and MainPID 23798 at observation time.

Preserved remote evidence:
`/mnt/disks/vox-crew/studio-operator/rehearsal-retired-20260908/`
contains `rehearsal.conf`, `unit-before.txt` and `unit-after.txt`.
The ignored local retirement script and before/after API observations are under
`.scratch/hackathon-launch/runtime/` (`retire-rehearsal-20260908.sh`,
`studio-continuation-before.json`, `studio-continuation-after.json`).

Both API observations retained job `b68869a4-e436-43b2-8985-a57ca8f7455f` as blocked,
with 14 sources, four images, no pending image decision and no MP4. Nothing was requeued.
This supersedes the earlier rehearsal report's temporary-override state; it does not prove
the unexercised render-disconnect scenario.

## Remaining hosted evidence

Deploy Production protocol 4 and provision the dedicated worker/Production authorization key
as described in the runbook, then deploy the matching worker and API/frontend. A future
explicit user correction may resume the existing blocked Run with the user's selected totals;
its original consumption, rejected candidates, accepted first image and Take must remain.

No additional paid trial is authorized by this implementation record. Complete-film acceptance,
actual render-disconnect evidence, SceneCapability/catalog improvements, final voice work and
release rehearsal remain open in the [delivery route](../route.md).
