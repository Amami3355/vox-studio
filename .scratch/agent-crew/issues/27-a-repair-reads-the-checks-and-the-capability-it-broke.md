# 27: A repair reads the checks and the capability it broke

Status: needs-triage

## Problem Statement

A refusal naming one code about one scene costs the crew the entire catalog, again.

`repair_plan` at `planner.py:1054` does exactly one thing to the prompt: `text = prefix.text +
said` at line 1074. The refused plan and the refusal go in the message; the prefix is the whole
118,598-character teaching surface, unchanged, including all eight capabilities, the plan
examples, the vocabulary and — until ticket 25 — the command protocol. A Run that repairs twice
puts the catalog in front of a model three times, and ADR-0017 records the arithmetic without
flinching: *"At three cycles that is upward of two hundred thousand characters of catalog, for a
turn whose subject is a single duration."*

What a repair actually needs is small and already gathered. `refusals.py` collects the envelope,
the compile report, and the published `means` and `repair` for the codes in it. The codes'
vocabulary lives in the `checks` category — **9,660 characters** in the prefix, of which errors
are 5,766 and warnings 3,796. The scene that was refused names one capability, whose full
published spec averages **6,813 characters**. Add the plan schema at 2,845 and a repairer reads
roughly **19,000 characters** where it currently reads 118,598.

**The reason this has not been done is written down, and it is a good reason.** ADR-0017's
Considered and Rejected section names this option first:

> **Narrow the repair prefix only.** Authoring reads the whole catalog; a repair reads only the
> capability it is fixing. This is the most tempting option and it is the one that breaks the
> property most quietly: a Run whose first turn and second turn have different prefixes cannot be
> compared with a Run of either shape, and the difference would not be visible in a bundle unless
> someone thought to look. If the trade is made it is made for the whole Run.

That objection is correct about the thing it describes: **one author, reading a wide prefix on
turn one and a narrow one on turn two.** Every before-and-after measurement this project has
taken assumes a Run's turns are comparable with each other, and that shape breaks it invisibly.

This ticket proposes a different shape, and whether ADR-0017's objection reaches it is the
question that has to be settled before any code is written.

## Solution

**The repairer is a second agent, not the author on a narrower prefix.**

The author writes a plan against the surface it has always read. When production refuses, a
distinct agent — its own instructions, its own prefix, its own budget line — reads the refusal,
the checks vocabulary, the plan, and the specification of the capability the refusal names, and
answers with a repaired plan.

The property ADR-0017 protects survives in a form that is arguably stronger than it holds today:

- **The author's prefix does not change at all.** Byte-identical to what it is now, on every turn
  it takes. Every measurement denominated at the authoring prefix stays comparable.
- **The repairer's prefix is identical across all of the repairer's turns**, by the same
  `cache_prefix` construction, for the same reason.
- Neither agent has a turn that reads a different prefix from its own other turns, which is the
  actual invariant the ADR's objection is about.

What is genuinely new is that a Run's spend is no longer one prefix but two, and a bundle has to
say so plainly rather than reporting a single `resident_chars` that means neither. That is a
disclosure problem with a clear answer, not a comparability problem with a hidden one.

**A note on why the repairer first.** It is the smallest role in the system and the one with the
least ambiguous input: `refusals.py` already assembles everything it reads, the codes are a closed
published vocabulary, and the capability to fetch is named by the refusal rather than chosen by a
model. If decomposition is going to be wrong somewhere, this is the cheapest place to find out.

## Implementation Decisions

- **ADR-0017 is amended, or a new ADR supersedes the relevant part, before code lands.** Not
  after, and not in the commit message. The ADR says a session may make this trade and *"must do
  so here rather than in a wiring commit."* The argument above is a draft of that ADR, not a
  substitute for it. If the argument does not survive being written up properly, the ticket does
  not proceed — that is a legitimate outcome and cheaper than discovering it in review.
- **The repairer's surface is assembled by the same rule as the author's.** Categories it is
  addressed to, bodies whole, no summarising, no editing. Ticket 25's audience field is the
  natural mechanism — a repairer is a second audience. If 25 has not landed, this ticket must not
  invent a crew-side filter to get around it; it waits or it lands 25's mechanism itself.
- **The capability spec is fetched by id from the refusal, never chosen by the model.** The
  refusal names a scene, the plan names that scene's capability, and the crew resolves it. A
  repairer that had to search for what it broke would be a repairer that could search for the
  wrong thing, and the whole point of this role is that its input is unambiguous.
- **A refusal naming more than one capability fetches more than one spec.** Bounded by ticket 26's
  returned line, which is why that ticket lands first. A refusal touching every capability in the
  catalog degrades to the whole catalog and says so in the bundle, rather than silently truncating.
- **The seam is the one that exists.** `PlanAuthor` already carries `repair`, and ADR-0016 already
  settles what may cross: payloads and tools, nothing that locates anything. A repairer is an
  implementation of that seam with a different prefix, not a new seam. If it turns out to need one,
  that is a finding worth stopping on.
- **The bundle reports two prefixes.** `resident_chars` currently takes the maximum where a Run
  read more than one, with a docstring calling that the case where a Run *"somehow"* read several.
  That is no longer somehow. The spend must name what each role read, and `one_prefix` — which
  today is *"a probe that cannot fail"* — becomes a real assertion per role rather than per Run.
- **The catalog stays whole and resident for the author.** This ticket changes nothing about the
  authoring turn. Tiering the author's catalog is ticket 28 and a much larger argument.

## Testing Decisions

**The repairer's prefix is identical across its turns**, asserted the way the author's already is:
byte-identical at a fixed character count, over recorded fixtures, with a scripted repairer.

**The author's prefix is byte-identical to what it was before this change.** This is the assertion
that carries the ADR argument, and it should fail loudly if anyone later narrows the author while
this ticket's reasoning is still the justification on record.

**The repairer reads the capability the refusal names.** Given a fixture refusal about a scene, the
assembled repair prefix contains that capability's published spec, byte-identical to what the
catalog publishes, and does not contain the other seven.

**A refusal naming several capabilities fetches several**, and one naming all of them degrades to
the whole catalog with the degradation visible in the bundle rather than silent.

**The repair loop still converges on the fixtures it converges on today.** The existing convergence
tests are the regression that matters: a repairer reading less must still repair the cases already
on record, and any that stop converging are the finding.

**The leak scan passes over the repairer's instructions** and over any tool docstring it holds. A
second prefix is a second place code-blindness can be lost quietly.

**The bundle distinguishes the two prefixes.** A reader can see what the author read and what the
repairer read, and cannot mistake either for a Run-wide figure.

**Fixture Runs at n≥3 before and after.** Whether a repairer reading 19,000 characters repairs as
well as one reading 118,598 is the actual question, and a single Run answers nothing — this
project already has one unexplained n=1-against-n=1 swing on the record. Recorded whichever way it
falls.

## Out of Scope

- **Narrowing the author.** Ticket 28. The author's prefix is untouched here and its
  byte-identity is asserted.
- **Any change to what the checks category publishes.** The repairer reads the codes as they are.
- **A researcher, a triage agent or a decline.** Tickets 11, 13 and 29.
- **Provider caching.** Ticket 30. Two prefixes is a fact about what is assembled, not about what
  a provider does with it, and ADR-0017's prohibition on claiming an unconfirmed saving applies
  here unchanged.
- **Deciding that decomposition is right in general.** This ticket splits one role because it is
  the cheapest one to be wrong about. What it produces is evidence for the larger argument.

## Further Notes

**If ADR-0017's objection does reach this shape, the ticket should be closed rather than
weakened.** The failure mode the ADR describes — a difference in prefixes that *"would not be
visible in a bundle unless someone thought to look"* — is answerable here only because the bundle
is being changed to look. If that part is cut for cost, the objection lands and the ticket is
`wontfix`, not `ready-for-agent` with a smaller test.

**Blocked by:** 26 (The returned line gets teeth before anything fetches). Ticket 25's audience
mechanism is a strong preference rather than a hard block.

- [ ] ADR-0017 is amended or superseded in the relevant part, in its own commit, before code lands
- [ ] A repairer is a distinct agent with its own assembled prefix, built by the same rule
- [ ] The repairer reads the checks vocabulary, the plan schema and the specs the refusal names
- [ ] Fetched specs are byte-identical to what the catalog publishes
- [ ] The capability is resolved from the refusal by the crew, never searched for by the model
- [ ] A refusal naming several capabilities fetches several; one naming all degrades visibly
- [ ] The repairer's prefix is identical across its own turns, asserted
- [ ] The author's prefix is byte-identical to what it was, asserted
- [ ] The bundle reports both prefixes and no Run-wide figure that means neither
- [ ] The existing convergence fixtures still converge, and any that stop are recorded as findings
- [ ] The leak scan passes over the repairer's instructions and any tool docstring
- [ ] Fixture Runs at n≥3 either side, recorded whichever way they fall
