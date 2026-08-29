# 28: The structure and the scenes are written by two agents

Status: needs-triage

## Problem Statement

One agent currently does two jobs that need different material, so it is given the union of both
and the union does not fit.

**The catalog splits cleanly along the seam between those jobs, and the split has been measured.**
Serialised the way the prefix serialises it, the catalog body is 56,421 characters across eight
capabilities — a mean of 6,813 each, from roughly 4,200 for `stat_counter` to 9,900 for
`line_chart`. Where it goes:

| key | chars | share | per capability |
|---|---|---|---|
| `examples` | 22,539 | **43.0%** | 2,817 |
| `propsSchema` | 11,964 | 22.8% | 1,496 |
| `actions` | 6,709 | 12.8% | 839 |
| `softConstraints` | 4,406 | 8.4% | 551 |
| `layouts` | 2,105 | 4.0% | 263 |
| `avoidWhen` | 1,653 | 3.2% | 207 |
| `useWhen` | 1,530 | 2.9% | 191 |
| `summary` | 678 | 1.3% | 85 |
| 11 other keys | 816 | 1.5% | 102 |

**About 77% of a capability is material needed only after it has been chosen.** Everything
needed to *choose* — id, name, family, summary, `useWhen`, `avoidWhen` — is **4,672 characters
for the whole catalog, 8.6% of it.** Add layouts, action ids and descriptions, compositions,
capacity and durations and the compose tier is 12,415, or 22.8%. The remaining three quarters is
schemas, constraints and examples, and none of it helps a model decide which capability a beat
wants.

**This is not a new design and the repository already contains it.**
`packages/video/src/catalog/tools.ts` implements exactly this, and its own comment states the
conclusion: *"Two levels of reading. The agent first chooses on intent from a compact index that
stays in context permanently, then fills parameters from the full spec of the one capability it
picked."* `searchScenes` returns the compact index; `getSceneSpec` returns the full entry. The
index slice is nearly identical to the choose tier measured above. **The Python crew does not use
it and takes the whole catalog instead.** The measurement gate at `docs/measurement-gate.md`
specifies a harness over the same three tools, so a third design would be the third copy.

**There is Run evidence that the whole catalog is not what gets used.** The
`noise-cancelling-free-choice-v1` Run — the first plan authored against a brief that did not
order a capability count — used **5 of 8 capabilities**, skipping `line_chart`, `stat_counter` and
`timeline`. A scene author shown only the five it used would have read roughly 34,000 characters
of catalog instead of 56,421, and could not have named a capability absent from the plan. That
figure is one data point on a data-free brief and must be read as such: the three skipped are
exactly the ones a brief with no numbers cannot use.

And the wall is at twelve capabilities, measured. The catalog is 8 today; the strategy document
frozen for this project calls for **8 to 12 robust capabilities**, so the ceiling arrives exactly
where the product intends to be.

## Solution

Two agents where there is one, split along the seam the measurement found.

**A structurer** reads the vocabulary, the plan schema and the *choose tier* of every capability.
It writes the Brief into beats with their voice-over, partitions them into sections, places the
persistent elements, and names for each scene the capability it wants. It never sees a props
schema, a soft constraint or an example, and it cannot fill a prop.

**A scene author** reads the plan schema and the *full published specification* of only the
capabilities the structurer named. It fills props, chooses layouts and motion profiles, writes
the events and their anchors. It cannot add a scene, move a beat or invent a capability, because
the structure it is filling is already written.

Both answer out of the published contract, unedited and unsummarised, for the reason
`instructions` already records: a paraphrase of a capability is a description the model then
cannot name correctly. The tiers are *selections* of published material, never rewrites of it.

Arithmetic over the census figures, for a Run of three asks — this is division, not a measured
Run, and is offered as a sketch of the shape rather than as a result:

| | today | split |
|---|---|---|
| structurer | — | ~32,000 |
| scene author | — | ~43,000 |
| repair ×2 (ticket 27) | — | ~38,000 |
| one author ×3 | ~356,000 | — |
| **total resident** | **~356,000** | **~113,000** |

The cost is the smaller half of the argument. The larger half is that no prompt exceeds about
45,000 characters and each agent has one job it can hold in view — and that the structurer's
material grows at 584 characters per capability rather than 6,813, which removes the twelve-
capability wall for the role that most needs the catalog to be able to grow.

## Implementation Decisions

- **This is the trade ADR-0017 says must be argued here, and it must be argued before it is
  built.** The catalog stops being resident and whole for the scene author. The ADR is explicit
  that this *"has been named repeatedly and never argued"*, that the deferral is *"a consequence
  of this decision, not an oversight"*, and that a session making the trade *"must do so here
  rather than in a wiring commit."* This ticket does not proceed on the strength of its own
  Problem Statement. It produces an ADR that supersedes ADR-0017's second half, names every
  measurement it retires, and is reviewed on its own.
- **A cost argument alone is explicitly insufficient and this ticket must not lean on one.**
  ADR-0017: *"A cost argument by itself is not sufficient to break the identical prefix, because
  the property it would break is the one every before-and-after measurement in this project
  depends on."* The argument that does reach it is the twelve-capability wall — a hard failure,
  raised rather than reported, arriving inside the catalog size the product is designed for. Cost
  is the secondary benefit and should be presented as one.
- **Tiers are selections of published material, byte for byte.** A tier is a subset of keys, taken
  from what the contract publishes. Nothing is reworded, ranked by an invented score, summarised
  or annotated. The moment a tier edits, the model is reading a paraphrase and ADR-0012's ground
  is lost.
- **Which keys are in which tier is published by the contract, not decided by the crew.** Same
  argument as ticket 25's audience field, one level down: a crew that keeps a list of choose-tier
  keys is a crew whose list goes stale the first time a capability gains a field. If the contract
  cannot express it yet, that is the production sibling ticket, and this one waits.
- **Read `tools.ts` before writing anything.** It is the existing implementation of this design
  and its scoring, its deliberate refusal to filter, and its stop-word handling are all decisions
  someone already made and wrote reasons for. Re-deriving them worse is the specific failure this
  repository keeps recording.
- **The structurer names capabilities; it does not receive a shortlist from a search.** A search
  that scored the right capability out is a failure mode `tools.ts` deliberately avoids by
  returning the whole index ordered rather than filtered — *"any cutoff would only add a failure
  mode … to save context that does not need saving."* At 4,672 characters the whole choose tier is
  cheap enough that filtering it would buy nothing and cost a class of error.
- **A scene author that needs a capability the structurer did not name is a finding, not a
  fallback.** It should be recorded and surfaced, not quietly resolved by handing over the rest of
  the catalog. If it happens often, the tiering is wrong and that is what the measurement is for.
- **Each agent's prefix is identical across its own turns**, by the same `cache_prefix`
  construction, for the reason ticket 27 sets out. The scene author's prefix varies *between Runs*
  with the capabilities its structurer named — that is the property being traded away, and the ADR
  must say so in those words rather than describing it as a narrowing.
- **The bundle reports every role's prefix.** Three now, with ticket 27's repairer. No Run-wide
  `resident_chars` that means none of them.

## Testing Decisions

**Tiers are byte-identical selections.** For every capability the fixtures publish, each tier's
values are byte-identical to what the catalog publishes for those keys, and the union of the tiers
plus the untiered remainder reconstructs the published capability exactly. A tier that loses or
alters a byte is the regression that matters.

**The structurer cannot fill a prop and the scene author cannot add a scene.** Assert the shape of
what each is asked for and what it is allowed to answer with, over scripted implementations. These
are the two boundaries that make the split meaningful rather than cosmetic.

**The scene author receives specs for exactly the named capabilities.** Given a fixture structure
naming three, its prefix carries those three whole and the other five not at all.

**An unnamed capability is reported.** A scripted scene author reaching for a capability absent
from its surface produces a recorded finding, not a silent widening.

**Each prefix is identical across its role's turns**, at a fixed character count, over recorded
fixtures.

**The census reaches all of them.** Ticket 23's instrument accounts for the whole of each role's
prefix and sums the parts; three prefixes must not become three chances to measure two.

**The leak scan passes over every role's instructions and every tool docstring.**

**End to end on the fixtures, no model.** The existing convergence fixtures produce the plans they
produce today, or the differences are recorded as findings.

**Fixture Runs at n≥3, and the comparison is against the whole-catalog author.** Whether split
agents plan as well as one is the question. Capability selection, action selection, word anchors
and repair cycles are the terms to compare, and the result is recorded whichever way it falls.

## Out of Scope

- **The researcher, triage and decline.** Tickets 11, 13 and 29.
- **Changing what the catalog publishes.** The tiers read it as it is; the contract may need to
  *label* it, which is the production sibling.
- **Provider caching.** Ticket 30, and unaffected either way.
- **Removing the choose tier from residence.** It stays resident for the structurer. This ticket
  moves the compose and full tiers behind selection, not the index.
- **A fourth role.** Whatever the researcher turns out to need is ticket 11's to describe.

## Further Notes

**The order matters and this ticket is deliberately not first.** Ticket 25 removes material the
author cannot act on and touches no decision. Ticket 27 splits the smallest role and tests whether
the multi-prefix bundle works. This one makes the trade ADR-0017 protects, and it should be made
by a session that has already seen the other two land, with the evidence they produced in hand.

**Ticket 24's premise changes if this lands.** That ticket binds lookup tools to an author that
already holds the whole catalog, which can only measure whether asking helps when reading was
free. Under this ticket lookup is load-bearing rather than optional, which is the question worth
answering. Whichever lands first should say what it leaves the other.

**Blocked by:** 26 (The returned line gets teeth before anything fetches), 27 (A repair reads the
checks and the capability it broke). Ticket 25 is a strong preference.

- [ ] An ADR supersedes ADR-0017's whole-catalog half, argued on the capability wall rather than on cost, naming every measurement it retires
- [ ] A structurer writes beats, sections, persistent elements and capability names from the choose tier
- [ ] A scene author fills props, layouts, profiles and events from the full specs of the named capabilities only
- [ ] Tier membership is published by the contract, not held as a list in the crew
- [ ] Every tier is a byte-identical selection, and the tiers reconstruct the published capability exactly
- [ ] The scene author's prefix carries the named capabilities whole and no others
- [ ] A scene author reaching for an unnamed capability produces a recorded finding, never a silent widening
- [ ] Each role's prefix is identical across that role's turns, asserted
- [ ] The census accounts for the whole of every role's prefix
- [ ] The bundle reports every role's prefix and no Run-wide figure that means none of them
- [ ] The leak scan passes over every role's instructions and tool docstrings
- [ ] `tools.ts` is read first, and any departure from its decisions is recorded with a reason
- [ ] Fixture Runs at n≥3 compare split agents against the whole-catalog author on selection, anchors and repair cycles
