# 14: The teaching surface is cached, and the budget is a number

**What to build:** The crew reads the catalog once and keeps it in a cached prefix across
the repair loop instead of re-sending it every turn, and the spec's placeholder budget is
replaced by a figure measured against a real run.

The five projections total roughly 220 KB of JSON. Selective fetching does not solve
this, and the reason is worth stating in whatever this ticket leaves behind: the catalog
is the planner's primary authoring input — capability names, actions and anchors all live
there and nothing can be written before it is read — so the dominant term is the one item
that cannot be deferred. Fetching the smaller categories lazily saves a fraction and
leaves the problem. Caching is the lever.

The budget must come from measurement. A complete run through the harness is what it is
measured against, which is why this ticket sits after that run exists rather than being
guessed at the start. Whatever number comes out replaces the placeholder in the spec, and
the review decision that set it gets the real figure written back.

Behaviour must not change. The crew reaches the same plans and the same outcomes; only
what it re-sends changes.

**Blocked by:** 12 (The end-to-end crew test through the proof harness)

**Status:** ready-for-agent

- [ ] The catalog is read once and reused across the repair loop rather than re-sent per turn
- [ ] Token and rate consumption for a complete run is measured and recorded
- [ ] The measured figure replaces the placeholder budget in the spec
- [ ] The crew stays inside that budget for a full showcase run
- [ ] Run outcomes are unchanged by the caching
- [ ] Exceeding the budget is a reported outcome rather than a silent overrun
