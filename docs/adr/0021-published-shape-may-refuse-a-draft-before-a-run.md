# ADR-0021 — Published shape may refuse a draft before a Run

**Status:** accepted · 2026-09-07

Production remains the only authority that can accept a VideoPlan and the only authority over
compiler semantics. The role-split Visual Planner may nevertheless refuse or repair an authored
draft before opening a Run when that draft fails the exact JSON Schemas Production published for
VideoPlan or SceneCapability props. This is a shape check, not a prediction of compilation: every
result names `checked: shape` and keeps `deferredTo: run.validate`, including a green result.

This narrows ADR-0016's statement that author tools are advisory. Its legacy `review` tool remains
advisory because it interprets teaching material and cannot be complete. `validateScene` and
`validateVideoPlan` are different: they evaluate a declared JSON Schema draft over the published
schema itself, read their finding codes from the published checks contract, and make no rule the
interface did not publish. A malformed published schema or missing check definition fails crew
configuration rather than being guessed around.

Keeping shape findings advisory was rejected because it would spend a Run to rediscover a field
error the author could correct in the same planning phase. Treating a green shape result as
acceptance was also rejected: anchors, durations, regions, capacities, assets, and all other
semantic checks still belong to Production. If local and Production shape evaluation ever
disagree, Production's refusal wins and the mismatch is a contract-compatibility defect.

**"Makes no rule the interface did not publish" is the clause that is easiest to lose.** The
first implementation of `validateScene` selected three property subschemas out of the published
SceneInstance schema and then wrote its own `required` and `additionalProperties` around them.
Selecting is what ADR-0019 asks for; authoring the constraints around the selection is a second
copy, and because a hand-written copy is written to be permissive, it was *weaker* than the
schema it came from — a scene Production refuses read green locally, which is the failure this
decision exists to prevent, arriving by the door marked "projection". The scene check now uses
the published SceneInstance subschema as published. A projection of a schema may narrow *which*
schema is evaluated; it may not restate what that schema requires.

This decision also deliberately replaces the crew's zero-runtime-dependency constraint.
Implementing even a partial JSON Schema evaluator locally would create the second compiler this
decision avoids, so the crew takes `jsonschema` as a bounded runtime dependency instead. Its
exercised release is the minimum and the next major is excluded; the crew's execution environment,
rather than a network install during tests, is responsible for provisioning runtime dependencies.
