# 21: A model answers with a plan or it does not answer

Status: ready-for-agent

## Problem Statement

The crew asks a model for a VideoPlan and gets back a string. What it does with that string is
scrape it: a regular expression looks for a fenced block, falls back to treating the whole answer
as the body, and hands the result to a JSON parse. When that fails the crew raises
`PlanNotAuthored` — *"An author answered with something that is not JSON"* — and the turn is
gone.

The cost of that turn is not nothing. A repair budget is two cycles plus one per minute the Brief
asks for, read out of the Brief's own opening words, and it exists to protect a Run from
converging forever. A turn spent on an answer that was prose rather than a plan is a cycle bought
by a formatting accident, against a budget sized for editorial disagreement.

Binding a tool made the shape of the answer harder rather than easier. `_ask` records the
reasoning: with the draft-review tool bound, the run yields the intermediate turns too, and
joining every text part the way it did before tools *"would splice the model's reasoning about a
finding into the JSON it eventually answered with"*. The fix taken there was to read only the
final response. It is the right fix and it is still a fix — the crew is defending, in its own
code, against a class of answer the framework can now refuse to produce.

Current ADK supports a declared output schema alongside tools: the tools are available during
the thought loop and the schema is applied to the final output, with a published tool by which
the model sets that final structured response. The documentation notes the combination is only
supported by specific models — Gemini 3.x among them, which is the family the crew is pinned to.
So the guarantee is available on exactly the configuration the crew runs.

And the crew already holds the schema. The `plan` category publishes *"VideoPlan JSON Schema and
validated full-plan examples"*, and its contract carries the schema as a machine-readable
document, fetched at run time like everything else the crew knows. Declaring the answer's shape
therefore costs nothing in code-blindness: the crew would be constraining the answer to the shape
the interface published, not to a shape this repository remembers.

## Solution

Declare the answer's shape from the schema the interface published, so that an answer which is
not a plan is a thing the model is not asked to produce.

The live author binds an output schema, derived at run time from the plan category's published
schema and carried to the framework at the same place the instructions and the tool are. The
draft-review tool stays bound: the two are compatible on this model family and the pre-submission
reading is not given up to gain the guarantee.

The published schema does not necessarily fit through the framework's schema surface unedited.
The declaration keywords the interface uses are broader than the constrained-decoding subset
accepts. So the crew *projects* the published schema onto the subset the framework takes —
dropping what cannot be carried, never inventing what was not published, and never editing the
contract. A projection that cannot preserve the shape of a plan is a reason to stop and record
that, not a reason to hand-write a schema in the crew.

The existing reader stays as a fallback rather than being deleted. A guarantee that holds on one
model family is not one to build a single point of failure on, and the fenced-block reader is
eleven lines that already work. What changes is that it stops being the primary path, and that
`PlanNotAuthored` stops being an ordinary outcome of a well-behaved turn.

## Implementation Decisions

- **The schema comes from the teaching surface, never from this repository.** The crew's whole
  discipline is that everything it knows about the plan it asked for. A schema class declared in
  the crew would be the plan contract copied into the code the contract exists to keep out, and it
  would go stale the first time the contract moved.
- **The projection is a seam with its own tests, not an inline transformation.** What the
  published schema uses beyond the constrained subset is a fact about two contracts meeting, and
  it is the part most likely to break when either moves. It gets a name and a test rather than
  living inside the author.
- **The projection drops, and never adds.** A keyword the framework cannot carry is dropped, and
  the constraint it expressed is still taught — every one of them is already in the instructions,
  because the schema is part of what the model is shown. A projection that invented a constraint
  the contract did not publish would be the crew authoring contract, which is the one thing it
  may not do.
- **The tool stays bound.** Giving up the pre-submission reading to gain the guarantee would undo
  ticket 18 to fix a formatting problem.
- **The fallback reader survives.** The primary path becomes the declared schema; the fenced-block
  reader remains for an answer that arrives unconstrained, and `PlanNotAuthored` remains for one
  that is neither.
- **No manifest, fixture or contract bytes move.** This ticket reads what the contract already
  publishes. If the stale-fixture guard fires, something has been changed that this ticket had no
  business changing.
- **If the projection proves impossible, the ticket says so and stops.** A recorded finding that
  the published schema cannot be carried is a better outcome than a hand-written schema that
  drifts, and it is evidence for a contract change taken to the contract's own ticket.

## Testing Decisions

The assertions belong to what a caller can observe: what the author binds, and what it does with
what comes back. Three seams, all of which exist.

**The projection.** Given the published plan schema as the fixtures record it, the projection
produces something the framework's schema surface accepts, and the shape of a plan survives —
the sections, the beats, the scenes and their required fields are still required. The regression
that matters is the other direction: a keyword the subset does not accept is dropped rather than
passed through, and nothing appears in the projection that was not in the published schema.

**The author's public seam.** Building the agent is already the keyless seam and already asserts
the tool is bound. Extended: the built agent carries the derived output schema, and it carries the
tool at the same time. Both, on one agent, on a machine with no credential — which is the
assertion that this ticket did not trade one for the other.

**Reading the answer.** The existing tests for the fenced and unfenced forms stay green, because
the fallback stays. Added: a well-formed structured answer is read without the regular expression
being reached at all.

**Rehearsal, not proof.** Whether this changes how often a Run loses a turn is a fixture-provider
question and costs no voice credit. It is worth a note in the ticket's close rather than a
measurement campaign: the defect it removes is rare, and the argument for removing it is that its
cost is a repair cycle, not that it is frequent.

## Out of Scope

- **Declaring an input schema.** The Brief reaches the model as the message and the instructions
  teach its shape; nothing about the current arrangement is failing.
- **Removing the fenced-block reader.** Kept deliberately, as recorded above.
- **Changing the plan contract or its published schema.** If the projection finds the published
  schema unusable, that is evidence, taken to the contract.
- **Changing what the instructions teach.** The schema is already part of the projection the
  model reads. Declaring it to the framework as well is a second channel for the same fact, not a
  replacement for the first.
- **The model pin.** Unchanged, and its reasoning is unchanged.

**Blocked by:** 19 (the pin must require the version whose schema-with-tools behaviour this uses),
20 (both rewrite the same part of the ask, and this one should land on the async shape)

- [ ] The live author declares the answer's shape from the schema the interface published, fetched at run time
- [ ] No plan schema is declared in the crew's own code
- [ ] The projection onto the framework's schema subset is a named seam with its own tests
- [ ] The projection drops what cannot be carried and adds nothing the contract did not publish
- [ ] The draft-review tool is still bound on the same agent, asserted on a machine with no credential
- [ ] A well-formed structured answer is read without the fenced-block reader being reached
- [ ] The fenced-block reader and `PlanNotAuthored` still handle an unconstrained answer
- [ ] No contract, manifest or fixture bytes move, and the stale-fixture guard is green untouched
- [ ] If the published schema cannot be projected, the ticket records that finding instead of hand-writing a schema
