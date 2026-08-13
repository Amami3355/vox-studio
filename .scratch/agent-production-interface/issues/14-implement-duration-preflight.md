# Implement advisory duration Preflight

Type: task
Status: resolved
Blocked by: 05, 10, 12

## Objective

Implement the configuration-scoped duration estimator and its public advisory report exactly as
decided in ticket 05.

## Scope

- Count authored UTF-16 units, exclude Beat separators and calculate cumulative boundary frames
  with the compiler's rounding rule.
- Encode the George/`eleven_v3`/seed-7/English calibration, 66.25 ms point rate and 20% policy
  margin, including founding evidence.
- Assess minimum and recommendation separately as `point_below`, `margin_crosses` or
  `margin_clear`; never emit a compile verdict.
- Produce the version-1 report, plan-only findings, unavailable/invalidated states, exact
  limitations and non-mutating guidance.
- Audit later verified Takes as holdouts, persist falsifying observations and require explicit
  versioned recalibration rather than automatic retuning.

## Acceptance

Preflight is deterministic and network-free, risks never block recording, and fixtures cover
available, missing, invalidated, threshold-rounding and false-clear cases.

## Verification

```text
pnpm --filter @vox/production typecheck
pnpm test -- packages/production/tests/preflight.test.ts packages/production/tests/calibration.test.ts
```

## Answer

Implemented 2026-08-13.

- Preflight counts verbatim JavaScript/UTF-16 units and computes scene frames from cumulative
  lower/point/upper boundaries with the compiler's exact rounding rule; no Beat separator,
  invented onset or per-Beat rounded sum enters the estimate.
- The fixed George/`eleven_v3`/seed-7/English calibration, founding evidence, 66.25 point
  rate and 53–79.5 policy interval are encoded and key-scoped. Another key yields
  `CALIBRATION_MISSING`, never borrowed evidence.
- Minimum and recommendation are independently classified into `point_below`,
  `margin_crosses` or `margin_clear`; guidance consistently says risk and prefers Beat
  reassignment/merge before an editorial text change.
- The version-1 schema-validated report includes plan-only findings with registry repairs,
  exact advisory limitations and the required unavailable shapes. A red validation cannot
  masquerade as Preflight.
- Every exact-key verified Take is auditable as a holdout. Out-of-policy Beats and
  authoritative false-clear scenes immediately invalidate and persist an observation;
  founding evidence and other keys do not. Reactivation requires an explicitly reviewed,
  higher calibration version.

Verification actually run:

```text
pnpm --filter @vox/production typecheck
  PASS
pnpm test -- packages/production/tests/preflight.test.ts packages/production/tests/calibration.test.ts
  PASS — 2 files, 11 tests
git diff --check
  PASS
```
