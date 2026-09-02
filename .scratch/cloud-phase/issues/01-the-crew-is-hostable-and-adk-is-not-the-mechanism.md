# 01: The crew is hostable, and the framework's deploy command is not the mechanism

Status: out-of-scope

**Closed 2026-09-02 as out of scope for this phase, not cancelled.** The scope cut taken on day one
keeps the crew local and drives the remote service from a checkout, which buys back two days out of
a seven-day plan that had no slack. This is the spec's own decision 5 first milestone rather than a
retreat. What is lost is the "no local checkout in the path" half of ticket 09's first criterion, and
nothing else — the run store, the render and the four production secrets are all still off the
operator's machine.

Blocked by crew-20, which is out of scope with it. Reopen both as a fresh effort if the destination
is redrawn; the argument below did not stop being right. See `map.md`.

## Problem Statement

This spec's decision 5 defers one question and does not describe it: *"the separate question of
where an ADK crew is hosted and how it obtains a model credential"* is *"a later milestone in
this spec's scope but not its first."* The deferral is right. What is missing is any account of
what that milestone actually contains, and the answer turns out to be small, cheap, and mostly
already blocked on one crew ticket — which makes carrying it as an unexamined "later" more
expensive than writing it down.

**The obvious answer is wrong and should be refuted here rather than discovered later.** The
framework publishes deployment commands — `adk deploy cloud_run` and `adk deploy agent_engine`,
plus a programmatic path through `client.agent_engines.create(agent=app, …)`. The reasonable
assumption is that the crew is one command away from being hosted. It is not, and the reason is
structural rather than a matter of missing wiring.

**What those commands deploy is an ADK app**: a directory containing an `agent.py` that exposes a
`root_agent`, served behind a FastAPI entry point. The crew is not one. It is a Python CLI —
`vox-crew = "vox_crew.cli:main"` — that orchestrates discovery, authoring, production and
convergence, and reaches the framework for exactly one step inside `AdkPlanAuthor`. There is no
`root_agent` anywhere in `services/agents/src`, no `SequentialAgent`, no `ParallelAgent`, no
`AgentTool`; `pyproject.toml` states the relationship outright, that `LlmAgent` and
`InMemoryRunner` *"are the crew's only contact with the framework."* `adk deploy` has nothing to
point at, and making it point at something would mean restructuring the crew into an agent tree —
which is a much larger proposal and is argued against below.

**What does block hosting is three specific things, none of which needs the deploy command.**

**1. The model-facing path cannot run inside a web server.** `AdkPlanAuthor._ask`
(`planner.py:1251`) calls `asyncio.run` around session creation and then iterates the runner's
*synchronous* generator. Neither works from inside a running event loop, and every request
handler in every hosting target is one. Crew ticket 20 already states this and states the
consequence: the crew *"will discover that the seam it designed carefully for deployment sits
above an author that cannot be called from the thing it is deploying into — and it will discover
it in the change that is least able to absorb a rewrite."*

**2. Sessions are in-memory and nothing has decided they should not be.** `_ask` builds an
`InMemoryRunner` per call, whose session service holds state in the process. A hosted service
recycles instances and runs more than one; the framework's own guidance for production points at
a persistent session service instead. Nothing in the crew has ever needed to care, because the
only caller has been a CLI that owns its process.

**3. The framework is an optional extra.** `pyproject.toml` carries it as
`agents = ["google-adk>=2.7.1,<3"]`, deliberately, so that *"a bare `pytest` needs no network
install."* That property is worth keeping for tests and is wrong for a deployment artifact, which
must install the framework as a real dependency. Nothing today says which shape a hosted crew
ships as.

Everything else is already in order and should be stated so that nobody re-does it. `client.py`
is payload-shaped in both directions and `fetch_artifact` takes a Run id and a descriptor rather
than a path — ADR-0015's migration (b), already paid. Filesystem knowledge appears only in
`cli.py` and `evidence.py`, both at the crew's own edge rather than on the model-facing path. The
Windows-specific machinery lives behind `LocalProductionClient`, which is exactly where the seam
puts it.

## Solution

Make the crew hostable as an ordinary containerised service that happens to use the framework
internally, rather than as an artifact of the framework's deploy command.

Three changes, in order:

**The model-facing path becomes async all the way down.** This is crew ticket 20 and is not
re-specified here. This ticket depends on it and should not begin before it.

**The session service becomes configurable, with the in-memory one as the local default.** The
crew names what it wants; the implementation supplies it. A hosted crew is given a persistent
one, a local Run keeps what it has, and nothing above `AdkPlanAuthor` learns which is active —
the same rule `client.py` is held to, applied one layer down.

**The crew ships as a container with an entry point that is not the CLI.** The CLI stays what it
is. Beside it, a request-shaped entry point takes a Brief and returns a Run's outcome, obtains
its model credential from the environment its identity was given, and holds the framework as a
required dependency rather than an extra.

None of that touches an agent, an instruction, a prompt, a contract or a recorded fixture.

## Implementation Decisions

- **The crew does not become an agent tree, and this is the load-bearing decision.** Rebuilding
  the roles as `SequentialAgent` sub-agents with the repairer behind an `AgentTool` would make
  `adk deploy` work directly, and it is genuinely tempting once crew tickets 27 and 28 split the
  author into roles. **It is rejected because the crew's deliverable is the evidence bundle, not
  the plan.** The repair budget, the recording quota, the context spend lines and the leak gate
  are enforced by Python that sits above every model call: `converge` decides how many plan
  versions a Run may ask for, `context.overrun` decides which line a Run passed, and
  `author_plan` refuses a prompt that leaks before an author is asked anything. Handing control
  flow to the framework's orchestration puts a third party between the crew and its own
  accounting, and *"the crew could not promise this number because the framework made the call"*
  is an unacceptable sentence in a system whose product is auditability. If that trade is ever
  made it needs its own ADR, and this ticket is the record that it was considered and declined.
- **`adk deploy` is not used, and the reason is written down rather than left as an omission.**
  A future session will find those commands and ask this question again. The answer is in the
  Problem Statement above and belongs in the repository rather than in a handoff.
- **The session service is named by the crew and supplied by configuration.** Not selected by
  branching on an environment variable inside `_ask`, which would put deployment knowledge in the
  model-facing path — the precise thing ADR-0015 decision 1 forbids one layer up.
- **The in-memory session service stays the local default and stays the tested one.** A hosted
  crew is not the common case and must not become the only exercised case.
- **The framework stays an optional extra for the library, and is required for the deployment
  artifact.** These are two different packaging questions with two different right answers, and
  conflating them would cost the bare-`pytest` property `pyproject.toml` protects on purpose.
- **Nothing about the production client changes.** This ticket is the crew's own hosting. It does
  not begin `HttpProductionClient`, it does not depend on it, and a crew hosted against a local
  production service is a legitimate intermediate state — useless, but correct, and useful for
  proving the hosting works before the service has moved.
- **This is not the first cloud milestone, and it is not blocked by one either.** Decision 5 puts
  the local crew driving a cloud service first, and that ordering stands as a *delivery* choice.
  Technically this ticket is independent of every payload-surface ticket in this spec and can land
  at any point; landing it early is cheap and removes the rewrite ticket 20 warns about.

## Testing Decisions

**The test that matters is the one that fails today**, and crew ticket 20 already names it: drive
the author from inside a running event loop and assert it completes. It needs no credential, and
it is the assertion this whole ticket exists behind.

**The session service is substitutable, asserted keylessly.** A crew configured with a stand-in
session service uses it, and one configured with nothing uses the in-memory default. Building the
path is already the furthest a machine with no credential can follow, and it is far enough to
assert this.

**No agent, instruction, prompt or recorded fixture moves.** The assembled prefix is byte-identical
before and after, under the test that already pins it. This is the assertion that keeps a hosting
change from becoming a prompt change.

**The container starts and answers, without a model.** A build-and-boot check that the entry point
comes up and rejects a malformed request. What it must not do is reach a model, a service or the
network in CI — `conftest.py`'s network sentinel applies unchanged.

**The existing suite runs without the framework installed.** The bare-`pytest` property is
re-asserted after the packaging change, because it is the one this ticket is most likely to break
by accident.

**No test learns which session service or which hosting shape is active.** Structural, like the
tests that already assert no path-shaped parameter names on the client.

## Out of Scope

- **Restructuring the crew into an agent tree.** Rejected above; needs its own ADR if ever
  revisited.
- **`HttpProductionClient` and the payload surface.** This spec's other tickets.
- **Choosing a cloud vendor, a runtime or a region.** This ticket makes the crew hostable; where
  it is hosted is provisioning.
- **The model credential's storage.** Decision 8 already places it in a managed secret store and
  says neither side holds the other's secret. This ticket reads a credential from the environment
  its identity was given and does not decide how it got there.
- **Making `converge`, `producer` or the CLI async.** Crew ticket 20's Out of Scope, unchanged.
  They are synchronous callers of a synchronous interface.
- **Multi-tenancy or a public entry point.** The caller is the operator, per this spec.

## Further Notes

**There is a conflict between two crew tickets that this one surfaces and does not resolve.** Crew
ticket 20 says *"the session model does not change. A fresh session per ask stays, deliberately."*
Crew ticket 30 needs a session that spans a Run's turns, because the framework's context cache
never engages on a single-turn session. Both cannot hold. Whichever lands second inherits the
combination, and this ticket's configurable session service is compatible with either answer —
which is the argument for it being configurable rather than replaced.

**The framework's version constraint reaches into this.** `pyproject.toml` excludes the next major
on the stated ground that `LlmAgent` and `InMemoryRunner` *"are the crew's only contact with the
framework and are exactly what a major version is free to reshape."* Adding a session service
widens that contact surface by one type, and the comment should be updated to say so rather than
left describing a narrower dependency than the crew has.

**Blocked by:** `.scratch/agent-crew/issues/20-the-author-path-survives-an-event-loop.md`

- [ ] The model-facing path is async and reachable from inside a running event loop
- [ ] The session service is configurable, named by the crew and supplied by configuration
- [ ] The in-memory session service remains the local default and stays exercised
- [ ] Nothing above `AdkPlanAuthor` learns which session service is active, asserted structurally
- [ ] A request-shaped entry point exists beside the CLI and obtains its credential from the environment
- [ ] The deployment artifact requires the framework; the library keeps it as an optional extra
- [ ] The existing suite still runs with the framework not installed
- [ ] The assembled prefix is byte-identical before and after, and no fixture, instruction or contract moves
- [ ] The container builds, boots and rejects a malformed request, reaching no model or network in CI
- [ ] The decision not to restructure the crew as an agent tree is recorded with its reasoning
- [ ] The framework version constraint's comment is updated for the widened contact surface
