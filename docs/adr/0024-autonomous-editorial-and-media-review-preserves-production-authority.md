# Autonomous editorial and media review preserves Production authority

**Status:** accepted · 2026-09-08, implementing the autonomous prompt-to-film plan.

The original prompt and its interpreted Editorial brief are separate persistent values.
Operator configuration supplies voice, authorization and ceilings. New prompt submissions use
checkpoint version 2; existing manual/recorded runs and version 1 checkpoints retain their
historical workflow. They are not migrated into fresh autonomous attempts.

This extends ADR-0023: the Director now judges coverage, Narrative and composition and returns
structured decisions. Two correction cycles are shared between Narrative and composition before
recording. Supplementary research has its own ceiling of four searches; technical PlanRepair
retains its one-call budget shared across every draft and Production refusal. No source or claim
count stands in for explanatory adequacy. Uncited provider prose is saved separately for extraction
diagnosis and never promoted to supported evidence. Internal model reasoning is not persisted.

The Narrative hook describes editorial intent. All speech, including the opening, is in the ordered
Beats. Nothing is appended by TTS. Once recorded, changed speech or segmentation blocks the run.

This explicitly supersedes the old ImageCreator restriction to `needsImage` for version 2:
ImageCreator authors a structured composition intention, including actual crops and renderer
elements. Code adds trusted palettes and published provider constraints and hashes the exact
request. Production compilation remains the only source of asset needs and identities. A
multimodal reviewer inspects verified candidate bytes and motivates acceptance/rejection. At most
two corrections retain the same identity; rejected and failed calls count toward five generations.

Model acceptance is now permitted in this explicitly autonomous workflow. Production still checks
the exact candidate digest. An accepted image can be withdrawn only by naming its exact digest and
a reason. This preserves jobs and spend and invalidates dependent compilation/render bindings.
Legacy pending-candidate rejection remains valid. Failed or uncertain dispatches are not retries.

Image spend is authorized by an operator-installed envelope for an exact Production request and
one Run. Production issues and durably reuses signed request-bound grants internally, with a
persistent ceiling. Envelopes cannot be rebound or increased after use. Without an envelope, the
existing explicit-grant path applies. No signer or secret crosses into the crew.

The deterministic sequence is validation, Preflight, one Take, requirement compilation, image
generation/review, final compilation, render and audiovisual review. An unresolved required
placeholder cannot pass final delivery. FFmpeg decodes the original MP4 and creates a smaller
audio-preserving inspection copy; both hashes bind the review. One post-render visual correction
can produce a second review, preserving the Take. A narration change, impossible inspection or
persistent rejection yields an explicit blocked outcome. Model review and final human judgement
remain separate.

Every V2 action persists its intent before dispatch and its result afterward. Resume compares the
Production snapshot before any new work; an interrupted action or changed authority state blocks
for reconciliation. ProviderJournal counts model, grounded research, image and recording dispatch
attempts together under the total ceiling of 40. Production's own ledger remains authoritative
for actual image jobs and Takes. No repair or restart resets either accounting source.

Composition roles have separate cached responses within the parent composition checkpoint.
V2 may normalize an exact echo of `component` or `spansBeats` in a scene fill after comparing
it with the Structurer's slot; any difference is refused. The historical fill adapter remains
strict. Technical repair consumption is saved before dispatch, and its response before assembly.
ADK dispatch receipts retain public answer parts while excluding thought parts. A lost response
from an earlier image does not entitle a Run to another repair or a reset counter.

The renderer and scene catalog are unchanged by this decision.

## Unambiguous published anchor repairs — 2026-09-08

A new cloud trial spent its one PlanRepair call shortening image subjects, then stopped on
`DEICTIC_ANCHOR_REQUIRED`: an emphasis naming "longer path" was attached to "travel". Production
offered "longer" and "path"; only "path" preserved the preceding event's position. V2 may now
apply a single such published repair without a model call when exactly one offered Word anchor
preserves the entire SceneInstance's authored event order. It uses actual Beat word order,
never fabricated timing. Multiple errors, ambiguous words, multiple viable answers, and boundary
offsets requiring a Take remain with PlanRepair or block when its allowance is consumed.

This extends the deterministic normalization already allowed for structural echoes. It changes
only the refused event's anchor, saves the complete refusal and before/after plan hashes, and
returns through Production validation, Preflight and compilation. Production retains authority;
the crew does not implement or weaken the deictic check. The one-call PlanRepair allowance and
all other ceilings remain unchanged. ADR-0012's published `expected` list supplies the choices;
the correction never invents a fourth source of accepted anchors. Existing blocked checkpoints
require an explicit, archived reconciliation proving no pending provider dispatch and an unchanged
signed Production snapshot before resumption. No manual storyboard edit or counter reset is used.

## Explicit image recovery authorization — 2026-09-08

The same trial later received a confirmed HTTP 429 on its third image attempt. The operator
explicitly authorized eight total image attempts for this Run. Its original request and five-image
envelope remain immutable. A separate operator-mounted policy binds the original request digest,
Run, eight-attempt total, authorization/expiry times, a minimum 60-second interval and HTTP 429 only.
Production freezes the policy on first use and exposes its effective allowance and next dispatch
time through signed status. Every original job and grant remains counted. The 40-call ceiling,
four searches, one Take and correction limits are unchanged.

An explicit `retryOf` must name the latest confirmed HTTP 429 job for the same identity and exact
provider request. It receives a distinct durable job and grant; replaying that retry reuses its job.
Ordinary observation never retries. Unknown transport outcomes and other failures still block.
Production enforces pacing; the worker waits before opening a dispatch receipt. Consecutive 429s
double the delay up to eight intervals. This follows Google's guidance to smooth traffic and use
exponential backoff; HTTP 429 alone does not prove that prepaid credits were exhausted.

Adopting this policy on the blocked checkpoint requires an archived reconciliation comparing the
signed Production snapshot, all responded calls, and the three consumed image attempts. Only the
approved policy may differ. The storyboard, Take, baseline limits and journals remain unchanged.
