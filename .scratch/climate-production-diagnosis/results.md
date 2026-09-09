# Climate film: continuation repeats out-of-section authoring

Diagnosed September 9, 2026. Studio submission `d44dd605-2dbd-4d62-82f2-9f8a10ccc58c`,
Production Run `cb2477ec-1c54-4b88-ae37-7f3fc903cb9f`.

## Observed failure

The film is blocked during authoring of section 1 of 3. The saved structure assigns
`scene-1` and `scene-2` to that section, `scene-3` and `scene-4` to the second, and
`scene-5` through `scene-7` to the third. All four answered SceneAuthor calls return
all seven scenes. Each response finishes with STOP, at the configured 65,536-token
capacity; this is not a truncated response or an uncertain provider operation.

The initial author call and automatic repair fail at 09:36–09:37 UTC. Both user
continuations were applied; their new author calls fail again at 09:38:01 and
09:46:17 UTC. The saved error is `Scene Author must return exactly the structured
scene ids.` The repair feedback repeats that sentence without expected, missing
or unexpected IDs. Repeating the same recovery context triggers the no-progress
guard. The terminal message hides the concrete scene mismatch, while Studio offers
only `continue` with a message that recovery needs direction. That continuation
retries the same scope and feedback without supplying a new correction strategy.

## Evidence and boundaries

The local replay parses each real saved answer and calls the real
`SplitVisualPlanner._assemble` twice for the first section and twice for the whole
structure. All eight section checks reproduce the exact error; all eight whole-film
assembly checks accept the IDs. This tests structure assembly only, not capability
validation, compilation, editorial quality or renderability. See ignored `replay.json`.

The planner passes one section as `structure` and the whole film as continuity
context. The adapter already instructs the model to return only the scoped slots.
The observed outputs violate that distinction; the evidence does not establish
the model's internal reason for doing so. Validation correctly rejects the extra
scenes. The recovery feedback is insufficiently specific to correct this pattern.

Research, written narration and visual structure are saved. Recorded consumption:
11 provider calls, one search, zero image generations, zero audio recordings,
no uncertain provider outcome. Private checkpoint and response captures remain
ignored under `captured/`; do not publish their raw contents.

## Correction

The user subsequently authorized correction, redeployment and a sub-agent audit.
SceneAuthor now receives the exact required IDs as explicit output scope, while
retaining full-film continuity context. Scope validation reports expected, missing,
unexpected and duplicate IDs to repair, with a separate safe user-facing reason.
Only completed valid sections become reusable checkpoints.

Repeated response repairs now retain their strategy version as a terminal marker.
Studio refuses an identical continuation after that strategy has stalled; an
updated strategy can retry the saved step. Historical model-response pauses,
including this film, remain eligible for the improved repair. Finite historical
allowance failures remain distinct from a repeated no-progress failure.

The independent audit found and fixed image-intention compilation after cache,
malformed narrative evidence gaps cached outside recovery, and stale narrative
evidence-gap answers after research with an unchanged merged dossier. Settled
rejected images now offer a real direction change. Cached image reviews requiring
intervention no longer masquerade as outstanding verification. When parallel
images fail, intervention errors cannot be hidden behind an earlier ordinary
failure. See `repeated-blocks-audit.md` and the dedicated regression tests.

The pause reason is visible outside the correction form, including when no
continuation is available. Browser verification covers desktop/mobile, refresh,
the unavailable-action explanation and the historical resumable recovery path.

The initial diagnosis was read-only. Deployment and live continuation evidence
is recorded below; diagnostic captures remain private.

## Validation and deployment

The integrated Python suite passes 774 tests with one skip. The full browser suite
initially passed nine cases and exposed an incorrect test interception in the new
case; replacing that interception with a real test-server checkpoint made the new
case and existing response recovery pass. Both were rerun after the final semantic
status markup and pass on desktop/mobile with refresh. Studio typechecking, build,
targeted Biome checks and whitespace checks pass.

The first complete Python run also exposed an outdated glossary compatibility
expectation (the already published Image review and Ready film terms) and a Windows
temporary-path limit. The glossary expectation now includes those declared domain
additions. The complete successful run used the short `C:/vox-climate-suite` temporary
root; no production behavior was changed to work around the path limit.

Revision `f7031eb52f3be833` is a source/artifact digest, not a Git commit. Both images
derive from the exact previously observed immutable worker/API images, preserving
their dependencies and execution configuration. All 49 Python source files in each
image and the current frontend bundle were verified; both image scans pass.
Immutable image references and manifests are in ignored `deployment/` evidence.

The guarded rollout verified no active productions, backed up service configuration
and Studio data, and preserved all 48 checkpoint/journal/workflow files by hash.
All six film statuses were unchanged during installation. Installed worker/API
sources, frontend assets and persistent boot metadata match the verified release.
The public desktop/mobile workspace loads without JavaScript errors or overflow.

## Real film continuation

One continuation of this same film was submitted through the authenticated public
Studio API after runtime verification. Its request and idempotency key are saved
privately. No other film was resumed.

The formerly failing section completed, followed by sections 2 and 3. Saved author
results contain exactly the expected IDs: two scenes, two scenes, and three scenes
respectively. The saved narrative, research dossier and visual bible are identical
to the diagnosis capture. At 10:23:28 UTC the same Run had reached production with
15 provider calls, no uncertain provider outcome, and no repeated research.
See `deployment/live-run-verification.json` and the public continuation/browser
evidence.

The same Run reached `ready` at 10:43:59 UTC on September 9. All five required
illustrations have one accepted candidate each. One narration take and one research
call were retained; no editorial work was replaced. Image generation needed 18
attempts, including 13 transient provider failures handled by the existing recovery.
Final usage is 49 calls, 18 image attempts, one search, one take, with no uncertain
outcome. Rendering itself took 862 seconds; full media validation completed next.

The final authenticated public browser check confirms desktop/mobile rendering,
refresh, advancing playback, seeking near the end, and downloading the entire
49,755,758-byte MP4. Its 149.077-second video has SHA-256
`f69ab77fb7f369782aa1805af9673b725f725efb53370b2988729e00c67f68fa`, matching
both the published descriptor and Production's fully decoded verification. No
JavaScript errors or horizontal overflow occurred. Evidence is in
`deployment/live-browser-verification.json` and `deployment/live-run-verification.json`.

The last transport audit found a separate risk: Production's deployed socket used
the 15-minute fallback although the crew waits 30 minutes. The cloud unit now
explicitly configures 1,800,000 milliseconds, with a deployment contract check
against the client timeout. This removes the premature 15-minute cutoff; it does
not guarantee completion of arbitrarily long synchronous renders. Commands that
outlast the client's 30-minute window still need reconciliation rather than blind
redispatch. The guarded configuration rollout preserved all six film statuses,
retained the exact Production image, verified the listening socket and actual
container setting, and verified persistent boot metadata. Evidence is saved in
`deployment/production-timeout-verification.json`. All 43 socket/cloud/network
tests, 10 deployment rendering tests and the deployment contract checks pass.
The first configuration attempt stopped before mutation because this VM's process
listing rejected optional flags; the plain supported listing passed the guard.
The complete public browser playback/seek/download check passed again after this
configuration rollout, with the same film timestamp, usage and video hash.
