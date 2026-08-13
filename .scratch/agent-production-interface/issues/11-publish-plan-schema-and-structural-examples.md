# Publish the VideoPlan schema and structural examples

Type: task
Status: resolved
Blocked by: 01, 07

## Objective

Make `videoPlanSchema` the canonical structural source for an agent-authored VideoPlan and
publish a JSON-Schema projection plus validated full-plan examples without exposing TypeScript.

## Scope

- Promote the current structural gate into an exported strict `videoPlanSchema` covering every
  authored field while leaving semantic catalogue checks with their existing owners.
- Derive the repository `VideoPlan` type from that schema and make `validateVideoPlan` parse it
  before semantic validation without degrading current repair messages.
- Add canonical structural-example data that collectively demonstrates partitions, persistent
  elements and placements, multiple capabilities, events and a valid Word anchor.
- Refuse generation unless every example passes both the schema and `validateVideoPlan`; keep
  TimedBeats, frames and fabricated durations out.
- Generate the public plan JSON Schema and example projection with a drift check.

## Acceptance

Type, runtime parse, public JSON Schema and structural examples derive from one source. Existing
plans remain green and no TypeScript appears in the public projection.

## Verification

```text
pnpm --filter @vox/video typecheck
pnpm test -- packages/video/tests/validate.test.ts packages/video/tests/plans.test.ts packages/video/tests/catalog-contract.test.ts
pnpm catalog:check
```

## Answer

Implemented 2026-08-13.

- `videoPlanSchema` is exported, strict at every object boundary and owns the complete
  authoring shape. `VideoPlan` and `VideoPlanSection` derive from it.
- Structural parsing still precedes semantic validation. Slot and motion-profile membership
  deliberately remain semantic so `UNKNOWN_SLOT` and the existing situated
  `motionProfile` repair continue to reach authors unchanged.
- `STRUCTURAL_PLAN_EXAMPLES` contains a minimal plan and the multi-capability vertical slice.
  Generation refuses either schema or semantic failures; together they demonstrate all
  structures named by ticket 01, including a Word anchor.
- `plan-contract.json` contains the draft-2020-12 JSON Schema and validated JSON examples.
  It contains no TypeScript, TimedBeat, frame or fabricated duration.
- `catalog` and `catalog:check` now generate/check both public projections.

Verification actually run:

```text
pnpm --filter @vox/video typecheck
  PASS
pnpm test -- packages/video/tests/validate.test.ts packages/video/tests/plans.test.ts packages/video/tests/catalog-contract.test.ts
  PASS — 3 files, 129 tests
pnpm catalog:check
  PASS — public catalog projections are up to date
git diff --check
  PASS
```
