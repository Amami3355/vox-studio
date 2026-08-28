# 14: The teaching surface is cached, and the budget is a number

**What to build:** The crew reads the catalog once and keeps it in a cached prefix across
the repair loop instead of re-sending it every turn, and the spec's placeholder budget is
replaced by a figure measured against a real run.

**Amended, ticket 22.** "Keeps it in a cached prefix … instead of re-sending it every turn" is
not what was built, and not what was available to build. The catalog is assembled once and
re-sent in full on every turn; what the identical prefix buys is comparability, not a smaller
bill. The budget half of this ticket stands as measured. Recorded as ADR-0017.

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

**Status:** done, with the fourth criterion carried to 15 — see below

- [x] The catalog is read once and reused across the repair loop rather than re-sent per turn
- [x] Token and rate consumption for a complete run is measured and recorded
- [x] The measured figure replaces the placeholder budget in the spec
- [ ] The crew stays inside that budget for a full showcase run
- [x] Run outcomes are unchanged by the caching
- [x] Exceeding the budget is a reported outcome rather than a silent overrun

## What the fourth criterion actually got, and why it is not ticked

**A bound, not a run.** `services/agents/tests/test_context.py` constructs the worst turn a
showcase Brief can reach — six plan versions from the real `repair_budget`, the resident prefix
assembled from the recorded projections, the largest refusal the fixtures hold, and a
showcase-sized plan handed back — and asserts no overrun. Every term but two is measured from
material the build already pins; the Brief's length and the plan's size are named constants with
their provenance, because they live on the TypeScript side.

That is the strongest free evidence there is, and it is not what the criterion says. A live
showcase run is **ticket 15's**, and it has to be: 15 is blocked on this ticket's measured
figure, so a criterion here that required 15's run would be circular. The tick belongs there.

**One thing 15 must also read.** The crew's side of caching is an identical prefix, which is the
*precondition* for a provider serving one — not evidence that it did, and nothing here reports
it as such (`cacheServed` is `null`, and the bundle carries a non-claim). ADK's
`ContextCacheConfig` cannot engage as the crew is built: it starts caching on a session's second
turn and `AdkPlanAuthor` opens a fresh session per ask. So the mechanism available is Gemini's
implicit prefix caching, and `usage_metadata.cached_content_token_count` on the first live Run is
the only thing that can confirm it. Spec decision 3 records this in full.

**Amended, ticket 22 — this paragraph is superseded and its reading is discharged.** There was no
eligibility for a live Run to confirm: every session the crew opens is single-turn, which is
never cached, so that count could only ever have come back zero. `cacheServed` no longer exists
either — the bundle publishes `prefixCache.reachable: false` with the reason beside it, and
`cacheableChars` is now `repeatedPrefixChars`, the prefix the turns after the first re-sent.
Ticket 15 closed without this reading. Spec decision 3 records the amended account.
