# 30: The static instruction is the prefix and the refusal is a turn

Status: needs-triage

## Problem Statement

ADR-0017 rejected provider caching on a reading of the framework that is **correct and has already
been verified twice**. This ticket does not dispute it and adds no evidence to it. What it brings
is a mechanism the rejection did not consider.

**Everything about the cache floor is settled and is ticket 22's work, not this ticket's.** That
ticket is `done`; it read `ContextCacheConfig`'s own docstring in the installed `google-adk 2.7.1`
— caching begins on a session's second turn at the earliest, the cacheable prefix must clear
2,048 tokens for Gemini 2.5 or 4,096 for Gemini 3, and *"short or single-turn sessions are
therefore never cached"* — and established the consequence: `AdkPlanAuthor._ask` at
`planner.py:1251` builds a fresh `InMemoryRunner` and a fresh session per call, so every session
this crew opens is single-turn. The token floor was never the obstacle; the prefix is roughly
40,000 tokens at `CHARS_PER_TOKEN = 3`. Ticket 22 then published `prefixCache.reachable` as
`false` rather than `null`, deliberately, *"so that a later reader does not read the false as a
defect and clear it by changing the session model."*

**That sentence is aimed at a ticket shaped like this one, and it is the bar this ticket has to
clear.** Re-checking the docstring a third time would not clear it. Nothing below rests on the
cache floor being newly discovered, because it was not.

**What is new is a field, and it changes the trade rather than the fact.** ADR-0017 and ticket 22
reason from one shared premise: that reaching a cache means reusing a session, that reusing a
session means the prompt grows across turns, and that a growing prompt costs the identical prefix
every measurement in this project depends on. The rest of this statement is about that premise —
first that the crew already holds it less tightly than it believes, and then that the pinned
version publishes a field which takes it apart.

**The reason the crew opens a session per ask is to keep the prefix identical.** And here the
premise deserves a closer look than it has had. `repair_plan` at `planner.py:1074` does:

```python
text = prefix.text + said
```

The refusal is concatenated onto the **instruction string**. So a repair turn already sends a
different system instruction from the authoring turn. The property the crew actually holds is that
every turn *shares an opening* — which is genuinely valuable and genuinely what the measurements
rest on — but it is not that the instruction is identical, and `repair_plan`'s own docstring says
as much when it explains that the refusal goes after the prefix *"rather than in front of it, and
that ordering is what makes the prefix a prefix."*

**There is a field in the pinned version built for exactly this separation, and the crew does not
use it.** `LlmAgent.static_instruction`, present in 2.7.1:

> Static instruction content sent literally as system instruction at the beginning. This field is
> for content that never changes and doesn't contain placeholders. It's sent directly to the model
> without any processing or variable substitution. This field is primarily for context caching
> optimization.

And the behaviour that matters: *"When `static_instruction` is None: instruction → system
instruction. When `static_instruction` is set: instruction → user content (after static content)."*

So the assembled teaching surface can be the static instruction — sent literally, no templating,
byte-identical by construction — while the refusal becomes turn content. That is a **stronger**
invariant than the crew holds today, not a weaker one, and it is the shape a session spanning a
Run's turns requires.

## Solution

Put the assembled surface in `static_instruction`, move the refusal out of the instruction string
and into the turn, and let one session span a Run's turns. Then measure whether a cache is served,
and write down the answer either way.

The pieces are all present in the pinned dependency: `static_instruction` on `LlmAgent`,
`ContextCacheConfig` on `App` with `cache_intervals`, `ttl_seconds` and `min_tokens`, and a
`CacheMetadata` the framework populates on a response. The last of those is what makes this
reportable rather than assumed.

## Implementation Decisions

- **The measurement is the deliverable; the cache is not.** This ticket succeeds if it produces a
  recorded answer to "does a cache get served under this arrangement" and an ADR-0017 amendment
  saying so. A ticket whose success condition is a saving will be tempted to report one.
- **ADR-0017's prohibition applies in full and is the reason this is worth doing carefully.** *"No
  part of the codebase may claim the cost is recovered by caching. Not in a bundle field, not in a
  docstring, not in a commit message."* Ticket 22 swept exactly these claims once. **The bundle may
  report only what the framework's `CacheMetadata` actually states about a response**, and where it
  states nothing the bundle says nothing — not `null` dressed as an eligibility, which is the
  specific mistake `cacheableChars` against `cacheServed: null` already made here.
- **The docs are explicit that this field alone does not enable caching**, and the ticket must not
  be written as though it does: *"Setting static_instruction alone does NOT enable caching
  automatically. For explicit caching control, configure context_cache_config at App level."* Both
  halves are needed, plus a session that reaches a second turn.
- **The invariant is restated, strengthened, and asserted in its new form.** Today: every turn's
  instruction string shares an opening. After: the static instruction is byte-identical across
  every turn, and the varying material is turn content. The test that pins a scripted author's
  prefix at a fixed character count is the one that must be carried across — at the new boundary,
  with the boundary named.
- **This is a new prefix regime and it retires measurements.** What a model receives changes shape
  even where the bytes do not: system instruction versus user content is a different prompt.
  ADR-0017's disclosure rule applies and the amendment names what is retired.
- **`min_tokens` is set deliberately and is not the interesting variable.** The model floor —
  4,096 tokens for Gemini 3 — always applies and cannot be lowered. Setting the config's own
  `min_tokens` above it is the knob; the prefix clears both by an order of magnitude either way.
- **Ordering against ticket 20 is a real interlock, and the two should be sequenced deliberately.**
  Ticket 20 rewrites the same `_ask` — `asyncio.run` around the session service, then the runner's
  synchronous generator — because neither works from inside a running event loop. This ticket
  changes what a session *is* for a Run. Whichever lands second inherits the combination, and both
  touch `planner.py:1251-1290`. Landing 20 first is the cheaper order: an async path is a
  prerequisite for a session that outlives a call, not an alternative to it.
- **If a cache is not served, the ticket still lands its half.** The `static_instruction`
  separation is worth having on its own: it makes the invariant literal, moves the refusal to where
  it belongs conceptually, and removes the string concatenation that currently makes "identical
  prefix" an approximation. The caching result is recorded and ADR-0017 keeps its rejection with a
  better reason.
- **Reusing a session across turns is exactly what `context.py` says is costly to change, and that
  passage needs rewriting either way.** It argues the repair loop *"rebuilds the whole prompt
  rather than growing a conversation, which is what keeps the prefix identical."* Under
  `static_instruction` that trade dissolves — the static half cannot drift and the growing half was
  never the thing being held identical. Whether the argument survives is this ticket's to
  determine, and its docstrings must not be left describing a world that changed.

## Testing Decisions

**Keylessly, first.** Building the agent is already the furthest a machine with no credential can
follow, and already asserts a tool is bound. Extended: the built agent carries the assembled
surface as `static_instruction`, byte-identical to what `cache_prefix` produced, and its
`instruction` carries the turn material.

**The static instruction is identical across a Run's turns**, asserted directly rather than
inferred — the authoring turn and every repair turn build agents whose static instruction is the
same bytes. This is the replacement for the current fixed-character-count pin and it is a stronger
assertion.

**The refusal is not in the static instruction.** A repair turn's static instruction contains no
part of the refusal text, and the refusal is present in the turn content. This is the assertion
that the concatenation is really gone.

**The leak scan runs over both halves.** A prompt split in two is two places code-blindness can be
lost, and the scan currently runs over one concatenated string.

**A scripted Run is unchanged in what it costs and what it reports.** `HandedPlanAuthor` holds no
model; nothing here may move its spend, its bundle or its shape.

**The cache question is answered live, at n≥3, and recorded whichever way it falls.** Whether
`CacheMetadata` reports a served cache on the second and later turns of a Run. A single Run
establishes nothing. No voice credit is needed — this is authoring only, and a Run that stops after
compile answers it.

**The bundle reports only what the framework stated.** Asserted as an absence where no metadata
came back: no field implying eligibility, no `null` standing in for a saving.

## Out of Scope

- **Narrowing the catalog.** Tickets 27 and 28. This ticket keeps the surface whole and resident
  and changes only where it sits in the request.
- **Claiming or reporting a cost saving.** ADR-0017, unchanged and reinforced.
- **Reaching for an aliased or different model.** The pin stays, for the reason `AdkPlanAuthor`
  records: a bundle has to say which model authored a plan, and a floating name cannot.
- **The event-loop rewrite.** Ticket 20, sequenced ahead of this one.
- **Deciding whether cost is a reason to do anything.** If a cache is served, what that justifies
  is ADR-0017's argument to have with numbers on both sides. This ticket supplies one side.

## Further Notes

**This is not a claim that ADR-0017 was wrong.** It was right about the mechanism it considered,
and the verification above says so. What it did not consider is a field that separates the static
half of a prompt from the dynamic half, which is precisely the distinction the ADR spends its
Context section drawing by hand.

**Blocked by:** 20 (The author path survives an event loop) — strongly preferred first, same code

- [ ] The assembled surface is the agent's `static_instruction`, byte-identical to `cache_prefix`'s output
- [ ] The refusal is turn content and appears nowhere in the static instruction, asserted
- [ ] The static instruction is identical across every turn of a Run, asserted directly
- [ ] The leak scan covers both the static instruction and the turn content
- [ ] A session spans a Run's turns, and `context.py`'s passage arguing otherwise is rewritten to match
- [ ] `context_cache_config` is configured at App level with `min_tokens` chosen deliberately
- [ ] A scripted Run's spend, bundle and shape are unchanged
- [ ] The bundle reports only what `CacheMetadata` states, and nothing where it states nothing
- [ ] Live Runs at n≥3 record whether a cache was served, whichever way it falls
- [ ] ADR-0017 is amended with the result and names the measurements the new regime retires

## Comments

**2026-08-28 — One correction, folded into the Problem Statement, and the conflict this creates.**

**The cache-floor verification was not new and the first draft of this ticket presented it as if
it were.** Ticket 22 is `done` and already carries the same `ContextCacheConfig` docstring, quoted
at the same length, reaching the same conclusion — that caching begins on a session's second turn,
that the Gemini 3 minimum is 4,096 tokens, and that every session this crew opens is single-turn.
It published that as a `prefixCache` block whose `reachable` is `false` **rather than null**,
specifically so that *"a later reader does not read the false as a defect and clear it by changing
the session model."*

**The Problem Statement has been rewritten to credit ticket 22 with the verification and to rest
this ticket's case entirely on `static_instruction`**, which neither ticket 22 nor ADR-0017
considered, and which changes the *trade* rather than the *fact*. The reason for recording it here
as well as fixing it there: the first draft would have sent the next reader off to re-check
something already checked twice, and the correction is itself the evidence for how easily that
happens.

**Ticket 22 rejected the change this ticket makes, in terms this ticket must answer.** Its Out of
Scope: *"Reusing a session across a Run's turns. Rejected above, deliberately, and recorded so that
it is rejected rather than merely undone."* Undoing it silently is precisely the failure ticket 22
built its `reachable: false` wording to prevent. So the ADR amendment is not paperwork at the end
— it is the thing that distinguishes this ticket from the quiet reversal ticket 22 anticipated,
and it should be the first commit rather than the last.

**The conflict with ticket 20.** That ticket commits to the opposite in three places — an
Implementation Decision, an Out of Scope entry, and an acceptance criterion reading *"A fresh
session per ask is unchanged."* Both touch `planner.py:1251-1290`. The `Blocked by` line already
prefers 20 first, and that preference should be kept: an async path is a prerequisite for a session
that outlives a call. If 20 lands first, this ticket amends those three lines rather than leaving
them standing. A matching comment has been added to ticket 20.

**Downstream.** `.scratch/cloud-phase/issues/01-the-crew-is-hostable-and-adk-is-not-the-mechanism.md`
makes the session service configurable rather than replaced, deliberately compatible with either
outcome here. It does not force this ticket's hand and should not be cited as a reason to take it.
