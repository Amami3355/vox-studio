# ADR-0017 — The prefix is identical and the catalog goes whole, and that is a trade

**Status:** accepted · 2026-08-27
**Scope:** what the crew sends a model on every turn of a Run, and why it is the same bytes each
time. It changes no production command, no envelope and no schema. It says nothing about what the
contract publishes — only about what the crew does with it — and it does not reopen ADR-0012,
which governs what the catalog demonstrates.

## Context

The crew assembles one instructions prefix from the projections the contract index publishes, and
every turn of a Run is authored against that same object. The catalog is 56,486 characters of it,
47.6% of a 118,598-character prefix, and it goes in whole: `instructions` puts each category's body
in unsummarised, on the stated ground that *"a summary of a catalog is a description of
capabilities the model then cannot name correctly."*

Two properties follow, and only one of them has ever been written down.

The recorded one is that the prefix is **identical across turns**. `cache_prefix` is the only
place a prefix is built, and both the authoring turn and every repair turn read that same object,
so two call sites cannot drift about what "identical" means. This is asserted in the tests: a
scripted author's prefix is byte-identical at a fixed character count, which is what makes a
measurement taken before a change comparable with one taken after. Ticket 17's entire before-and-
after design rests on it.

The unrecorded one is the cost. The resident prefix is priced per model call — `context.Ask`
multiplies it by `model_calls` — so a Run that repairs twice sends the catalog three times. A
repair provoked by one code about one scene re-sends every capability in the catalog to fix it.
At three cycles that is upward of two hundred thousand characters of catalog, for a turn whose
subject is a single duration.

For a while the answer to that was caching. The prefix is identical, an identical prefix is what
a provider serves from a cache, and the bundle reported `cacheableChars` against a `cacheServed:
null`. That answer does not survive inspection: the live author opens a fresh runner and session
per ask, the framework's caching begins on a session's second turn, and no session here ever has
one. The saving is not unconfirmed, it is unreachable. Ticket 22 corrected the places that
implied otherwise: the bundle now reports `repeatedPrefixChars` — the prefix the turns after the
first re-sent, all of it transmitted — beside a `prefixCache` block whose `reachable` is `false`
and whose reason names this decision.

So the identical prefix currently buys **comparability and nothing else**, and the whole catalog
is paid for on every turn.

The alternative has been named repeatedly and never argued. The contract publishes catalog search
and scene-spec commands; binding them would let an author fetch the capability it is working on
instead of reading all of them. Three consecutive handoffs record those tools as unbound and
describe the reason as *"architectural, not wiring — it means replacing the flattened cached
prefix with on-demand lookups."* That sentence is correct and it is not a decision. It has been
carried as a deferral across enough sessions that each new one rediscovers the conflict from
scratch, which is precisely the failure ADR-0012 was written to stop happening to the plan
examples.

## Decision

**The prefix is identical across a Run's turns and the catalog goes into it whole. This is
chosen, it is paid for per turn, and what it buys today is measurement comparability rather than
a cache.**

The two halves are one decision and not two. A prefix cannot be byte-identical across turns and
also be narrowed to the capability a given turn is about; on-demand lookup and the identical
prefix are alternatives, not stages. Anyone changing either is changing both.

Three things follow that are binding rather than descriptive.

**The prefix is not narrowed to save budget alone.** A cost argument by itself is not sufficient
to break the identical prefix, because the property it would break is the one every before-and-
after measurement in this project depends on. What was measured under one prefix regime cannot be
compared with what is measured under another.

**No part of the codebase may claim the cost is recovered by caching.** Not in a bundle field,
not in a docstring, not in a commit message. The crew may report that its prefix is identical,
because that is observed. It may not report a saving no provider has told it about. Ticket 22
swept the existing claims; this ADR is why they do not come back.

**The deferral of the catalog tools is a consequence of this decision, not an oversight.** They
stay unbound because binding them means giving up the identical prefix, and that trade has not
been made. A session may make it, and must do so here rather than in a wiring commit.

## Considered and rejected

**Narrow the repair prefix only.** Authoring reads the whole catalog; a repair reads only the
capability it is fixing. This is the most tempting option and it is the one that breaks the
property most quietly: a Run whose first turn and second turn have different prefixes cannot be
compared with a Run of either shape, and the difference would not be visible in a bundle unless
someone thought to look. If the trade is made it is made for the whole Run.

**Summarise the catalog and keep the full body behind a lookup.** Rejected on the ground already
recorded in `instructions`: a model that reads a summary of a catalog cannot name its capabilities
correctly, and a wrong capability name is a refusal, which costs a repair cycle — the thing the
budget exists to protect.

**Wire the framework's context caching and keep everything else.** It does not engage: it starts
on a session's second turn and the author opens one session per ask. Reaching it means reusing a
session across a Run's turns, which `context.py` records as deliberate and costly to change, and
which ticket 22 rejects again beside the field it would clear.

**Keep deferring.** What this ADR replaces. The deferral is defensible; three sessions of it
without a written trade is how a project loses the reasoning and re-derives it worse.

## Consequences

The catalog is re-sent on every turn of every Run, and the budget in `context.py` prices it
honestly. That number is expected to be large and is not, by itself, a defect report.

Every before-and-after measurement in this project — ticket 17's Word-anchor counts at n≥3 either
side, the prefix census of ticket 23, the fixed byte count a scripted author's prefix is held to —
is valid only within one prefix regime. A change to this decision invalidates the comparison, and
any such change should say which measurements it is retiring.

### Amended 2026-08-27: production ticket 28 moved the prefix, and this is the disclosure

Ticket 28 stopped the catalog projection from republishing the checks document that the `checks`
category already publishes. Nothing about the film, the capabilities, the anchor forms or the check
meanings moved; what moved is how much of the contract the crew is handed. That makes it a new
prefix regime under the rule directly above, and the rule says such a change must name the
measurements it retires. Ticket 28 did not, and this paragraph is that omission being corrected
rather than a second decision.

**The figures in this ADR's Context were measured before the change and have been updated in
place.** What they said — "68,135 characters… roughly 52% of a ~125,000-character prefix" — is
retired. It was stale in two directions at once: the prefix had already moved, and the 52% counted
the checks document inside the catalog, where ticket 28 established it never belonged.

The current numbers, reproducible rather than asserted:

```
services/agents/.venv/Scripts/python.exe -c "import sys; sys.path[:0]=['src','.','tests'];   from tests.test_planner import SURFACE; from vox_crew.planner import cache_prefix;   print(cache_prefix(SURFACE).chars)"     # 118,598 — the assembled prefix
```

The catalog is 56,486 of that, or 47.6%. Ticket 28's commit reports 126,927 → 117,332 for the same
change; that figure counts the five contract bodies as the `contract show` envelopes deliver them,
where this one counts the prefix `cache_prefix` actually assembles, framing included. Both are
post-ticket-28 measurements of slightly different objects and neither supersedes the other — but a
later session comparing against either must say which, because the 1,266-character gap between them
is larger than some of the changes anyone would be measuring.

These two numbers are no longer taken by hand. Crew ticket 23 built the instrument, and
`services/agents/prefix-census.md` — rewritten on every `pytest` run — is where they are read
from now, at this ADR's boundary. The 56,930 and 48.0% this paragraph carried until then were
themselves stale, by 444 characters: they predated ticket 17's description fixes, and no one
would have known. That is the argument for the census, made against this ADR's own text.

**What is retired, explicitly.** Any prefix-size or catalog-share figure taken before `b0987b5`.
That includes this ADR's own two numbers, `teaching_surface.py`'s module docstring, and ticket 17's
"the catalog projection is 52% of the prefix". Ticket 17's *Word-anchor counts* are not retired:
they count anchors in a plan, not characters in a prefix, and nothing about this change touches
what an anchor is. Ticket 23's prefix census has not been taken yet and should be taken against the
current regime, which is the reason it is worth taking at all.

Binding the catalog search and scene-spec tools now has a place to be argued. The evidence that
would justify it is a Run economics argument with numbers on both sides: what the repair turns
actually cost against what a targeted lookup would cost, including the refusals a model makes when
it cannot see a capability it did not think to ask for.

The identical prefix remains eligible for provider-side caching if the session model ever changes.
That is a reason not to abandon the property casually. It is not a reason to report a saving, and
this ADR is the record that the two were once confused.

### Amended 2026-08-30: crew ticket 25 moved the prefix again, and this is that disclosure

Ticket 25 gave the contract index an `audience` field per category and split `protocol` into the
command surface an author cannot operate and the `operating` rules it authors against. The crew
assembles the categories addressed to an author, which is every category it was assembling before
except `protocol`. **This decision is not reopened and the catalog did not move**: it goes in
whole, resident, identical across turns, and its 56,486 characters are byte-identical either side,
asserted directly rather than inferred from a total. What changed is what sits beside it.

It is nonetheless a new prefix regime under the rule above, so the measurements it retires are
named here rather than left to be discovered.

**Retired: every prefix-size and category-share figure taken before this change** — which is to
say every figure denominated at the 118,598-character boundary, including this ADR's own Context
and Amendment text above, ticket 23's census record, ticket 22's `residentChars`, ticket 19's
"118,598-character prefix", the three figures in ticket 27 — which is open and unlanded, so it is
the one a reader will take as current — and the spec's 118,598 / 119,266 pair, which is updated in
place rather than left to be caught by this clause. The character counts of
individual *bodies* are not retired: the catalog is still 56,486 and the checks still 9,660,
because nothing about those documents moved. What is retired is every *share*, since the
denominator changed.

**Not retired:** ticket 17's Word-anchor counts, for the reason the amendment above gives, and
because the census confirms the anchor tallies are unchanged — 40 boundary anchors over 19
statements and 12 word anchors over 6, either side. A category that had no anchors in it left.

The numbers, from the instrument rather than by hand — `services/agents/prefix-census.md`,
rewritten on every `pytest` run:

| | before | after |
|---|---|---|
| the assembled prefix | 118,598 | **95,503** |
| the catalog | 56,486 (47.6%) | 56,486 (**59.1%**) |
| `protocol` | 24,195 (20.4%) | not sent |
| `operating` | — | 1,100 (1.2%) |
| content carried more than once | 12,754 (10.8%), 54 repeats | 5,056 (5.3%), 41 repeats |

**What it buys, as a capability count rather than as a character saving.** The resident line is
150,000 and the catalog is what walks a prefix into it, so the honest unit is how many
capabilities fit. Measured by cloning capabilities into the recorded catalog and asking
`cache_prefix`: **the wall moves from eleven capabilities to fifteen.** Eleven fit before at
141,537 and twelve did not at 151,456; fifteen fit now at 144,335 and sixteen does not at 150,085.
That is four capabilities of runway, and it is runway rather than a fix — tickets 27 and 28 are
the fix, and this is what buys them time to be built properly.

## References

- ADR-0012 — examples illustrate, refusals teach. Governs what the catalog demonstrates; this ADR
  governs how much of it is sent and how often. Neither reopens the other.
- ADR-0015 — the deployment seam is the crew client. The session model this decision depends on
  sits below that seam.
- Ticket 22 — removes the claims that the per-turn cost is recovered by caching.
- Ticket 23 — the prefix census, which is one of the measurements this decision keeps comparable.
- Ticket 25 — the audience field, and the disclosure amendment above. It narrows what sits beside
  the catalog and leaves the catalog itself untouched, which is why it amends this decision rather
  than reopening it.
- ADR-0016 — the author seam carries payloads and tools and nothing that locates anything. It is
  the argument for which categories an author can act on at all.
