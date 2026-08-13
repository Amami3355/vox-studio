# Implement record, reuse, quota and replacement authorisation

Type: task
Status: resolved
Blocked by: 13, 15, 16

## Objective

Implement the only network-capable command with durable first-dispatch, reuse, replacement,
budget and uncertain-response semantics.

## Scope

- Search and fully verify matching historical Takes before any provider decision; default to
  `reused` without network or quota.
- Persist `dispatching`, budget and one-time grant consumption before outbound I/O; validate
  scope and opaque authentication outside the public Run.
- Enforce autonomous first distinct input, replacement grants for every later identical
  dispatch, immutable Take history and a hard `maxNewTakes` cap.
- Fsync complete provider responses privately as `response_received`, then fold, publish and
  select only after full verification.
- Recover complete responses without network and turn incomplete dispatches into `paused`
  uncertainty requiring a new grant and remaining budget.
- Cover invalid/replayed grants, provider failure, killed processes, simultaneous calls and
  record-after-repair in deterministic injected-provider tests.

## Acceptance

Only `record` can call the provider; no crash or concurrent invocation can duplicate quota,
reuse is byte-verified, and every pause/failure preserves the prior successful stage.

## Verification

```text
pnpm --filter @vox/production typecheck
pnpm test -- packages/production/tests/record-command.test.ts packages/production/tests/record-recovery.test.ts packages/production/tests/replacement-grant.test.ts
```

## Answer

Implemented 2026-08-13.

- `run.record` now requires current green validation and advisory Preflight, recomputes the
  Recording input, and searches authenticated receipt history for a fully byte-verified Take
  before making any provider decision. Matching Takes are reused without network or quota;
  a Beat-id-only repair creates a new immutable fold over the same audio/alignment.
- The private ledger now records each attempt as `dispatching`, `response_received`,
  `uncertain`, `failed` or `published`. Immediately before provider I/O, an exclusive per-Run
  transaction increments `newTakesUsed`, records the dispatch and consumes a replacement
  `grantId` when required. The following public receipt reflects the ledger-authoritative
  quota; legacy ledgers default their attempt history to empty.
- Provider audio and canonical alignment are fsynced as immutable private response artifacts
  and hashed in the ledger before public Take publication. Recovery from `response_received`
  folds, verifies and publishes without another provider call. Recovery from `dispatching`
  marks uncertainty and pauses without retrying.
- The first distinct Recording input dispatches autonomously within budget. Every later
  dispatch of that identity requires an authenticated, correctly scoped, unused opaque grant.
  Invalid, forged, wrong-Run and replayed grants fail before network; a valid grant never
  overrides `maxNewTakes`; provider failures do not restore quota or grants.
- Explicit replacement authorisation can replace a healthy reusable Take, while absence of a
  grant always selects reuse. Successful replacement keeps immutable history and binds the new
  Take only after full verification.
- The exclusive session spans provider I/O so simultaneous record calls cannot both observe
  quota or dispatch. An expired lease is broken only when its recorded process is proven dead;
  a live owner yields bounded `RUN_BUSY` rather than lease stealing.
- Provider, grant verifier, clock and crash points are injected in tests. No real synthesis or
  credential was used.

Verification actually run:

```text
pnpm --filter @vox/production typecheck
  PASS
pnpm test -- packages/production/tests/record-command.test.ts packages/production/tests/record-recovery.test.ts packages/production/tests/replacement-grant.test.ts
  PASS - 3 files, 10 tests
pnpm typecheck
  PASS - all 4 workspace projects
pnpm test
  PASS - 31 files, 340 tests
pnpm catalog:check
  PASS - catalog and Production projections current
git diff --check
  PASS
```
