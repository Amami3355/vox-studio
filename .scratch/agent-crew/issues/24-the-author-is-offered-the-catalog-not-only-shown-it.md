# 24: The author is offered the catalog, not only shown it

Status: ready-for-agent

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
- [ ] `MODEL_CALLS_PER_ASK` moves with its reasoning recorded, and the line stays enforced
- [ ] The leak scan passes over the preamble sentence and every tool docstring
- [ ] The bundle records which tools were called, with what, and how often, and distinguishes "asked nothing" from "could not ask"
- [ ] Fixture Runs at n≥3 are recorded, counting tool calls and comparing which capabilities and actions the plans reach for
