# 01: The Scene Author can check its own shape before Production sees it

**What to build:** The two validation tools the Visual Planner offers its Scene Author stop
deferring on the half of the question that needs no Run. A SceneInstance whose props do not
satisfy the published `propsSchema`, and a VideoPlan that does not satisfy the published
VideoPlan JSON Schema, come back as structured findings the author can act on in the turn that
produced them. Everything the compiler decides stays with the compiler and stays deferred.

Today `_deferred_validation` in `crew_run.py` answers `{"ok": true, "findings": [],
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

**The schemas come from the contract, never from a crew-held copy.** The VideoPlan schema is read
out of the `plan` projection the crew already fetches during discovery; `propsSchema` is read out
of the authoring tier the role already receives. A second copy of either — hand-maintained,
vendored, or "simplified" — is the failure this ticket must not introduce, and is the reason
ADR-0019 requires projections to be generated selections rather than summaries.

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
- **A shape finding is a finding, not an exception.** `ContractViolation` is for a value that
  failed its own contract gate; a prop that does not satisfy `propsSchema` is a correctable
  authoring answer and belongs in `findings` so the author can read it. `_require_green` at the
  end of `SplitVisualPlanner.plan` should keep raising, because by then the author has had its
  chance.
- **`planRepair` stays out of scope here and gets named as the follow-up.** This ticket makes the
  author's own answer checkable. Wiring a repair role over the `planRepair` projection is a
  separate ticket that this one unblocks, and it should not be smuggled in — a repair loop has a
  budget question attached to it, and budget is `converge`'s subject, not the planner's.
- **The deferral's docstring is the specification of the boundary and must be updated rather than
  deleted.** It currently argues that nothing can be checked. It should argue what is checked here
  and what is not, and keep the sentence about a pre-check that guessed being a second compiler,
  because that sentence is still the reason semantics stay deferred.

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

**Status:** open

- [ ] `validate_scene` validates a SceneInstance's props against the published `propsSchema`
- [ ] `validate_video_plan` validates the plan against the `plan` category's published schema
- [ ] Both keep reporting `deferredTo: run.validate`, and a green shape answer cannot be mistaken for a Production verdict
- [ ] Both read their schemas out of the published contract, with no crew-held copy of either
- [ ] The JSON Schema draft the crew validates under is pinned to the one the contract emits, and a test asserts they agree
- [ ] The validator dependency is pinned with its exercised version as the floor, in the style `google-adk` already uses
- [ ] `_deferred_validation`'s docstring states what is checked locally and what is not, and keeps the reason semantics stay deferred
- [ ] A shape failure is a finding the author can read, never a raised `ContractViolation`
- [ ] The existing assertions that semantic validation is deferred still pass, unedited
