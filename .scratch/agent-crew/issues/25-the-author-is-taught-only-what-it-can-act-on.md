# 25: The author is taught only what it can act on

Status: done

## Problem Statement

A fifth of every prompt the crew sends is instructions about a machine the author is
structurally forbidden from operating.

The `protocol` category is **24,195 characters of the 118,598-character prefix — 20.4%**, the
second-largest thing the author reads after the catalog. Measured over the recorded fixtures, at
the body boundary, it divides like this:

| key | characters |
|---|---|
| `schemas` | 19,407 |
| `commands` | 2,649 |
| `recording` | 368 |
| `preflight` | 317 |
| `repair` | 294 |
| `lifecycle` | 231 |
| `resume` | 200 |
| `transport` | 190 |
| `writeBoundary` | 180 |
| `exitCodes` | 126 |

ADR-0016 is why almost none of it can matter. **The author seam carries payloads and tools and
nothing that locates anything**, on the stated ground that *"an author holding a client could
issue commands the crew never authorised and the bundle never sees."* An author therefore cannot
issue a command, cannot read an exit code, cannot resume a Run, cannot observe a transport and
cannot write inside a boundary. `producer.py` and `converge.py` do all of that, and they are
code — they read no prompt and are taught nothing.

So `schemas` alone is **16.4% of every turn's prompt**, describing envelope shapes for commands
the reader is incapable of sending. It is also where the largest single repeat in the whole
prefix lives: ticket 23's census reports 5,146 characters duplicated inside `protocol`, where
`schemas.preflightReport.properties` and
`schemas.commandData.run.preflight.properties.report.properties` are byte-identical. The crew is
paying twice, on every turn, for a schema its author cannot use once.

**This is not a case the crew can fix on its own side, and that is the whole difficulty.**
`instructions` assembles every category the index publishes, in the index's order, whole. That
rule is load-bearing: it is what makes a category the contract adds a category the crew teaches
with no edit, and it is the same rule ticket 23 obeyed when it reported duplication rather than
eliding it. A consumer that decided which projections were worth reading would be a consumer
with an opinion about the contract, and the next contract change would find the crew silently
teaching a stale subset.

The deadline is real. The resident line is 150,000 characters and the catalog breaks it at
**twelve capabilities** — measured, by cloning capabilities into the recorded catalog and asking
`cache_prefix`: 8 today at 118,614, 11 at 141,317, 12 at 151,230, which is
`ContextBudgetExceeded`. That exception is *raised*, not reported as a Run outcome, so the
twelfth capability is not a degraded Run but no Run at all.

## Solution

**The contract says who each category is for, and the crew reads the ones addressed to it.**

The index currently publishes `{ id, summary }` per category — `generate.ts:124`, against a
`.strict()` schema at `schemas.ts:222`. It gains a third field naming the audience: what a
category teaches is already published, and who it is published *to* is the fact the crew is
currently guessing at by reading everything.

The crew then assembles the categories addressed to it, and its assembly rule is unchanged in
the way that matters — it still adds no opinion of its own, still reads whatever it is handed,
still teaches a new category with no edit. What moves is that the interface, which owns the
contract, decides its readership, rather than a consumer deciding it does not need something.

**The split is expected to fall inside `protocol`, not around it.** `repair` (294) publishes the
duration repair rule that production ticket 24 decided, and `preflight` (317) describes a report
an author reads in a refusal. Both are plausibly author-facing. `schemas`, `commands`,
`transport`, `exitCodes`, `writeBoundary`, `resume` and `lifecycle` are not. Whether the audience
field is granular enough to express that, or whether `protocol` splits into two categories, is
the design question this ticket answers — but it must not be answered by assuming the whole
category goes.

## Implementation Decisions

- **The audience is published, not inferred.** The crew must not pattern-match category ids, keep
  a list of the ones it wants, or read a summary and decide. Every one of those is the crew
  holding an opinion about the contract in a place the contract cannot see. The field is read and
  obeyed, and a category with no audience field is read — an older contract must still work.
- **This is a cross-repository change and the production half is a sibling ticket.** The index
  schema, the audience values and any split of `protocol` live in `packages/production/src/
  contracts`. This ticket is the crew's half plus the argument; it should not land alone, and the
  recorded fixtures must be re-recorded together with it.
- **ADR-0017 is not touched and must not be read as touched.** That decision governs the
  *catalog*: whole, resident, identical across turns. Nothing here narrows, tiers or defers a
  capability. The catalog is byte-identical before and after.
- **It is a new prefix regime, and ADR-0017's disclosure rule applies.** *"A change to this
  decision invalidates the comparison, and any such change should say which measurements it is
  retiring."* Production ticket 28 moved the prefix without doing that and had to be corrected in
  an amendment. This ticket does it in the commit, and the census is taken either side.
- **What this buys is headroom, and it is named as headroom rather than as a fix.** Removing
  `schemas` alone takes the prefix to roughly 99,200 characters, which at the measured 8,154 mean
  per capability moves the wall from twelve capabilities to fourteen or fifteen depending which
  arrives. That is two or three capabilities of runway. Tickets 27 and 28 are the fix; this is
  what buys them time to be built properly.
- **The duplication inside `protocol` is production's to remove and is not this ticket's
  business.** If `schemas` leaves the author's prefix, the crew stops paying for the repeat
  whether or not it is ever deduplicated. The census keeps reporting it either way.

## Testing Decisions

**The crew reads the audience.** Over recorded fixtures carrying the field, the assembled prefix
contains exactly the categories addressed to the author and no others, and the category order is
still the index's.

**An older contract still works.** A fixture index with no audience field yields the prefix it
yields today, byte for byte. This is the assertion that keeps the change from being a flag day.

**The assembly rule is intact.** A fixture that publishes a *new* category addressed to the author
is taught with no edit to the crew — the existing property, re-asserted at the new boundary,
because the risk of this change is precisely that filtering hardens into a list.

**The census accounts for the new prefix.** Ticket 23's instrument sums the parts to the whole and
reports every category; it must do so under the reduced set, and the record is committed either
side so the diff is the measurement.

**Nothing about the catalog moved.** The catalog's contribution to the prefix is byte-identical
before and after, asserted directly rather than inferred from the total.

**The leak scan still passes** over the reduced prefix, and the reduced prefix still contains
every anchor form the published time vocabulary carries — a category dropped is not allowed to
take the anchor grammar with it.

## Out of Scope

- **Any tiering of the catalog.** Choose-tier and compose-tier are ticket 28. The catalog goes in
  whole here.
- **Deduplicating `protocol.schemas`.** Production's, and moot for the crew if the audience field
  lands.
- **Deciding what a balanced prefix looks like.** Ticket 23 refused to encode an unargued ratio
  and that refusal stands. This ticket removes material on the ground that its reader cannot act
  on it, which is an argument about capability, not about balance.
- **Splitting the crew into roles.** Tickets 27 and 28. This ticket has one author reading a
  smaller prefix.

## Further Notes

**Why this is first.** It is the only cut available that costs no architecture. Tickets 27 and 28
both change what an agent *is*, and both collide with ADR-0017 in ways that need an ADR before
they need code. This one removes material the author was never able to use, leaves every other
property standing, and is reversible by publishing a wider audience.

**Blocked by:** None (can start immediately; needs its production sibling to land with it)

- [x] The contract index publishes an audience per category, and the crew reads it
- [x] The crew assembles the categories addressed to it and adds no list, guess or pattern of its own
- [x] A contract publishing no audience field yields today's prefix byte for byte
- [x] A new category addressed to the author is taught with no edit to the crew
- [x] The catalog's contribution to the prefix is byte-identical before and after, asserted
- [x] The census accounts for the whole reduced prefix, and records are committed either side
- [x] The commit names which measurements the new prefix regime retires, per ADR-0017
- [x] The leak scan passes and every published anchor form still appears in the prefix
- [x] The headroom gained is stated as a measured capability count, not as a character saving

## Comments

### 2026-08-30 — landed, with the split falling inside `protocol` as the ticket expected

**The design question the ticket left open is answered by a split, not by a finer field.**
`protocol` became two categories: `operating` (`preflight`, `recording`, `repair`) addressed to
`['author', 'client']`, and `protocol` (`protocolVersion`, `commands`, `lifecycle`, `transport`,
`exitCodes`, `writeBoundary`, `resume`, `schemas`) addressed to `['client']`. The audience is a
list rather than a single value because four categories have two readers — the crew's own code
reads `catalog`, `checks` and `operating`, and the prompt reads `language`, `plan`, `catalog`,
`checks` and `operating`.

A per-key audience *inside* a category was considered and rejected. It would have made the crew
assemble a subset of a published body, which is the consumer holding an opinion about the
contract that the ticket forbids in the other direction. A category is the unit the contract
publishes, so it is the unit an audience can be attached to. The cost of the split is 218
characters of second heading, summary and framing — the reason a same-shape measurement of the
post-split contract taught whole reads 118,816 rather than 118,598.

**Measured, at the new boundary.** The prefix is 118,598 → **95,503**, and the catalog is
byte-identical either side — the `catalog`, `checks`, `language` and `plan` fixtures are
untouched in this commit, which is stronger evidence than the assertion the ticket asked for and
is committed beside it. Content the prefix carries more than once falls from 12,754 (10.8%,
54 repeats) to 5,056 (5.3%, 41). The 5,146-character `protocol.schemas` repeat the ticket named
is simply not sent any more; it is still published, and still production's to deduplicate.

**The headroom, as a capability count.** The wall moves from **eleven capabilities to fifteen** —
eleven fit at 141,537 and twelve did not at 151,456; fifteen fit at 144,335 and sixteen does not
at 150,085, measured by cloning capabilities into the recorded catalog and asking `cache_prefix`,
the ticket's own method. That is four capabilities of runway rather than the two or three the
ticket estimated. `RESIDENT_CHARS_ALLOWED` was deliberately left at 150,000: raising the line in
the same commit that bought distance from it would have spent the gain immediately.

**ADR-0017 is amended, not reopened.** The catalog still goes in whole, resident and identical
across turns. The amendment names what the new regime retires: every share and every prefix-size
figure denominated at 118,598, this ticket's own 20.4% included. Body character counts are not
retired, because no body moved. Ticket 17's Word-anchor counts are not retired, and the census
confirms it — 40 boundary anchors over 19 statements and 12 word anchors over 6, unchanged.

**Two things moved that the ticket did not anticipate, both for the same reason.**
`refusals.py` read its three guidance documents out of `protocol` by name, and would have gone
silently empty on the day they moved — a repair with no guidance still looks like a repair. It
now searches for the keys wherever the contract publishes them. `proof/harness.ts` walked a
hardcoded list of categories to backfill what an agent did not ask for; that is an action rather
than an expectation, so it now reads `CONTRACT_CATEGORIES`. The assertion sheet beside it keeps
its restated list, deliberately.

**What is not done here.** Nothing narrows, tiers or defers a capability; `protocol.schemas` is
not deduplicated; and no ratio is encoded anywhere. Tickets 27 and 28 are still the fix. Suites:
crew `pytest` 324 passed 1 skipped (was 316/1), workspace `vitest` 910 passed across 63 files,
`pnpm check` and `tsc --noEmit` clean.
