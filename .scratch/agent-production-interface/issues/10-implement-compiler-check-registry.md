# Implement the compiler-check registry and catalog v3

Type: task
Status: resolved
Blocked by: 07

## Objective

Carry out ADR-0006 before any public cold-authoring contract is generated. Replace the two
hand-written compiler-code unions with one `COMPILER_CHECKS` data source and publish the full
check vocabulary in manifest version 3.

## Scope

- Define all twenty error and seven warning entries with `code`, `regime`, useful `means`
  and actionable `repair`; warning entries also own their severity.
- Derive `CompilerErrorCode` and `CompilerWarningCode` from the registry and keep all existing
  call sites exhaustive.
- Add top-level `checks` to the generated catalog, bump `manifestVersion` to 3 and regenerate
  `catalog.json`.
- Add drift tests proving every emitted report code is published once, every warning severity
  agrees with the registry, and prose is non-empty and not a restatement of the code.
- Update the measurement-gate entry-condition wording only when the generated artifact and
  tests are green.

## Acceptance

There is no independently maintained compiler-code union or hand-written manifest copy. A new
check cannot typecheck without its public meaning and repair, and `catalog:check` is clean.

## Verification

```text
pnpm --filter @vox/video typecheck
pnpm test -- packages/video/tests/catalog-contract.test.ts packages/video/tests/compile.test.ts packages/video/tests/validate.test.ts
pnpm catalog:check
```

## Answer

Implemented 2026-08-13.

- `packages/video/src/core/compiler-checks.ts` is the sole declaration of all twenty error
  and seven warning codes. Report-code types and code-specific warning severities derive
  from it.
- Warning `severity` is a non-empty list because two existing codes are intentionally
  contextual: an empty soft-limited value is `info` while another soft-limit breach is
  `quality`; a pending asset is `quality` while a failed resolution is `important`.
- `catalog.json` is regenerated at `manifestVersion: 3` with the canonical top-level
  `checks` object. Its contract test proves unique self-keyed entries and substantive public
  `means`/`repair` prose.
- The earlier ADR count was an arithmetic defect: the existing union contained twenty
  errors plus seven warnings, not nineteen plus seven. ADR-0006 and this ticket now say 27;
  no report code was added or removed.
- `docs/measurement-gate.md` now records this entry condition as met while retaining
  `catalog:check` as its drift gate.

Verification actually run:

```text
pnpm --filter @vox/video typecheck
  PASS
pnpm test -- packages/video/tests/catalog-contract.test.ts packages/video/tests/compile.test.ts packages/video/tests/validate.test.ts
  PASS — 3 files, 164 tests
pnpm catalog:check
  PASS — catalog.json is up to date
git diff --check
  PASS
```
