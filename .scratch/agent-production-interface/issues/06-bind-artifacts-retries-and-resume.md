# Bind artifacts, retries and resume

Type: grilling
Status: resolved
Blocked by: 02, 04

## Question

What state machine makes `record`, `compile` and `render` safe to repeat after success or
partial failure? Decide:

- exact artifact ownership and paths, and overwrite refusal;
- how an **uncommitted run take remains load-bearing**;
- verification at every consumer boundary, not only at the producer;
- freshness and hash checks, and when a verified take is reused;
- what counts as an authorised replacement, under the recording-input model;
- persistence and later reopening of the run directory, and crash recovery;
- which repairs preserve a take and which invalidate it;
- how `run.json` binds the plan, production configuration, take, compiled document, report
  and preview — preserving the `placeholder` / `failed` distinction so a broken asset cannot
  masquerade as a merely pending one.

It decides the repair rules and the guarantees. It does **not** decide their delivery channel:
publication is registered through
[Define the authoring-knowledge frame](01-define-the-authoring-knowledge-frame.md), and
[Decide the published contract artifacts](07-decide-the-published-contract-artifacts.md)
owns how accumulated knowledge becomes agent-readable artifacts.

**A Git commit is one persistence mechanism for shipped takes, not the definition of take
integrity.** In this repository a take is committed and a standing test holds the mp3 against
its manifest; in an isolated run neither exists. Hashes, verification at every boundary and
the final receipt must carry the standing guarantee instead.

Blocked by
[Decide the code-blind production boundary](04-decide-the-code-blind-production-boundary.md)
because artifact ownership reads differently if the agent never holds the artifacts.

## Resolved when

Every artifact has an owner, a verification point and a defined behaviour on repeat, and the
take-preserving repair rule is stated precisely enough to be published.

## Comments

### Grilling round 1 — artifact topology and identity primitives

The repository already proves two useful facts. A Take's audio and alignment are independently
SHA-256 verified at the consumer boundary, and its short `takeId` derives from both hashes;
TimedBeats are a pure fold of alignment plus plan text. The current script nevertheless writes
four hardcoded repository paths non-atomically, binds only `planId` and voice id, and relies on
Git plus a standing test for persistence. An isolated Run needs the same guarantee without
either mechanism.

The open frontier is:

1. reserve this exact agent-readable Run layout, with every service-authored artifact immutable
   after publication:

   ```text
   run.json
   inputs/request.json
   inputs/plans/<planSha256>.json
   artifacts/validation/<validationInputSha256>/report.json
   artifacts/preflight/<preflightInputSha256>/report.json
   artifacts/takes/<takeSha256>/audio.mp3
   artifacts/takes/<takeSha256>/alignment.json
   artifacts/takes/<takeSha256>/timed-beats.json
   artifacts/takes/<takeSha256>/take.json
   artifacts/compilations/<compileInputSha256>/document.json
   artifacts/compilations/<compileInputSha256>/report.json
   artifacts/renders/<renderInputSha256>/preview.mp4
   receipts/<20-digit-sequence>-<command>.json
   ```

   The agent owns its working `plan.json`, wherever it chooses beneath or outside the Run; the
   service reads but never edits it. On green validation the service publishes an immutable
   canonical snapshot under `inputs/plans`. The service owns every reserved path above, but
   distrusts it on every later read because the Run remains agent-writable. Publication builds
   in private service temporary storage and atomically creates the final path. An existing path
   with verified identical bytes is reused; an existing mismatching path is an integrity error
   and is never overwritten. Receipts are append-only and `run.json` is the only replaceable
   service file, updated atomically;
2. use SHA-256 with two explicit domains. A persisted artifact's descriptor hashes its exact
   bytes. A semantic JSON identity hashes RFC 8785 canonical UTF-8 JSON including a
   `protocolVersion` and a purpose tag; service-authored JSON snapshots use those exact
   canonical bytes so their file and semantic hashes coincide. The key identities are:
   - `planSha256`: the complete canonical VideoPlan;
   - `recordingInputSha256`: canonical `{ beatTexts: string[], voice: { provider, voiceId,
     modelId, seed } }`, preserving Beat order and segmentation but excluding Beat ids, plan
     visuals and quota budget;
   - `takeSha256`: the full digest binding audio SHA-256 and canonical alignment SHA-256;
     `takeId` remains its first 12 hexadecimal characters for display only;
   - each validation, Preflight, compilation and render input hash: a purpose-tagged canonical
     tuple of every upstream artifact hash plus the relevant public contract or engine version.

The recommendation is yes to both. `run.json`, consumer verification, repeat behaviour,
replacement authorisation and crash recovery all depend on these paths and identities and
follow in later rounds.

User confirmed both recommendations on 2026-08-13: `Q1 oui, Q2 oui`.

### Grilling round 2 — monotonic Run authority

The agent can modify every byte below the Run root. Artifact hashes detect accidental drift
only while the binding that contains them is itself authentic; an agent could otherwise
rewrite both bytes and hashes, lower `newTakesUsed`, reuse a consumed grant, or roll the whole
directory back to an earlier valid snapshot. A self-hash cannot solve that, and an attested
file alone cannot detect deletion of its later revisions.

The sole open frontier decision is therefore:

3. make `run.json` an authenticated public checkpoint, not the authority for irreversible
   state. Its canonical body carries a monotonic `revision` and `headReceiptSha256`, plus an
   `attestation: { keyId, algorithm: "HMAC-SHA256", value }` produced with a key unavailable
   to the agent. Every receipt is likewise attested and chains `previousReceiptSha256` to its
   predecessor. A private Production-service ledger anchors, per `runId`, the highest revision,
   receipt head, `newTakesUsed`, and consumed replacement `grantId`s. On reopen, the service
   verifies checkpoint and receipt attestations, artifact bytes and the private head; it
   refuses a fork or rollback. If a crash committed the private head before replacing the
   public checkpoint, the service may atomically restore `run.json` from that authenticated
   state. Take bytes remain in the public Run and load-bearing through their verified bindings;
   the private ledger stores authority and anti-rollback state, not a hidden second copy of the
   media.

The recommendation is yes. It is the minimum boundary that makes an agent-writable Run safe
for quota and later reopening; the exact public checkpoint fields and consumer matrix depend
on it and follow next.

User confirmed the recommendation on 2026-08-13: `Q3 oui`.

### Grilling round 3 — public checkpoint and consumer verification

The open frontier is:

4. give canonical `run.json` exactly these always-present top-level fields:
   `{ protocolVersion, runId, revision, createdAt, updatedAt, stage, lastOutcome,
   headReceiptSha256, request, quota, bindings, terminal, attestation }`. `request` binds the
   immutable request descriptor and its production-configuration hash. `quota` is
   `{ maxNewTakes, newTakesUsed, replacementGrantIdsUsed }`, a readable mirror checked against
   the private ledger. `terminal` is null or binds the accepted Decline and its receipt.
   `attestation` has the Q3 shape and covers every preceding canonical field.

   `bindings` always contains nullable `plan`, `validation`, `preflight`, `take`, `compilation`
   and `render` entries. The plan binds `planSha256`, `recordingInputSha256` and its snapshot.
   Each downstream entry binds its purpose-specific input SHA-256, all direct upstream
   identities, its artifact descriptors, and `freshness: { state: "fresh" | "stale",
   reasons: [] }`. The Take entry additionally binds `takeId`, full `takeSha256`,
   `recordingInputSha256`, manifest, audio, alignment and TimedBeats. Compilation binds plan,
   Take, Compiled document and Compile report and includes a per-use `assetResolutions[]` view
   with `{ sectionId, sceneId, field, status, uri, pendingRequirementId, requirementId,
   reason }`; nullable fields remain present so `placeholder` and `failed` cannot collapse into
   one state. Render binds its compilation input plus the preview and carries the SHA-256 of
   that exact asset-resolution view. Its persisted receipt references the Compiled document,
   Compile report and preview, preserving those distinct states through the final result.

   `stage` is the highest currently fresh lifecycle stage, never the furthest artifact ever
   produced. Stale bindings remain visible for diagnosis and immutable history, while status
   derives `staleStages` from them. Old non-active artifacts remain reachable through the
   receipt chain rather than being deleted;
5. require every consumer to distrust and reverify its inputs, not inherit a producer's green
   result:
   - every command verifies the private head, checkpoint/receipt attestations, revision,
     canonical Run containment, absence of symlink/reparse escapes, and exact artifact bytes;
   - Preflight verifies the current plan snapshot, green validation binding and all input and
     contract-version hashes;
   - `record` additionally recomputes the Recording input and verifies any reusable Take's
     audio, canonical alignment, full `takeSha256`, TimedBeat file hash, and a fresh refold of
     alignment against the current ordered Beat texts;
   - `compile` repeats all Take checks itself, verifies matching plan/validation/Preflight
     bindings, and never trusts `record`'s receipt as a substitute;
   - `render` verifies the Compiled document and report bytes, their complete compilation-input
     binding, the verified Take/audio they name, the compiled-document schema and every
     service-readable asset reference before rendering;
   - `status` and reopen verify the checkpoint and every active binding before reporting it;
     a missing, changed or escaping artifact yields structured `needs_repair` with the specific
     binding and never triggers regeneration, replacement or overwrite.

The recommendation is yes to both. Exact repeat semantics, replacement consumption and crash
ordering depend on this checkpoint and verification matrix and follow next.

User confirmed both recommendations on 2026-08-13: `Q4 oui, Q5 oui`.

### Grilling round 4 — derived TimedBeat amendment

One downstream scenario exposes a contradiction in round 1's otherwise immutable layout. The
Recording input contains ordered Beat texts and their segmentation but deliberately excludes
Beat ids. Renaming `b2` without changing any text therefore preserves recording authorisation
and the audio/alignment Take, yet it changes the id carried by the derived TimedBeat. A single
immutable `artifacts/takes/<takeSha256>/timed-beats.json` cannot represent both legitimate
folds, and overwriting it would violate Q1.

The sole open frontier decision is:

6. amend only that path to
   `artifacts/takes/<takeSha256>/folds/<beatShapeSha256>/timed-beats.json`, where
   `beatShapeSha256` is the purpose-tagged canonical hash of ordered `{ id, text }` pairs. Audio,
   alignment and `take.json` remain single immutable files under the Take directory and alone
   determine `takeSha256`; the active Run binding points to the verified fold for its current
   Beat shape. A visual or scene-span repair keeps the same fold, while a pure Beat-id rename
   creates a new quota-free derived fold from the verified alignment. A text or segmentation
   change still changes the Recording input and cannot reuse the Take.

The recommendation is yes. This preserves both accepted rules — Recording-input identity and
immutable publication — without pretending Beat ids were spoken or spending quota to rename
them. Repeat and repair semantics depend on this correction and follow next.

User confirmed the recommendation on 2026-08-13: `Q6 oui`.

### Grilling round 5 — repeats, replacements and take-preserving repair

The open frontier is:

7. make successful non-network operations idempotent by their complete operation-input hash.
   Repeating validation, Preflight, compilation or rendering with an identical hash first
   verifies the existing immutable artifacts, reselects the binding as fresh and returns
   `succeeded` without recomputation; it appends the invocation's required receipt but never
   rewrites an artifact. A verified historical artifact may be selected again after the Run
   returns to the same input. A content-addressed path containing different or unverifiable
   bytes yields `needs_repair`, never an overwrite. `status` remains strictly read-only.

   `record` without a replacement grant searches every Take already bound in the Run for the
   current `recordingInputSha256`. A fully verified match is always reused with disposition
   `reused`, including after interruption or a later plan repair, and uses neither network nor
   quota. If the Run has never dispatched that Recording input and no verified Take exists, its
   first attempt is autonomous when budget remains. A known but missing or damaged matching
   Take is not silently regenerated;
8. define replacement and budget consumption at the irreversible provider boundary. Once a
   Recording input has reached `dispatching`, every later dispatch of that identical input is a
   replacement even when the earlier attempt failed or its outcome is uncertain. A supplied
   grant must authenticate, match `runId` and `recordingInputSha256`, and have an unused
   `grantId`. In one private-ledger transaction immediately before outbound I/O, production
   consumes the grant when required, records the dispatch and increments `newTakesUsed`.
   Therefore the public counter means quota-bearing synthesis dispatches, including a dispatch
   that returns no usable Take; reuse never increments it. A grant never overrides
   `maxNewTakes`.

   When replacement is needed but no grant is supplied, or when budget is exhausted, `record`
   returns `paused` with the specific next action and performs no network call. A malformed,
   wrongly scoped, unauthenticated or replayed grant returns structured `failed`. A successful
   authorised dispatch publishes a new immutable Take, keeps the old one in history, selects
   the new one only after full verification, and reports `replacement_recorded`. A consumed
   grant is never restored after a provider failure or uncertain outcome;
9. decide Take freshness solely from Recording-input identity, after artifact verification.
   Every plan change stales validation, Preflight, compilation and rendering. If ordered Beat
   texts, their segmentation and voice settings are unchanged, the Take remains reusable:
   changing visuals, assets, capability props, events, Sections, SceneInstances or their Beat
   spans does not spend quota; a Beat-id rename creates only the derived fold from Q6. The
   preferred duration repair is therefore to reassign existing Beats between SceneInstances,
   extend a scene over another existing Beat, or merge adjacent SceneInstances while keeping
   the Beat records intact.

   Any exact text change — including whitespace or punctuation — any Beat reorder, split or
   merge, or any voice-setting change creates a new Recording input and stales every prior
   Take for the active plan. It is eligible for its own autonomous first dispatch within the
   remaining Run budget. No command edits the plan on the agent's behalf.

The recommendation is yes to all three. Crash and concurrency recovery depend on these exact
repeat and dispatch semantics and form the final downstream round.

User confirmed all three recommendations on 2026-08-13: `Q7 oui, Q8 oui, Q9 oui`.

### Grilling round 6 — concurrency and crash recovery

The open frontier is:

10. serialise every state-changing command with one private Production-service lease per
    `runId` and compare-and-swap the expected Run revision when committing. Another stateful
    command waits only for a bounded interval, then returns structured `failed` with
    `RUN_BUSY`, no receipt and no mutation; it never races or steals an expired-looking lease
    without the service proving its owner dead. `status` waits for a stable checkpoint and then
    remains read-only. Contract commands need no Run lease. This prevents two simultaneous
    `record` calls from both observing unused quota or the same replacement grant;
11. use this durable commit order for every completed command: under the lease, verify the
    current head; build and fsync outputs in private temporary storage; atomically publish and
    fsync every immutable public artifact plus the attested next receipt; transactionally
    advance the private ledger revision and receipt head; atomically replace and fsync
    `run.json`; only then print stdout. A crash before the private-head commit leaves verified
    but inactive content-addressed artifacts, which an identical retry may reuse; a crash after
    that commit but before `run.json` leaves an authenticated public projection behind the
    private authority. `status` reports the private authoritative view without writing, and the
    next state-changing command restores the checkpoint atomically before continuing. A crash
    after `run.json` but before stdout is recovered by ordinary idempotent repetition.

    `record` adds an irreversible sub-transaction: before outbound I/O it durably records
    `dispatching`, increments budget and consumes the grant when required. A complete provider
    response is fsynced in private temporary storage and marked `response_received` before any
    public Take publication. Recovery from `response_received` finishes folding, hashing and
    publication without network. Recovery from `dispatching` without a complete response marks
    the attempt `uncertain`; it never calls the provider automatically, and the next `record`
    returns `paused`, requiring remaining budget and a new replacement grant for any retry.
    Provider failure, interruption or uncertainty never rolls back budget or a consumed grant.
    Orphan files without authenticated ledger evidence are never selected as active.

The recommendation is yes to both. These are the last operational decisions. The sole
downstream question is whether the complete integrity boundary receives its own ADR.

User confirmed both recommendations on 2026-08-13: `Q10 oui, Q11 oui`.

### Grilling round 7 — decision record

The final frontier decision is:

12. record the Run-integrity architecture in ADR-0008: an agent-writable, content-addressed
    public Run is an authenticated checkpoint and inspectable artifact carrier, while a private
    monotonic Production-service ledger is authoritative for revision, quota, consumed grants
    and concurrency. Include why hashes or signed files alone cannot prevent rollback, why Git
    cannot define an uncommitted Run Take, and why keeping all media private would defeat the
    inspectable handoff. Record the consequence that reopening and mutating a Run requires the
    Production service authority that issued its attestations, even though its verified public
    media remains readable and load-bearing.

The recommendation is yes. This qualifies separately from ADR-0007: it is costly to reverse,
surprising because `run.json` looks self-contained, and selects a real trade-off between a
portable but forgeable directory and an inspectable directory with private anti-rollback
authority. This is the final frontier for ticket 06.

User confirmed the recommendation on 2026-08-13: `Q12 oui`.

## Answer

A Run is an inspectable, content-addressed artifact carrier whose current public state is an
authenticated **Run checkpoint**. Irreversible authority lives in a private monotonic **Run
ledger** owned by the Production service. Git is neither required nor consulted: an
uncommitted Run Take remains load-bearing because every consumer verifies its authenticated
binding, raw media, alignment and derived fold before use.

### Paths, ownership and immutable publication

The reserved agent-readable layout is:

```text
run.json
inputs/request.json
inputs/plans/<planSha256>.json
artifacts/validation/<validationInputSha256>/report.json
artifacts/preflight/<preflightInputSha256>/report.json
artifacts/takes/<takeSha256>/audio.mp3
artifacts/takes/<takeSha256>/alignment.json
artifacts/takes/<takeSha256>/take.json
artifacts/takes/<takeSha256>/folds/<beatShapeSha256>/timed-beats.json
artifacts/compilations/<compileInputSha256>/document.json
artifacts/compilations/<compileInputSha256>/report.json
artifacts/renders/<renderInputSha256>/preview.mp4
receipts/<20-digit-sequence>-<command>.json
```

The agent owns and may edit its working `plan.json`; the service only reads it. Green
validation publishes a canonical immutable snapshot under `inputs/plans`. The service owns
every reserved path, although it distrusts them when reading because the directory remains
agent-writable. It creates outputs in private temporary storage and atomically publishes the
final path. Verified identical bytes are reusable; mismatching bytes at an occupied path are
an integrity error and are never overwritten. Receipts are append-only. `run.json` is the one
replaceable public file and every replacement is atomic.

### Hash domains and identities

An artifact descriptor's SHA-256 covers the exact file bytes. Semantic JSON identities use
purpose-tagged, protocol-versioned RFC 8785 canonical UTF-8 JSON. Service-authored JSON
snapshots persist those canonical bytes so semantic and file hashes coincide.

- `planSha256` covers the complete VideoPlan.
- `recordingInputSha256` covers `{ beatTexts: string[], voice: { provider, voiceId, modelId,
  seed } }`. Ordered texts and segmentation matter; Beat ids, visual fields and quota do not.
- `takeSha256` fully binds the raw audio SHA-256 and canonical alignment SHA-256. `takeId` is
  only the first 12 hexadecimal characters for display.
- `beatShapeSha256` covers ordered `{ id, text }` pairs. It selects a quota-free TimedBeat fold
  without changing the Take.
- Validation, Preflight, compilation and rendering identities cover all direct upstream hashes
  plus every relevant public-contract or engine version.

The fold path corrects the initially proposed single `timed-beats.json`: a Beat-id rename does
not change what was spoken but does change the derived TimedBeat ids. Multiple immutable folds
can therefore belong to one verified audio/alignment Take.

### Public checkpoint and private authority

Canonical `run.json` always contains
`{ protocolVersion, runId, revision, createdAt, updatedAt, stage, lastOutcome,
headReceiptSha256, request, quota, bindings, terminal, attestation }`.

`request` binds the immutable request and production configuration. `quota` mirrors
`{ maxNewTakes, newTakesUsed, replacementGrantIdsUsed }`. `terminal` is null or binds the
accepted Decline and receipt. `attestation` is
`{ keyId, algorithm: "HMAC-SHA256", value }` and authenticates every preceding canonical
field.

`bindings` always has nullable `plan`, `validation`, `preflight`, `take`, `compilation` and
`render` entries. Every downstream binding names its complete input hash, direct upstream
identities, artifact descriptors and
`freshness: { state: "fresh" | "stale", reasons: [] }`. The Take binds Recording input,
`takeId`, full `takeSha256`, manifest, audio, alignment and the current Beat-shape fold.
Compilation binds plan, Take, document and report and publishes per-use asset resolutions with
always-present fields `{ sectionId, sceneId, field, status, uri, pendingRequirementId,
requirementId, reason }`. Render binds that exact asset-resolution view as well as its
compilation and preview. Thus `placeholder` and `failed` remain distinct through the rendered
receipt, which references the Compiled document, Compile report and preview.

The lifecycle stage is the highest currently fresh stage, not the furthest historical output.
Stale bindings remain visible; immutable history remains reachable through receipts.

Because the agent can rewrite or roll back every public byte, signatures alone are
insufficient. The private Run ledger anchors the highest revision, receipt-chain head,
`newTakesUsed` and consumed `grantId`s for each `runId`. Receipts are individually attested and
chain `previousReceiptSha256`. Reopen verifies public attestations against the private head;
forks and rollbacks are refused. The ledger stores authority, not a hidden copy of Take media.

### Verification at every consumer

Every command verifies the private head, checkpoint and receipt attestations, revision, Run
containment, absence of symlink/reparse escapes and exact upstream artifact bytes.

- Preflight verifies plan snapshot, green validation binding and applicable contract versions.
- `record` recomputes the Recording input and verifies any candidate Take's raw audio,
  canonical alignment, full Take identity, fold hash and a fresh fold against the current
  ordered texts.
- `compile` repeats all Take verification itself and verifies plan, validation and Preflight;
  a record receipt is not proof by proxy.
- `render` verifies the Compiled document and report, compilation inputs, bound Take/audio,
  document schema and service-readable asset references.
- `status` and reopen verify every active binding before reporting it.

A missing, changed, escaping or mismatched artifact yields structured `needs_repair` naming the
binding. Verification never triggers regeneration, replacement or overwrite.

### Repeats, replacements and repairs

Validation, Preflight, compilation and rendering are idempotent by complete input hash. A
verified existing result is selected and returned without recomputation; the invocation still
gets its required append-only receipt. A verified historical result may become current again.

`record` without a grant first searches the Run's Take history. A verified matching Recording
input is reused with disposition `reused`, without network or quota. If that input has never
been dispatched and no verified Take exists, its first dispatch is autonomous while budget
remains. A known missing or damaged Take is not regenerated automatically.

Once a Recording input reaches durable `dispatching`, any later provider dispatch for it is a
replacement, even if the prior attempt failed or is uncertain. A replacement grant must be
authentic, scoped to the Run and Recording input, and unused. Immediately before outbound I/O,
one private transaction consumes the grant when required, records the dispatch and increments
`newTakesUsed`. The counter therefore measures quota-bearing dispatches, including ones that
produce no usable Take; reuse never increments it, and a grant never overrides the cap.

Missing replacement authorisation or exhausted budget produces `paused` without network.
Invalid, wrongly scoped or replayed grants produce structured `failed`. A successful authorised
replacement publishes a new immutable Take, preserves the old one and selects the new one only
after verification. Provider failure or uncertainty never restores budget or a grant.

Every plan change stales validation, Preflight, compilation and rendering. A Take stays reusable
exactly while ordered Beat texts, segmentation and voice settings remain identical. Visuals,
assets, capability props, events, Sections, SceneInstances and their Beat spans may change; a
Beat-id rename needs only a new fold. The preferred duration repair reassigns existing Beats,
extends a SceneInstance over an existing Beat, or merges adjacent SceneInstances without
changing Beat records. Text, whitespace, punctuation, Beat order, split/merge segmentation or
voice changes create a new Recording input and stale the old Take for the active plan.

### Concurrency and crash recovery

One private lease per `runId` serialises every state-changing command, and commits use a Run-
revision compare-and-swap. A bounded lock timeout returns `failed` / `RUN_BUSY` without receipt
or mutation. `status` waits for a stable checkpoint and stays read-only.

Normal durable order is: verify the head; build and fsync private temporary outputs; atomically
publish and fsync immutable public artifacts and the next attested receipt; transactionally
advance the private ledger; atomically replace and fsync `run.json`; then print stdout. A crash
before the ledger advance leaves inactive content-addressed outputs that an identical retry may
verify and reuse. A crash after it but before `run.json` leaves only the public projection
behind: `status` reports the private authoritative view without writing, and the next mutating
command restores the checkpoint. A crash after `run.json` but before stdout is handled by
ordinary idempotent repetition.

Recording persists `dispatching`, budget and grant consumption before network. A complete
provider response is fsynced privately and marked `response_received`; recovery finishes its
fold and publication without another call. `dispatching` without a complete response becomes
uncertain, never retries automatically, and makes the next `record` pause for a newly authorised
replacement within remaining budget. Unauthenticated orphan files never become active.

[ADR-0008](../../../docs/adr/0008-authenticate-agent-writable-runs.md) records this integrity
boundary and its portability trade-off separately from ADR-0007's execution boundary.
