# 01: The Scene Author can check its own shape before Production sees it

**What to build:** The two validation tools the Visual Planner offers its Scene Author stop
deferring on the half of the question that needs no Run. A SceneInstance whose props do not
satisfy the published `propsSchema`, and a VideoPlan that does not satisfy the published
VideoPlan JSON Schema, come back as structured findings the author can act on in the turn that
produced them. Everything the compiler decides stays with the compiler and stays deferred.

Before this ticket `_deferred_validation` in `crew_run.py` answered `{"ok": true, "findings": [],
"deferredTo": "run.validate"}` for both `validate_scene` and `validate_video_plan`. The
reasoning written at it is sound and should be preserved: Production is the authority, it
validates inside a Run, and the Director opens one only after planning, so at the moment the
planner would like a semantic answer there is nobody who can give one. A pre-check that guessed
at compiler judgment would be a second compiler, which is what the six rules exist to prevent.

But that argument proves more than the situation needs. It treats *validating the plan* as one
indivisible question, and it is two:

- **Shape.** Does this SceneInstance's `props` object satisfy the `propsSchema` the contract
  publishes for that capability? Does the assembled VideoPlan satisfy the VideoPlan JSON Schema
  the `plan` category publishes? These are decidable from published material alone, with no Run,
  no Production client, no clock and no catalog knowledge the role does not already hold.
- **Semantics.** Is this plan's use of anchors, durations, regions, capacities and asset
  requirements one the compiler will accept? That is Production's, it needs a Run, and it stays
  deferred exactly as it is now.

The material for the first is already in the role's hands. The Scene Author receives the full
authoring tier of every capability it selected, and `propsSchema` is one of its ten fields. The
`plan` category publishes `schema` — a VideoPlan JSON Schema — alongside its validated examples.
The crew is not being asked to know anything new. It is being asked to check the author's answer
against the schema it was already given to write against.

## Why this is worth a ticket rather than a patch

The failure path it closes is the most expensive one the crew has. A Scene Author that writes a
prop the schema refuses learns nothing at the time; the plan is assembled, `_require_green`
passes because the deferral always passes, Production refuses at `run.validate`, and the Run ends
in a refusal terminal. Research, two creative model calls and two planning model calls are spent
to discover a typed field mismatch. The `planRepair` projection the catalog publishes for exactly
this moment is consumed by nothing (`grep planRepair` finds only contract fixtures), so there is
no second attempt either.

Shape checking does not by itself add repair. It moves the discovery from after the Run to inside
the authoring turn, where the author still holds the tools and the specification, and where a
correction costs a tool call rather than a Run.

## Solution

The two validators the crew injects gain a real implementation over published schemas, and keep
reporting what they did not do.

**`validate_scene`** resolves the capability named by the instance, reads its `propsSchema` from
the authoring tier, and validates the instance's `props` against it. Findings name the JSON
Pointer path and the schema keyword that refused, in the vocabulary the compiler's own
`ASSET_PLACEHOLDER`-style findings already use, so an author sees one kind of finding rather than
two.

**`validate_video_plan`** validates the assembled plan against the `plan` category's published
schema.

**Both keep `deferredTo`.** A green answer must not read as "Production will accept this". The
result grows a shape that says both things at once: what was checked here, and what was not.
Something in the spirit of

```
{"ok": false, "checked": "shape", "findings": [...], "deferredTo": "run.validate"}
```

with the existing `subject` retained. An author reading `ok: true` must still be able to see that
semantic validation has not happened.

**The schemas and finding vocabulary come from the contract, never from a crew-held copy.** The VideoPlan schema is read
out of the `plan` projection the crew already fetches during discovery; `propsSchema` is read out
of the authoring tier the role already receives; `INVALID_PROPS` and `MALFORMED_PLAN` are resolved
through the published `checks` projection. A second copy of any of them — hand-maintained, vendored,
or "simplified" — is the failure this ticket must not introduce, and is the reason ADR-0019
requires projections to be generated selections rather than summaries.

## Implementation Decisions

- **The validator library is a dependency decision and should be made deliberately.** The crew's
  Python has no JSON Schema validator today and `dependencies = []` is currently true. Adding
  `jsonschema` is the obvious move and is not free: it is a runtime dependency of a service that
  will be containerised, and it must be pinned the way `google-adk` is pinned, with the exercised
  version as the floor. Writing a partial validator by hand instead is worse — a validator that
  disagrees with the compiler's is the second compiler the deferral exists to avoid.
- **Draft alignment matters.** The contract emits `draft-2020-12` (`z.toJSONSchema(schema, {
  target: 'draft-2020-12' })` in `generate.ts`). Whatever validates must be configured to that
  draft explicitly rather than to a library default, and a test should assert the draft the
  contract publishes is the draft the crew validates under — the two are edited by different
  people in different languages.
- **A props-shape finding is a finding, not an exception.** `ContractViolation` is for a value that
  failed its own contract gate; a prop that does not satisfy `propsSchema` is a correctable
  authoring answer and belongs in `findings` so the author can read it. The bounded repair gate at
  the end of `SplitVisualPlanner.plan` keeps raising after the author and repair role have spent
  their chances. The tool first checks the generic SceneInstance shape selected from the published
  VideoPlan schema, so a missing or malformed identity is a published `MALFORMED_PLAN` finding;
  an unpublished component is the published `UNKNOWN_CAPABILITY` finding. Malformed published
  schemas or missing published check definitions remain configuration `ContractViolation`s.
- **`planRepair` stays out of scope here and gets named as the follow-up.** This ticket makes the
  author's own answer checkable. Wiring a repair role over the `planRepair` projection is a
  separate ticket that this one unblocks, and it should not be smuggled in — a repair loop has a
  budget question attached to it, and budget is `converge`'s subject, not the planner's.
- **The validator's docstring is the specification of the boundary.** It argues what is checked
  here and what is not; ADR-0021 records why exact published shape may stop a draft while compiler
  semantics stay deferred.

## Testing Decisions

- A SceneInstance with a prop the capability's `propsSchema` refuses produces a finding naming the
  path, and the tool reports `ok: false` — asserted against a capability read from the real
  published contract, not a fixture written for the test.
- A SceneInstance the schema accepts still reports `deferredTo: run.validate`, so a green shape
  answer cannot be read as a Production verdict.
- A VideoPlan missing a required top-level field is refused by the plan-schema check.
- The draft the crew validates under is asserted equal to the draft the contract publishes.
- The crew-level behaviour is asserted end to end in the tracer: an author whose first answer
  fails shape and whose corrected answer passes reaches Production once, not twice.
- Nothing in the existing deferral tests is deleted to make room. The assertion that semantic
  validation is deferred must survive this change, because it is the thing that stays true.

**Blocked by:** None. It touches `crew_run.py`, `visual_planner.py` and `pyproject.toml`, and no
contract, agent instruction, prompt or recorded fixture.

**Status:** done

## What was built, and what was decided

`PublishedShapeValidators` explicitly uses `Draft202012Validator` over the schemas Production
published. A SceneInstance check resolves the named capability through the `sceneAuthor`
projection and validates only `props`; a VideoPlan check uses the `plan` projection's `schema`.
No schema or emitted check code is copied into crew source.

Shape failures return the compiler's published `INVALID_PROPS` or `MALFORMED_PLAN` vocabulary together with
the SceneInstance id where applicable, a JSON Pointer `path`, the refusing schema `keyword`, and
the validator's message. Green and red reports both say `checked: shape` and retain
`deferredTo: run.validate`; anchors, duration, capacity, assets, and every other semantic judgment
remain Production's.

The runtime dependency is `jsonschema>=4.26.0,<5`: 4.26.0 is the version exercised on Python
3.14.4. The acceptance tracer begins with an invalid `image_context` headline, gives the resulting
`/props/headline` finding to the existing one-turn Plan Repair Agent, and proves that only the
corrected plan reaches one Production `init` and one Production `validate`.

Verified by the complete agent suite after review hardening: 543 passed, 1 skipped.

- [x] `validate_scene` validates a SceneInstance's props against the published `propsSchema`
- [x] `validate_video_plan` validates the plan against the `plan` category's published schema
- [x] Both keep reporting `deferredTo: run.validate`, and a green shape answer cannot be mistaken for a Production verdict
- [x] Both read their schemas and emitted finding codes out of the published contract, with no crew-held copy
- [x] The JSON Schema draft the crew validates under is pinned to the one the contract emits, and a test asserts they agree
- [x] The validator dependency is pinned with its exercised version as the floor, in the style `google-adk` already uses
- [x] `PublishedShapeValidators` and ADR-0021 state what is checked locally and what remains deferred
- [x] Every tool-facing SceneInstance shape failure is a finding the author can read, never a raised `ContractViolation`
- [x] The existing assertions that semantic validation is deferred still pass, unedited

## Comments

**2026-09-07 — the crew-held copy this ticket forbids had crept back in, in miniature.**

*"Both read their schemas and emitted finding codes out of the published contract, with no
crew-held copy."* `_published_scene_tool_schema` selected the `id`, `component` and `props`
subschemas out of the published SceneInstance schema — correct — and then wrote its own object
constraints around them: `required = ("id", "component", "props")` where the contract publishes
`["id", "component", "props", "spansBeats"]`, and `additionalProperties: True` where the contract
publishes `false`. Selecting the properties and authoring the rules is still a second copy, and
this one was *weaker* than the published schema, which is the dangerous direction: a scene the
compiler refuses read green locally.

It is now `_published_scene_instance_schema`, which walks to the SceneInstance subschema and
returns it as published. Nothing is selected and nothing is restated. Assembled scenes carry
exactly the eight published properties, so `additionalProperties: false` costs nothing, and
`spansBeats` — which `_assemble` always sets — is now required here as the contract requires it.
`test_the_scene_check_is_the_published_sceneinstance_schema_and_not_a_weaker_copy` pins both
constraints against the contract so the miniature copy cannot return.

*"The JSON Schema draft the crew validates under is pinned to the one the contract emits."* The
guard covered the VideoPlan schema only; every `propsSchema` was handed to `Draft202012Validator`
whatever draft it declared. The check now lives in `_validator`, which every published schema
passes through: a schema declaring a different draft is a `ContractViolation`, and an embedded
subschema that declares none inherits the contract's pinned draft.
