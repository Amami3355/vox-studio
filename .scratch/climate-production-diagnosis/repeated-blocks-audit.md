# Audit of repeated production blocks

September 9, 2026. Independent audit of the recovery, checkpoint and continuation
paths, alongside the primary climate SceneAuthor correction. No provider calls or
production mutations were used for this audit; reproductions use real execution
code with deterministic provider fixtures.

## Corrected: image intentions cached before request validation (high)

`autonomous.py:image_requirement` previously saved an `image_intent` result before
`compile_intent` checked the final provider prompt's 4,000-character limit. A valid
JSON intention with a 4,100-character arrangement failed after checkpoint success.
Calling the same workflow again reused that intention: two failures, one model
call, no recovery context, and no possible progress from Continue.

Compilation now validates the intention inside the model step before checkpoint
success. Feedback gives the available serialized intention length after fixed
request text, allowing the response repair to shorten the answer. This allowance
is stable across oversized answers so different answer lengths do not bypass the
no-progress guard.

Existing invalid caches are checked against the real compiler on reuse. Only an
exact, answered ImageCreator operation with matching normalized response and no
unknown provider outcomes can retire the cache. The old entry and diagnostic are
archived in the checkpoint, original journal rows remain unchanged, and repair
uses the normal shared allowance. A reconciled answer follows the same validation
on continuation; reconciliation itself never dispatches providers.

Regression evidence: `test_image_intent_length_recovery.py` covers automatic
repair through technical delivery with one recording and one image generation,
repair of the proved historical cache, and preservation without dispatch when
the provider answer is unknown.

## Corrected: malformed narrative evidence gaps cached as success (medium)

`autonomous.py:prepare` previously validated the `insufficientEvidence` variant
after the narrative checkpoint. Complete answers containing an empty array, a
string, null, empty items or non-string items therefore blocked outside response
recovery. The malformed answer remained cached.

New responses validate this variant inside the narrative model step, including
its exclusive top-level key. Malformed gaps receive the normal response repair;
valid specific gaps still request additional research.

## Corrected: repeated research replays stale evidence-gap response (high)

The valid-gap regression also reproduced a separate checkpoint error: a follow-up
search can leave the merged dossier identical after citation deduplication. The
narrative dependencies then remained identical and replayed the earlier
`insufficientEvidence` response without consulting the narrator again. The crew
continued researching despite an accepted Coverage review.

After the first search, the narrative checkpoint identity includes the completed
research revision. The first-search identity remains compatible with existing
work. `test_narrative_gap_recovery.py` covers five malformed variants, plus a valid
gap followed by an unchanged merged dossier: two searches and two narrator turns,
with zero technical repairs for the valid-gap case.

## Continuation findings handed to the coordinating agent

- The early image-workflow continuation branch hid image correction choices even
  after repeated rejected candidates and a progress review requesting user input.
  Parent `images` history already contains these rejected candidates; the branch
  should permit explicit image direction once provider operations are settled.
- A known image review with `inspectionPossible=false` or
  `requiresNarrationChange=true` is cached and stops before adding reviewed image
  history. Two workflow attempts reproduce the same block with one image call
  and one review call. Continue misleadingly described that candidate as still
  awaiting verification. The underlying stop is justified; the continuation
  projection must explain the incompatible review and avoid replaying it as if
  another identical attempt could help. Detection must match the current
  candidate digest, not an unrelated historical review.

## Boundaries

The final integration review reproduced an additional aggregation bug in the
real ADK image workflow. When two images failed, `failures[0]` could select an
ordinary earlier failure and discard a later `ImageReviewNeedsAction` or
`ModelRecoveryStalled` classification. Studio then offered Continue despite that
known non-repeatable failure. The workflow now prioritizes those intervention
errors after all branches settle. Four regression cases cover both error classes
with either an ordinary first failure or a first provider operation whose result
remains unknown. Unknown journal outcomes and dispatch counts remain unchanged,
and every case refuses continuation.

Unknown provider outcomes, mismatched Production snapshots, conflicting candidate
decisions and narration changes after recording remain explicit stops. This
audit does not authorize duplicate image generation or replacement narration.
No claim is made that arbitrary model output will always satisfy the contract.

The new narrative validation prevents newly cached malformed gap responses; it
does not bulk-migrate historical narrative caches. The climate run has a saved
valid narrative and is unaffected by that limitation. Image cache recovery is
deliberately narrower: absent exact answered evidence it preserves the checkpoint
and stops, leaving reconciliation to an operator.

Validation observed before final integration: 66 tests passed across image
workflow, image intent length recovery, autonomous execution and model recovery;
the six narrative gap regressions then passed. The coordinating agent owns the
full integrated suite and deployment verification.

The coordinating agent fixed both continuation findings and deployed them with the
cache and workflow corrections. The integrated suite passed 774 tests with one
skip. The original climate film completed after a single explicit continuation;
public playback, seeking and the complete download were verified. See `results.md`
for final deployment evidence and the additional transport timeout finding.
