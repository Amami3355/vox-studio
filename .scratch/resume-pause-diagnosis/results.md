# Relativity film: repeated Resume pauses — September 9, 2026

Submission: `22f01237-b95e-4ffa-a3f3-bca4331192fa` (180-second target).
Production Run: `ca79d231-9cb8-4f9a-8e61-f2b3572beacc`.

## Observed cause

All spending ceilings are null. Narration and four of five required illustrations
are saved. `spacetime-fabric` has two answered ImageCreator calls, zero image
generation calls, and no uncertain provider result.

Both answers assign `/props/assetRequirement` to `rendererElements`. The normal
image-intention adapter rejects this: the asset requirement describes a bitmap
request and cannot stand in for an actual renderer overlay. Repeating the same
validation error activates the no-progress response-repair guard. This is not an
image-count or spending ceiling.

On the first explicit continuation, `reconcile_image_step` validated only the raw
V3 JSON schema. It skipped `resolve_renderer_elements`, cached the invalid answer
as a completed `image_intent`, and cleared pending. Subsequent continuations
reused that cache and failed the downstream, normalized intention contract without
another model call. Four observed attempts at 08:22–08:23 UTC repeat this behavior.

The displayed “10 image generations saved” counts image dispatch attempts, including
six temporary provider failures. Four image candidates were generated and approved.
The final public event's phase can follow the last parallel branch to finish; the
branch checkpoint identifies the actual failure at image intention.

## Local correction

- Recover answered image intentions through the same semantic validation and
  renderer-reference normalization as the live adapter; preserve legacy V2 results.
- Keep answered but unusable model responses as repairable failures, preserving
  their journal evidence. Read-only reconciliation never dispatches a model.
- Repair the old raw cache only when its exact bytes match the answered operation
  in the image's own journal. Remove the invalid projected cache as well.
- Keep unknown provider outcomes blocked and reject known failed provider responses.
- Tell ImageCreator explicitly that assetRequirement is not an overlay and that
  an empty rendererElements array is permitted.
- Display the pause reason alongside Resume and distinguish saved images from
  generation attempts.

## Verification and limits

The two end-to-end regression variants failed before the fix (initial failure and
the already poisoned cache). Both now complete through the real ADK workflow with
deterministic providers, preserving the recording and dispatching one image once.
Three additional cases verify normal and historical answer normalization.

The ten image-workflow cases pass, including overlapping generation/review,
unknown-response refusal, answered-review recovery, generation recovery and Stop.
The focused Python suite covering autonomous production, model recovery,
unlimited Studio and continuation passes. Studio typechecking/build and three
existing browser tests for correction/resume pass.

The actual captured production checkpoint also passes a local reconciliation replay:
the invalid cache is removed, repair remains pending, and the provider journal is
byte-for-byte unchanged. See `actual-checkpoint-replay.json`.

During diagnosis, no live checkpoint was edited, no service was restarted, and no
paid production was dispatched. Deployment was subsequently authorized and completed
as recorded below. Real model acceptance and completion of this film remain unverified.

## Deployment

The user authorized deployment on September 9. The worker and API were patched from
the exact previously deployed immutable images, retaining all dependencies and
execution settings. All 49 Python source files in each image were verified against
the prior source manifest plus the three corrected modules. Production was unchanged.

The guarded installation found no active films, backed up the service configuration
and Studio database, and preserved all 46 checkpoint/journal/workflow files by hash.
All five saved film statuses were unchanged. Updated boot metadata matches the
installed service configuration.

The first live browser check caught the pause-reason text in an unreachable UI
branch. Its placement was corrected and an assertion was added to the existing
resume browser test. Typechecking, build and that test passed. The final API update
installed this UI correction without restarting the worker again.

Final revision: `7d87243ebbe7a28f` (source/artifact digest, not a Git commit).
The worker retains revision `70089a97acb7b3c8`; its Python correction did not change
during the final UI adjustment. Immutable image references are in
`deployment/images.json`.

The deployed worker passes reconciliation of a temporary copy of the actual blocked
image, with the original checkpoint and provider journal unchanged and zero new
provider calls. Desktop/mobile browser checks verify the visible pause reason,
corrected “4 images saved · 10 generation attempts” count, enabled Resume button,
refresh persistence, and absence of overflow or JavaScript errors.

The existing film remains paused for its user's explicit Continue production action.
Its narration and four approved illustrations are preserved. See
`deployment/runtime-verification.json`, `deployment/browser-verification.json`, and
`deployment/deployment-verification.json` (initial service rollout; final API digest
is recorded in `deployment/images.json`).

Private diagnostic captures under this directory are operational evidence; do not
copy full checkpoint or journal contents into public logs or documentation.
