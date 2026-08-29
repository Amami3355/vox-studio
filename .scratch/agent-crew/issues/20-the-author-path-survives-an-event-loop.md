# 20: The author path survives an event loop

Status: ready-for-agent

## Problem Statement

The live author reaches the model through two different concurrency models in the same eight
lines. The session is created with `asyncio.run(...)` around the session service's coroutine;
the turn is then driven by iterating the runner's *synchronous* generator. Both work today,
because the only caller is a CLI process that owns its process and has no event loop of its own.

Neither works from inside a running loop. `asyncio.run` refuses outright when a loop is already
running in the thread, and the runner's synchronous entry point exists by starting a loop of its
own, which is the same refusal one layer down. So the whole live authoring path is unreachable
from any async caller.

That is not a hypothetical caller. `client.py` is the deployment seam, and ADR-0015 records what
it is a seam *for*: one interface with a local implementation today and an HTTP one when
production moves to Cloud Run. A service handler is an async caller by construction. On the day
that implementation lands, the crew will discover that the seam it designed carefully for
deployment sits above an author that cannot be called from the thing it is deploying into — and
it will discover it in the change that is least able to absorb a rewrite.

The framework's own documented idiom is the async one. The synchronous entry point is the
convenience wrapper, not the interface, and the crew is using the wrapper in the one place where
it has a stated reason to expect a loop.

## Solution

Make the model-facing path async all the way down, and put exactly one synchronous shim at the
crew's edge, where the CLI needs one.

`_ask` becomes a coroutine that awaits the session and consumes the runner's asynchronous event
stream, reading the final response by the same means it reads it now. The `PlanAuthor` interface
is unchanged and stays synchronous: `author` and `repair` keep their signatures, and the shim
that runs the coroutine lives inside `AdkPlanAuthor` rather than leaking a second async
interface up through `converge`. Nothing above the seam learns that the framework has two
surfaces, which is the same rule `client.py` is held to and for the same reason.

The shim is written so that it is a shim — it runs the coroutine when there is no loop to run it
on, and an async caller can reach the coroutine directly rather than through it. That is what
makes the Cloud Run implementation a wiring change instead of a rewrite.

The framework publishes a way to run a turn against a fresh ephemeral session, which is exactly
what the current code assembles by hand from a session service and a create call. Whether the
Python surface offers it is a question this ticket answers by looking; if it does, the hand-rolled
session plumbing goes away with it.

## Implementation Decisions

- **`PlanAuthor` does not gain an async method.** Two methods per ask, one of them unused by
  every current caller, would put the framework's shape into an interface whose whole purpose is
  that nothing above it knows which implementation it holds. The async surface belongs to the
  live author, below the seam.
- **One shim, at the edge, and it is not `asyncio.run` scattered per call.** The current code
  calls `asyncio.run` for the session and not for the turn, which is what makes the mixed model
  hard to see. After this ticket there is one place where sync meets async and it is named.
- **The final response is still read by asking, not by concatenating.** The reasoning recorded
  in `_ask` — that with a tool bound the run yields intermediate turns, and joining every text
  part would splice the model's reasoning about a finding into the JSON — is unchanged and
  survives the move. The event stream is asynchronous; which event is the reply is decided the
  same way.
- **The session model does not change.** A fresh session per ask stays, deliberately, for the
  reasons `context.py` records. This ticket changes how a turn is driven, not how many sessions a
  Run opens.
- **The ephemeral-session helper is adopted only if Python publishes it.** If the framework's
  Python surface has no equivalent, the hand-rolled create stays and the ticket says so rather
  than reaching for the other language's API.

## Testing Decisions

The test that matters is the one that fails today: drive the author from inside a running event
loop and assert it completes. It needs no credential, because the seam that has to be exercised
is the concurrency boundary and not the model — a scripted runner substituted at the framework
boundary reaches it, and the existing keyless path already proves an agent can be built without
one.

The existing keyless assertions stay: an agent is built by the public seam, the tool is bound
onto it where one was offered, and the network sentinel in `conftest.py` still fails anything
reaching for egress.

What is *not* asserted is that a real model answers. That belongs to a fixture Run, and this
ticket changes no behaviour a Run would show.

## Out of Scope

- **The HTTP `ProductionClient`.** This ticket removes an obstacle in front of it and does not
  begin it.
- **Making `converge`, `producer` or the CLI async.** They are synchronous callers of a
  synchronous interface and stay that way.
- **Reusing a session across a Run's turns.** Considered in ticket 22 and rejected there.
- **Binding `output_schema`.** Ticket 21, which lands on the shape this ticket leaves.

**Blocked by:** None (can start immediately)

- [ ] The live author drives a turn through the framework's asynchronous surface, from the session to the final event
- [ ] Exactly one synchronous shim exists, inside the live author, and an async caller can reach the coroutine without it
- [ ] `PlanAuthor` is unchanged and gains no async method
- [ ] Authoring from inside a running event loop completes, under a test that fails before this change
- [ ] The final response is still identified by the framework's own answer to which event is the reply
- [ ] A fresh session per ask is unchanged
- [ ] The framework's ephemeral-session entry point is adopted if the Python surface publishes one, and the ticket records the answer either way
- [ ] The keyless assertions still hold and no test reaches the network

## Comments

**2026-08-28 — This ticket's session decision now has a ticket on the other side of it.**

Two of this ticket's commitments are in direct conflict with ticket 30, which was written after
it:

- Implementation Decisions: *"The session model does not change. A fresh session per ask stays,
  deliberately, for the reasons `context.py` records."*
- Out of Scope: *"Reusing a session across a Run's turns. Considered in ticket 22 and rejected
  there."*
- Acceptance: *"A fresh session per ask is unchanged."*

Ticket 30 proposes a session that spans a Run's turns, on a mechanism neither ticket 22 nor
ADR-0017 considered: `LlmAgent.static_instruction`, present in the pinned `google-adk 2.7.1`,
which carries the assembled surface as a literal system instruction while the per-turn material
moves to turn content. The relevance is that ticket 22's rejection rests on the trade being
*prefix identity versus a reachable cache* — and under `static_instruction` that trade dissolves,
because the static half cannot drift and the half that grows was never the thing being held
identical. Worth noting that `repair_plan` at `planner.py:1074` already does
`text = prefix.text + said`, so a repair turn today sends a different instruction string anyway;
what the crew holds is a shared opening, not an identical instruction.

**Nothing here says this ticket is wrong.** Its scoping was correct when written and its
reasoning about *how a turn is driven* is untouched. The point is only that "a fresh session per
ask is unchanged" is now a contested acceptance criterion rather than a settled one, and that
whichever of 20 and 30 lands second inherits the combination. Both touch the same eight lines at
`planner.py:1251-1290`.

**Suggested order, and why:** this ticket first. An async path is a prerequisite for a session
that outlives a call, not an alternative to it, and ticket 30 records the same preference in its
`Blocked by`. If it lands first, ticket 30 should amend the three lines quoted above rather than
leave them standing — a criterion ticked under one design and contradicted by the next is how a
ticket stops being readable as a record.

Also relevant: `.scratch/cloud-phase/issues/01-the-crew-is-hostable-and-adk-is-not-the-mechanism.md`
depends on this ticket and makes the session service *configurable* rather than replaced, which is
deliberately compatible with either answer here.
