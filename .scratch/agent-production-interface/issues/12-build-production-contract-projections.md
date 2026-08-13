# Build declarative production contracts and public projections

Type: task
Status: resolved
Blocked by: 02, 04, 07, 10, 11

## Objective

Create the private canonical data and schemas behind the five public contract categories and
the uniform command protocol, without yet adding IPC or production side effects.

## Scope

- Add an `@vox/production` workspace package with strict schemas for request, Decline,
  replacement grant, artifact descriptor, result envelope, stages, outcomes and command data.
- Encode commands, prerequisites, lifecycle, Preflight limits, recording authorisation, repair
  and resume rules once as declarative production-contract data.
- Generate `language`, `plan`, `catalog`, `checks` and `protocol` projections and the compact
  index; `checks` must be an exact view of catalog v3 data.
- Generate language data from `CONTEXT.md` and reject malformed or duplicate glossary entries.
- Implement purpose-tagged RFC 8785 canonical JSON and SHA-256 helpers used by later tickets.
- Contract-test every projection against its canonical source and expose pure
  `contract index/show` handlers returning ticket-02 envelopes.

## Acceptance

All public protocol facts have one canonical owner, all five categories are versioned and
machine-readable, and pure contract commands perform no writes or network access.

## Verification

```text
pnpm --filter @vox/production typecheck
pnpm test -- packages/production/tests/contracts.test.ts packages/production/tests/canonical-json.test.ts
pnpm catalog:check
```

## Answer

Implemented 2026-08-13.

- Added `@vox/production` with strict Zod sources for protocol inputs, stages, outcomes,
  result envelopes, command data, artifacts and the advisory Preflight report.
- Declarative protocol data now owns command prerequisites, lifecycle, transport, exit codes,
  write containment, calibration limits, recording authorisation, repair and resume rules.
- The generator publishes a compact index and the five versioned `language`, `plan`,
  `catalog`, `checks` and `protocol` projections. `language` is parsed from `CONTEXT.md` with
  duplicate/malformed entry rejection; `checks` deep-equals `catalog.checks`.
- Pure `contract index/show` handlers return the fixed ticket-02 envelope and import only
  generated JSON; they have no Run, filesystem-write or network dependency.
- RFC 8785 canonical JSON rejects non-I-JSON values, sorts recursively and feeds
  protocol-versioned, purpose-tagged SHA-256 identities.
- Root `catalog`/`catalog:check` now build and verify both video and production projections.

Verification actually run:

```text
pnpm --filter @vox/production typecheck
  PASS
pnpm test -- packages/production/tests/contracts.test.ts packages/production/tests/canonical-json.test.ts
  PASS — 2 files, 9 tests
pnpm catalog:check
  PASS — video and production projections are up to date
git diff --check
  PASS
```
