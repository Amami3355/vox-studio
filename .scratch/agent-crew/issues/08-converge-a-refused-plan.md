# 08: The producer converges a refused plan

**What to build:** Handed a refusal, the producer reads the `means`, `repair` and `next`
fields the interface already publishes, acts on them, and resubmits — converging on an
acceptable plan without human hand-holding. Before recording, it consults Preflight, so
duration mistakes are caught while they are still advisory.

The refusals are the teaching surface here. The crew's instructions must not paraphrase
what a refusal already says; the agent is expected to act on the envelope it was given,
including any repair the refusal names explicitly.

Repairs are take-preserving by preference. Once a Take exists, reassigning or merging
Beats is preferred over rewriting Beat text, because a lazy text edit invalidates a Take
that was expensive to record. This is asserted behaviour, not a hope expressed in a
prompt.

Convergence has a budget. The repair cycles a Brief is allowed scale with the duration
the Brief asks for, never with anything the agent chooses, and exhausting the budget is
a reported outcome rather than an endless loop.

**Blocked by:** 07 (The producer agent authors a plan from the teaching surface)

**Status:** ready-for-agent

- [ ] A refused plan is repaired from the refusal's own fields and resubmitted
- [ ] Preflight is consulted before any recording is attempted
- [ ] After a Take exists, repairs prefer Beat reassignment or merging over rewriting Beat text
- [ ] Convergence stays inside the repair budget for the Brief's target duration
- [ ] An exhausted budget is reported as an outcome, not an infinite loop
- [ ] Crew instructions do not restate what refusals already teach
