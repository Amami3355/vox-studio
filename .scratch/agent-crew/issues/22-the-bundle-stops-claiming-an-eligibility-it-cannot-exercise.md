# 22: The bundle stops claiming an eligibility it cannot exercise

Status: ready-for-agent

## Problem Statement

Every Run's evidence bundle reports `cacheableChars`, and beside it `cacheServed: null` with an
explicit non-claim: no provider has ever told this crew that a cache served a prefix, so the
figure is an eligibility and never a saving.

That care is right as far as it goes, and it does not go far enough. On the crew as it is built,
the eligibility is not merely unobserved — it is unreachable. The live author opens a fresh
runner and a fresh session for every ask. The framework's own context caching begins on a
session's *second* turn, and no session in this crew ever has one. So the number is not "a saving
we could not confirm"; it is a saving that the crew's own structure guarantees cannot occur.

`context.py` says as much in its module docstring, which is to the codebase's credit. The problem
is the distance between that docstring and the field a reader actually meets. An operator reading
a bundle sees a character count named for caching and a null beside it, and the honest reading of
that pair is "eligible, not yet confirmed". The true reading is "structurally impossible under
the current session model". Those are different facts and the bundle publishes the wrong one.

**And the claim is not made in one place.** `teaching_surface.py`'s module docstring states that
the projections are assembled once *"so the repair loop runs against a cached prefix rather than
re-sending the catalog every turn."* The catalog **is** re-sent every turn: what happens once is
the assembly, not the transmission, and `context.py` prices it accordingly — the resident prefix
is multiplied by the model calls a turn makes. So a reader who never opens a bundle still meets
the false version, in the module that describes the surface being sent. Fixing the bundle field
and leaving that sentence would move the defect to the place a reader is more likely to reach
first. This ticket is a sweep, not a rename.

The underlying work is not wasted, and this ticket does not touch it. `cache_prefix` makes every
turn's prefix identical, and that property earns its place on its own terms: it is why a scripted
Run's instruction prefix is byte-identical at a fixed character count, and why measurements taken
either side of a change are comparable at all. Ticket 17 leans on exactly that. What is wrong is
only the name the property is published under.

There is also a claim here nobody has checked. The docstring's statement about when the
framework's caching engages was written from reading, not from a current source, and it is the
load-bearing fact under everything above. It should be verified against the framework's current
documentation as part of this change, and the finding recorded, whichever way it falls.

## Solution

Publish the property the crew actually has, under a name that describes it.

The bundle reports the identical-prefix fact — that every turn of a Run was authored against the
same prefix, and how large that prefix is — because that is what is true, what is measurable
offline, and what a reader can use. The framing shifts from a saving that might have happened to
a comparability property that certainly did.

Where a cache is mentioned at all, it is mentioned as what it is: a thing this crew's session
model does not reach, with the reason, so that a later reader does not take the null as an
invitation to go looking for the saving. The non-claim stops being an apology attached to an
optimistic field and becomes a recorded consequence of a deliberate design decision.

That decision is recorded here too, once, where the fields are. Reusing one session across a
Run's turns is the change that would make caching reachable, and it is rejected: `context.py`
already sets out why a fresh session per ask is deliberate and what changing it would cost, and
this ticket is not the place to reopen it. Writing that down beside the field is what stops a
future session reading the null as a bug and quietly changing the session model to clear it.

## Implementation Decisions

- **The prefix machinery does not change.** `cache_prefix` keeps its behaviour and its place. Its
  justification is the identical prefix, which stands without any reference to caching.
- **Renaming a bundle field is a bundle-shape change, and the bundle's own guards govern it.**
  Whatever reads the bundle back — the verifier, the assertion sheet, the tests that pin literal
  shapes — moves in the same change, and a bundle written before this change is not expected to
  verify against the reader after it. If that back-compatibility matters, it is a decision to take
  explicitly rather than discover.
- **The non-claim text is rewritten, not deleted.** Deleting it would leave a number with no
  account of what it does and does not mean, which is the defect one step further along.
- **Every site that names a caching benefit is found and corrected in this change.** Two are
  known — the bundle's field and its note, and the sentence in the module that describes the
  surface being sent. A search for the rest is part of the work rather than something left to a
  later reader, because the defect is a claim repeated in prose and prose does not fail a test.
  A site that turns out to be describing the assembly rather than a saving stays as it is; the
  distinction between "built once" and "sent once" is the whole point and both are worth saying
  where they are true.
- **The rejection of session reuse is recorded where the field is, not only where the code is.**
  A reader arrives at this via the bundle.
- **The framework's caching behaviour is verified against current documentation.** If the
  second-turn claim turns out to be wrong — if caching could engage on a first turn, or is
  configurable — then the premise of this ticket is different and the ticket says so instead of
  proceeding on a comfortable assumption. Nothing here should be published as fact on the
  strength of a docstring nobody re-checked.

## Testing Decisions

The bundle already has the right kind of test: literal shapes are pinned, and the verifier
re-derives a verdict from the assertions meant to support it. Both move with the field, and the
pinned shape is the assertion that the published name changed on purpose.

The prose is not testable and should not be made so. What protects it is that it sits beside the
field it describes, so a change to one is in the diff of the other.

The leak scan applies as it always does — the bundle lands in the work root and every file there
is scanned — and the new wording must pass it. It carries no repository vocabulary, but that is
a thing to be checked rather than assumed, since the whole class of defect the scan exists for is
prose written without thinking about where it lands.

## Out of Scope

- **Reusing a session across a Run's turns.** Rejected above, deliberately, and recorded so that
  it is rejected rather than merely undone.
- **Wiring the framework's context caching.** Follows from the session model and is unreachable
  without changing it.
- **Removing the prefix machinery.** It earns its place on the comparability property.
- **Measuring or claiming a token saving.** The crew counts characters, offline, for reasons
  `context.py` records, and this ticket does not reopen them.

## Further Notes

**The framework's caching behaviour, checked rather than inherited (2026-08-27).** The
load-bearing claim above — that the framework's context cache begins on a session's second turn
— was verified against `google-adk 2.7.1`, the version installed in `services/agents/.venv` and
the one the crew is written against. It holds, and it is stronger than the docstring that
carried it.

`ContextCacheConfig`'s own class docstring states it outright: *"Caching begins on the second
turn of a session at the earliest and requires the cacheable prefix to reach the model-specific
minimum: 2048 tokens for Gemini 2.5 or 4096 tokens for Gemini 3. Short or single-turn sessions
are therefore never cached."* Its `min_tokens` field repeats the mechanism: *"No cache is
created on the first request of a session; caching begins on the second turn once a previous
token count is known."*

It is enforced, not merely documented. `models/gemini_context_cache_manager.py` skips cache
creation whenever `llm_request.cacheable_contents_token_count is None` — logging *"No previous
token count available, skipping cache creation for initial request"* — and declines to create a
cache with no previous fingerprint to match. The gate reads a fact about the *previous*
response, so a session that never has one cannot pass it.

**Which way the finding falls: toward this ticket, not away from it.** `AdkPlanAuthor` opens a
fresh session per ask, so every session this crew opens is single-turn — the case the framework
names explicitly as never cached. Nor is it configurable into reach: `min_tokens` only raises a
floor, and Gemini's model-specific minimum applies underneath it regardless. The eligibility the
bundle publishes is therefore not merely unobserved but unreachable, which is what the Problem
Statement assumed and could not show.

The published documentation (`google/adk-docs`, `docs/context/caching.md`) does not contradict
this. It documents the configuration surface and leaves the turn rule to the class reference,
which is the same text as the installed source. The installed package is the better source here
in any case, being the code that actually runs.

**Blocked by:** None (can start immediately)

- [x] The framework's context-caching behaviour is checked against current documentation and the finding recorded
- [ ] The bundle publishes the identical-prefix property under a name that describes it
- [ ] The wording beside it says caching is unreachable under the current session model, and why
- [ ] The claim that the repair loop avoids re-sending the catalog is corrected where it is made
- [ ] Every other site claiming a caching benefit is found and corrected in the same change
- [ ] Everything that reads the bundle back moves in the same change and the verifier is green
- [ ] The pinned bundle shape is updated deliberately, with the change visible in the diff
- [ ] `cache_prefix` and the prefix accounting are unchanged in behaviour
- [ ] The rejection of session reuse is recorded beside the field, not only in a module docstring
- [ ] The leak scan passes over the new wording
