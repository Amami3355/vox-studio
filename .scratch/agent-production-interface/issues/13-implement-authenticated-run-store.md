# Implement the authenticated Run store

Type: task
Status: resolved
Blocked by: 06, 12

## Objective

Implement ADR-0008's immutable public artifact store, attested Run checkpoint, chained receipts
and private monotonic ledger as reusable production primitives.

## Scope

- Implement the exact reserved paths, canonical snapshots, purpose-specific input hashes and
  full Take/Beat-shape identities from ticket 06.
- Publish immutable files through private temporary storage plus fsync and atomic creation;
  reuse identical bytes and refuse mismatches or symlink/reparse escapes.
- Implement canonical `run.json`, freshness bindings, per-use asset-resolution preservation,
  HMAC attestations and chained receipts.
- Implement a private filesystem-backed ledger outside the public Run root with monotonic
  revision, receipt head, quota, grant consumption and compare-and-swap semantics.
- Add per-Run leases, bounded `RUN_BUSY`, reopen/rollback/fork detection and the normal durable
  commit/recovery ordering, using injected crash points in tests.

## Acceptance

An agent-writable Run cannot forge or roll back authoritative state, corrupt artifacts are
never overwritten, and every injected crash converges to the last committed revision without
duplicating work.

## Verification

```text
pnpm --filter @vox/production typecheck
pnpm test -- packages/production/tests/run-store.test.ts packages/production/tests/run-recovery.test.ts packages/production/tests/run-security.test.ts
```

## Answer

Implemented 2026-08-13.

- `RUN_PATHS` encodes the complete reserved layout, including full-Take and Beat-shape fold
  paths; identity helpers purpose-tag every semantic input domain.
- Immutable publication uses fsynced private temporary files and atomic hard-link creation.
  Identical bytes reuse; occupied mismatches, cross-device publication and traversal through
  links/reparse points are refused.
- Canonical `run.json` carries strict typed freshness bindings, exact asset-resolution views,
  quota and HMAC-SHA256 attestation. Receipts are individually attested, immutable and chained
  to revision one.
- The private filesystem ledger is monotonic over revision, chain head, quota and consumed
  grants. Per-Run leases, bounded `RUN_BUSY`, revision CAS and grant replay/cap enforcement are
  implemented.
- Durable ordering is artifact/receipt → pending ledger → checkpoint → settled ledger.
  Orphan receipts are reused after a pre-ledger crash; pending projections are reconstructed
  from the attested receipt after later crashes.
- Reopen validates strict schemas, HMACs, every receipt hash and every artifact descriptor in
  active bindings. Valid old checkpoints are classified as rollback unless the ledger records
  an interrupted projection.

Verification actually run:

```text
pnpm --filter @vox/production typecheck
  PASS
pnpm test -- packages/production/tests/run-store.test.ts packages/production/tests/run-recovery.test.ts packages/production/tests/run-security.test.ts
  PASS — 3 files, 13 tests
git diff --check
  PASS
```
