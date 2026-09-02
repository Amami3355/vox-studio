# 24: The author is offered the catalog, not only shown it

Status: frozen for the cloud phase — see `.scratch/cloud-phase/DELIVERY.md`

> **Frozen 2026-09-02, not cancelled.** This ticket's deliverable is a measurement feeding
> ADR-0017's argument, and nothing on the path to a hosted deployment depends on it. It was the top
> build item before the freeze and is the first thing to unfreeze after ticket 09 lands. Its
> `## Amendment` below is current as of 2026-08-30 and nothing has moved under it since.

## Problem Statement

The crew's author reads the catalog and never asks it anything. All eight capabilities, 56,788
characters of them, arrive resident in the instructions on every turn, and the only thing the
author can do with that material is read it once before writing. There is no way for it to look
something up, no way to ask what would serve a purpose it has in mind, and no way to check an
understanding before committing a plan to it.

The suspicion this ticket exists to test is that reading is not the same as reaching, and that an
author which can *ask* about a capability chooses better than one which was merely shown it.
Ticket 17 is the evidence that motivates it: an author with `highlightBar` and `focusPoint` fully
described in front of it picked the non-deictic sibling every time it had a choice. Whatever went
wrong there, it was not a lack of information in the prefix.

It could go either way, and that is the point. An author that under-explores what is resident may
under-explore a tool more, because a tool call is a decision to look and this author's
demonstrated bias is not looking. Or the act of asking may be exactly what turns a wall of
description into a set of options. Nobody knows, and the question is currently unanswerable
because the capability to ask does not exist.

The larger version of this idea — remove the catalog from the prefix and make the author fetch
what it needs — is a different and much more expensive proposition, and ADR-0017 records why: the
identical prefix and on-demand lookup are alternatives rather than stages, and trading the first
away invalidates every before-and-after measurement this project has taken. **This ticket
deliberately does not make that trade.** The catalog stays resident, in full, byte for byte. The
tools are added beside it.

That is what makes this the cheap experiment: it costs model calls and nothing else, it is
reversible by unbinding, and its result is the evidence ADR-0017 asks for before the expensive
version can be argued at all. If an author with the catalog resident never calls the tools, that
answers the larger question for free.

## Solution

Offer the author a way to interrogate the surface it is already holding.

Two callables, bound the way the draft-review tool is bound: **one that finds capabilities and
actions by what the author is trying to do**, and **one that returns a single capability's
published specification**. Both answer out of the teaching surface the crew already holds in
context — the same bytes the prefix was assembled from, no service call, no client, no network.
That is what makes this experiment cost model calls rather than a Run.

They return the contract's own published material, unedited and unsummarised, for the same reason
the prefix does: a paraphrase of a capability is a description the author then cannot name
correctly.

The author's preamble gains a sentence saying the tools exist — only for an author that holds
them, so a scripted Run's prefix stays byte-identical and the pre-tool measurements stay
comparable.

And the Run records what happened: which tools the author called, with what, and how many times,
carried in the evidence bundle beside the draft-review codes ticket 18 already keeps. Without
that, the experiment produces an impression instead of a result.

## Implementation Decisions

- **The catalog stays resident and whole.** This ticket does not touch ADR-0017 and must not be
  read as a first step toward doing so. The prefix a tool-holding author reads is the prefix it
  read before, plus one preamble sentence.
- **The tools read the surface, never the client.** ADR-0016 settles this: the author seam carries
  payloads and tools and nothing that locates anything, and an author holding a client could issue
  commands the crew never authorised and the bundle never sees. The crew holds the surface in
  context already; the tools close over it. Binding the contract's own catalog-search and
  scene-spec *commands* is a different ticket and stays out of scope.
- **Answers are published material, unedited.** The tools select and return; they do not
  summarise, rank by an invented score, or add commentary. What they return is what the prefix
  would have shown, narrowed to what was asked for.
- **Tool docstrings are prompt text and are scanned.** The framework reads a callable's name,
  signature and docstring to build the declaration the model sees. `planner.agent` already records
  this for the draft-review tool. The full leak scan applies, and the docstrings speak the
  contract's vocabulary.
- **`reviews_drafts` generalises rather than acquiring siblings.** An author already says one thing
  about itself — whether it can call a tool while drafting — because instructions describing a tool
  an author does not hold describe a capability that will never answer. A third and fourth boolean
  is the wrong shape; what an author holds should be one answer. Whatever form it takes, an author
  written before these tools existed must still be a valid implementation of the seam.
- **`MODEL_CALLS_PER_ASK` is expected to move, and moves deliberately.** The rate line is enforced
  rather than reported, and the constant was chosen rather than measured — the only live Run on
  record used two calls. An author that searches, fetches two specs, reviews a draft and answers
  needs more than four. The number moves in this change, with the reasoning written down, and the
  line stays enforced. It is not removed.
- **The tool calls are recorded in the bundle.** Which tool, with what argument, how many times,
  per ask. This is the ticket's actual output: the measurement is the deliverable and the tools are
  the instrument.
- **Ordering against ticket 21.** That ticket binds an output schema alongside the draft-review
  tool. Adding two more tools does not change its argument, but whichever lands second inherits the
  combination, and the agent-construction test should assert all of them on one agent.

## Testing Decisions

The seams exist and have prior art. Nothing here needs a model or a credential.

**The tools, directly.** They are callables over a teaching surface, so the recorded contract
fixtures drive them. A search for a purpose the catalog serves returns the capabilities that serve
it; a search for one it does not returns nothing rather than a nearest guess. A specification
request returns exactly what the catalog publishes for that capability, and an unknown name is
answered as unknown rather than raised. The regression that matters: what comes back is
byte-identical to what the catalog published, because the moment a tool starts editing, the author
is reading a paraphrase.

**The agent, keylessly.** Building the agent is already the seam a machine with no credential can
reach, and already asserts the draft-review tool is bound. Extended: an author that holds these
tools has them all on the built agent, and an author that does not holds none — which is the
assertion that keeps a scripted Run's shape unchanged.

**The prefix.** A scripted author's instruction prefix is byte-identical to what it was, under the
test that already pins it. A tool-holding author's prefix differs by exactly the added sentence.
The leak scan passes over that sentence and over every tool docstring.

**The bundle.** The tool-call record appears for a Run whose author used them, and is empty rather
than absent for one that did not — the difference between "asked nothing" and "could not ask" is
the whole experiment and must be legible in a bundle.

**The measurement, which is the point.** Fixture Runs at n≥3, counting tool calls per Run, which
tools, and whether the plans differ in the capabilities and actions they reach for. No voice
credit. A single Run establishes nothing — the model is nondeterministic and this project already
has one unexplained n=1-against-n=1 swing on the record. The result is recorded whichever way it
falls; "the author ignored the tools" is a finding worth as much as the opposite and costs the
same to obtain.

## Out of Scope

- **Removing the catalog from the prefix.** ADR-0017. This ticket produces evidence for that
  argument and does not conduct it.
- **Binding the contract's catalog-search and scene-spec commands.** Those are production commands
  reached through the client, which the author may not hold. Still architectural, still deferred,
  and now with a cheaper experiment in front of it.
- **Any change to what the catalog publishes.** The tools read it as it is.
- **Adding a repair-time variant of these tools.** If they help authoring they presumably help
  repair, but a second measurement is a second ticket and this one should not carry two.
- **Deciding what the result means.** If the author never calls the tools, that is a finding and
  not automatically a reason to unbind them; if it calls them constantly, that is not automatically
  a reason to narrow the prefix. The numbers go to ADR-0017's argument.

**Blocked by:** None (can start immediately)

- [ ] An author can search the published catalog by what it is trying to do, and can request one capability's specification
- [ ] Both answer out of the teaching surface the crew already holds, with no client, service or network
- [ ] What they return is byte-identical to what the catalog publishes, asserted
- [ ] A search that matches nothing returns nothing, and an unknown capability is answered as unknown
- [ ] The catalog is still resident in the prefix, whole and unchanged
- [ ] A scripted author's prefix is byte-identical to what it was
- [ ] A tool-holding author's preamble names the tools, and no other author's does
- [ ] What an author holds is one answer about itself, and a pre-existing author is still a valid implementation
- [x] `MODEL_CALLS_PER_ASK` moves with its reasoning recorded, and the line stays enforced — **done by ticket 26**, see the amendment below
- [ ] The leak scan passes over the preamble sentence and every tool docstring
- [ ] The bundle records which tools were called, with what, and how often, and distinguishes "asked nothing" from "could not ask" **from the author's own answer rather than from the meter** — see the amendment below
- [ ] Fixture Runs at n≥3 are recorded, counting tool calls and comparing which capabilities and actions the plans reach for

---

## Amendment — ticket 26, 2026-08-30

Ticket 26 landed the returned line and settled two things this ticket had left open. Both are
recorded here so that whoever picks 24 up does not re-decide them.

**`MODEL_CALLS_PER_ASK` has already moved, from 4 to 7, and its derivation is written down.** It
is now `1 + TOOL_CALLS_PER_ASK`, and `TOOL_CALLS_PER_ASK` is six: the draft-review loop's three,
unchanged, plus the three this ticket names as the deepest an authoring turn reaches — a search,
and two specifications. The number is therefore derived from this ticket's own sentence rather
than chosen, which is what 26 required of it. Nothing here is left to move: if the tools this
ticket binds turn out to need a different sequence, the sequence is what changes and the constant
follows it.

**The meter does not distinguish "asked nothing" from "could not ask", and the bundle carries the
distinction from the author instead.** `planner._offered` builds a meter for every author,
tool-holding or not, so both cases leave it reading zero; that shape is kept, and the argument is
in `_offered`'s docstring. A meter answers what a turn *spent*, and both of those turns spent
nothing. Which kind of author it was is a fact the author already states as `reviews_drafts`, and
which `cache_prefix` already reads to decide what the prompt says — so the bundle reads it from
there. Teaching the meter a second question would have put one fact in two places and made the
derived one the place they disagree.

What that leaves this ticket to do: carry `reviews_drafts` — or whatever it generalises into, per
this ticket's own decision that what an author holds should be one answer — as far as the bundle,
which nothing does today. `AuthoredPlan` already carries `review_calls` and `reviewed` beside each
version and is the obvious place for it.

**Also worth knowing before starting, and read this part carefully — a first draft of it was
wrong.** The returned line is 30,000 characters per ask, derived from three answers at the size
the catalog publishes its largest specification at. But it is *checked against the Run's total*,
which is the shape ticket 26's third criterion required of it and the shape the fresh line
already had. So the line an author actually meets is `30,000 × plan_versions`, and
`repair_budget` never issues fewer than five plan versions — the smallest returned budget any
Brief gets is 150,000, against a catalog of 54,504.

What that means for the tools this ticket binds:

- **One turn may fetch all eight specifications and is not refused.** It is paid for out of the
  turns that fetched nothing, exactly as an expensive repair turn is. Three such turns fit a
  six-ask Run; the fourth ends it.
- So the line refuses a *habit*, not a single reach. An author that fetches the catalog once
  because it needed to is affordable; an author that re-fetches it every turn is the loop the
  line was written to name.
- The constraint on the search tool is therefore softer than it first looked, but it is real: a
  search that answers with full specifications rather than a narrowed result spends the Run's
  whole returned budget in three turns.

`test_one_turn_may_fetch_the_whole_catalog_and_a_run_that_keeps_doing_it_may_not` in
`tests/test_context.py` asserts all of this against a budget `repair_budget` actually issues,
rather than against the bare constant — which is what the first draft got wrong.
