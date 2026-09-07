# Why does current Production refuse the September 5 Run receipts?

Parent: [Hackathon launch](../map.md)
Type: task
Status: open
Assignee: none

## Observed failure

On 2026-09-07, the hosted crew's signed `run.status` returned `RUN_INTEGRITY_ERROR`:

- Run `23aace30-7d2c-4715-b5f8-77003fcd57e1`: `receipts/00000000000000000008-run-render.json`
  does not match the receipt schema.
- Run `e47463eb-9216-402b-bfc3-4d850111d935`: `receipts/00000000000000000003-run-preflight.json`
  does not match the receipt schema.

Production image: `sha256:cb7ea2135cfc514406aaefb7d7e321eeed2f459bd015d15eca9ec583fe82eac7`.
The first Run rendered successfully in [the September 5 record](../../cloud-phase/run-2026-09-05.md).
Neither historical Run was modified. The exact schema field causing refusal is not yet diagnosed;
this observation does not establish malicious corruption or a valid migration strategy.

The new connectivity-only Run `f70e55e4-c33f-457a-bc80-7ab5e2bb9d65`, initialized through the
crew with `maxNewTakes: 0`, returns signed status `succeeded` under the current schema. That
proves current connectivity, not compatibility of the historical receipts.

## Acceptance

Identify the rejected fields using a trusted operator check without copying private receipts
or signing keys into crew artifacts. Reproduce at the Run store boundary, decide any needed
compatibility/migration behavior while preserving attestation verification, and prove the result.
Do not rewrite old receipts or relax integrity checks simply to make status pass. Resolve before
claiming recovery of these historical Runs; a fresh-video attempt can proceed independently.
