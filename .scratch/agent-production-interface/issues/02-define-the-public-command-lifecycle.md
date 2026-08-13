# Define the public command lifecycle

Type: grilling
Status: open
Blocked by: 01

## Question

What are the exact public commands and stage transitions of the Agent production interface?
Decide command names and namespaces, JSON inputs and result envelopes, exit-code semantics,
stdout/stderr separation, prerequisites, the `--out` write boundary, contract discovery, and
the structured decline result — which must be an explicit result artifact or protocol state,
never an exit code alone.

Decide also **that** preflight exists as a stage between `validate` and `record`, and the
prohibition that no command may present an estimate as an authoritative compilation result.
Preflight's estimator, margin, wording and report fields belong to
[Define duration preflight](05-define-duration-preflight.md).

Preserve the map's standing constraints: no command mutates `plan.json`, no network or quota
outside `record`, and the recording-authorisation model.

Record the hard-to-reverse boundary and its trade-offs where
[Decide the published contract artifacts](07-decide-the-published-contract-artifacts.md)
decides it belongs; do not widen ADR-0006 before that decision.

## Resolved when

Every command's name, inputs, outputs, exit codes and prerequisites are fixed, decline has a
represented shape, and preflight's place and limits in the sequence are stated.
