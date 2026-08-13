# Implement non-network production commands

Type: task
Status: resolved
Blocked by: 11, 12, 13, 14

## Objective

Implement `run init`, `status`, `decline`, `validate` and `preflight` as service-side command
handlers over the authenticated Run store.

## Scope

- Parse filesystem-only named inputs and return the exact uniform envelope and exit semantics.
- Enforce the non-existing safe `--out` root, request snapshot, stage transitions, terminal
  Decline and strictly read-only status.
- Snapshot agent plans without mutating them; bind validation, Recording input, freshness and
  generated reports.
- Run every plan-only check and duration Preflight; preserve warnings and unavailable
  calibration while keeping them non-blocking.
- Persist transition receipts before returning, reverify every active input and reuse exact
  operation hashes.
- Test with a network adapter that fails the test if any handler attempts outbound access.

## Acceptance

All five handlers satisfy tickets 02, 05 and 06 under repeat, tamper, stale-plan, Decline and
reopen scenarios without network or writes outside the Run root.

## Verification

```text
pnpm --filter @vox/production typecheck
pnpm test -- packages/production/tests/init.test.ts packages/production/tests/status.test.ts packages/production/tests/decline.test.ts packages/production/tests/validate.test.ts packages/production/tests/preflight-command.test.ts
```

## Answer

Implemented 2026-08-13. The validation suite is named `validate-command.test.ts` to avoid
colliding with the compiler's existing `validate.test.ts`.

- `ProductionCommandService` implements filesystem-JSON `init`, `status`, `decline`,
  `validate` and `preflight` over the authenticated store, with uniform envelopes and process
  codes 0/1/2.
- `init` enforces the pre-existing canonical parent/non-existing leaf contract and snapshots
  request bytes without mutating the input. `status` reopens and reverifies request, chain,
  checkpoint and active artifacts without changing any public or private byte.
- `decline` persists a structured terminal result only before a Take and preserves an
  agent-owned draft plan.
- `validate` never rewrites its input. Green plans publish canonical snapshots and fresh
  bindings; red plans return `needs_repair` at exit 0 with their report. Repeats reuse
  content-addressed output while appending a receipt; changed plans stale downstream state.
- `preflight` requires fresh green validation, reads the verified snapshot and publishes the
  full advisory report. Warnings and missing calibration succeed and point to `run.record`.
- Every printed transition envelope matches the data/artifacts/next action persisted in its
  receipt. An injected network adapter that always throws remains uncalled across all tests.

Verification actually run:

```text
pnpm --filter @vox/production typecheck
  PASS
pnpm test -- packages/production/tests/init.test.ts packages/production/tests/status.test.ts packages/production/tests/decline.test.ts packages/production/tests/validate-command.test.ts packages/production/tests/preflight-command.test.ts
  PASS — 5 files, 11 tests
git diff --check
  PASS
```
