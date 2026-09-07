# 03: The Research Agent that plans the inquiry

**What to build:** The role half of research. An agent that reads a factual Brief, decides what
questions it needs answered, calls the provider-neutral research tool with those questions, and
interprets what comes back into a Research dossier. Today the tool half exists and there is no
agent above it.

## The gap

The spec separates the two halves and asks for both:

> **Research is one agent with one provider-neutral tool.** The Research Agent plans the inquiry
> and interprets results. The research interface hides authentication, request formatting,
> polling, retry behavior, and Parallel-specific response shapes. (spec.md:197)

> 31. As a Research Agent, I want to decide which questions a factual Brief needs answered … rather
> than a fixed query list.

What is implemented is the *interface* clause, completely and well. What is missing is the agent.
`ParallelResearchAdapter.research` (`services/agents/src/vox_crew/parallel_research.py:171-196`)
posts `brief.text` verbatim as Parallel's `input`, hands it a JSON output schema, and validates
the reply into a `ResearchDossier`. Nothing plans an inquiry; the Brief *is* the query.
`adk_roles.py` defines Narrative, Art Director, Structurer and Scene Author — and no research role.

Correct and not to be disturbed while fixing this: the dossier contract, the two adapters from
the first commit, the zero-call path for fiction and test data, and the no-retry rule on a call
that may have been paid for.

## Why this is a ticket and not a patch

**A Brief posted verbatim is not obviously worse, and nobody has measured it.** Parallel's `core`
processor does its own decomposition. Interposing an agent that rewrites one Brief into several
questions adds a model call, adds a failure mode, and may return *less* than handing the
provider the whole Brief. The spec's reason for wanting the agent is control — the crew choosing
the inquiry rather than inheriting a vendor's — and that is a real reason, but it is a design
argument that should survive contact with a measurement before it becomes code.

So this ticket's first move is not implementation:

- Run the same factual Brief both ways against the recorded adapter and, once, live. Compare the
  dossiers on what actually matters downstream — sourced claims, statistics, contradictions,
  visual opportunities — not on volume.
- Decide whether the agent plans questions, or plans *and* re-queries on a thin dossier. The
  second is a research budget, and budgets are ticket 02's subject; do not acquire one here by
  accident.

**And it spends.** A research role is a live model call per Run in a phase that currently makes
none. `OperatorPolicy` gates research provider access, not the crew's own reasoning about it.

## Not in scope

**Catalog serviceability.** The spec is explicit that this is not the Research Agent's question:

> Whether available SceneCapabilities can express the Brief is decided by visual planning and
> validation; the Director turns that evidence into a Decline when appropriate. This narrows the
> older researcher ticket's mixed responsibility deliberately. (spec.md:210-212)

That path now works: the Visual Structurer emits an `unservable` finding and the Director
publishes a Decline. Do not let a research role acquire an opinion about it.

**Status:** done

## What was built, and what was decided

`AdkResearchAgent` wraps the research tool: it plans questions from the Brief, and the tool
executes them. `ParallelResearchAdapter.research` gained an `inquiry` parameter; the questions
**travel with** the Brief rather than replacing it, because a provider given only a decomposition
loses the framing that produced it.

- **Verbatim versus planned:** not resolved by measurement, and deliberately not gated on one.
  The design is built so the comparison stays cheap and reversible — an empty inquiry sends
  exactly the bytes the old path sent, and a test pins that. A live A/B is still worth running
  before the 9th; nothing depends on it first.
- **A budget was not acquired.** The agent plans once and does not re-query on a thin dossier.
  Re-querying is a research budget and belongs with 02's reasoning, not here.
- **Interpretation stayed with the tool.** The agent plans the inquiry and returns the tool's
  schema-validated dossier unchanged. A model permitted to rewrite claims, sources or support
  values could produce a sourced-looking statement no source made.
- **A bad plan degrades, it does not fail.** A malformed or failed planning turn falls back to the
  bare Brief — the previous behaviour — rather than costing the Run a phase that has not spent yet.
- The agent is installed only when the model roles are live: planning is itself a model call, and
  a run pinning recorded models has said it does not want one.

- [ ] The verbatim-Brief and planned-inquiry paths are compared on dossier substance before either is chosen — **not done.** The comparison needs a live provider call and was not run. The bare-Brief path is preserved byte for byte and pinned by a test, so this stays cheap to run and cheap to reverse.
- [x] If the agent lands: a named `CrewRole`, visible in phase events, above the existing tool interface
- [x] The research interface keeps hiding auth, formatting, polling, retry and Parallel response shapes — the agent sees none of them
- [x] Crew code still never branches on which adapter it holds
- [x] The zero-call path for fiction and test data still observes exactly zero calls, decided before the tool is reachable
- [x] A call that may have been paid for is still never retried
- [x] The role acquires no view on catalog serviceability
- [x] Whatever the role spends is authorised by something an operator sets
