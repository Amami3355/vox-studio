# 23: The prefix is measured rather than argued about

Status: done

## Problem Statement

Ticket 17's problem statement rests on four numbers about the instructions the crew authors
from: the prefix carries 44 anchors, 35 Boundary and 9 Word; seven of the nine Word anchors are
one idiom repeated down a single statement, so exactly two anchors in the whole prefix
demonstrate a pointing gesture; the catalog projection is 52% of the prefix; and within it there
are 30 Boundary anchors and no Word anchors at all.

Those numbers carried an argument, a severity decision and an ADR reading. They were also
produced once, by hand, in one session, and the ticket closes by saying they are *"the numbers to
re-measure rather than re-reason about"* — which is exactly right, and which nothing in the
repository can currently do. The instruction has no instrument behind it. The next session that
wants to know whether the Teaching surface is balanced has to redo the archaeology, and the
session after that has to decide whether to trust either result.

Worse, the numbers are about material the crew does not own. The prefix is assembled from
projections the interface publishes, so it moves whenever the contract moves — a capability
added to the catalog, an example reworded, a form added to the time vocabulary. Any of those
changes every number above, silently, with nothing in either repository noticing. The balance
that ticket 17 measured as bad could get better on its own, or considerably worse, and the first
anyone would know is the next time someone counts by hand.

The crew already contains the hard half of the instrument. `_anchor_pattern` builds an anchor
reader out of the forms the catalog publishes, precisely so the crew reads the anchors the
contract currently describes rather than the ones it described when the code was written. What is
missing is the census that applies it to the instructions and reports what it finds.

## Solution

Make the composition of the prefix a number the build produces, over the assembled instructions,
using the anchor vocabulary the contract publishes.

The census reports what the surface *demonstrates*: how large the prefix is, how it divides
across the categories the index published, and — for anchors — how many appear, of which forms,
and how many distinct statements they appear in. That last distinction is the one that mattered
most in ticket 17 and the one a naive count gets wrong: nine Word anchors that are one idiom
repeated seven times teach roughly what two teach, and a census that reported nine would have
hidden the defect it was built to expose.

It runs where the crew's other guards run, over the recorded contract fixtures, so it costs no
service and no network and answers on every `pytest`. Its output is a record a session can read
and compare against the last one, rather than a threshold that fails a build — the numbers are
descriptive, the contract is another team's to move, and a census that refused a green build
because a capability was added would be the crew holding the contract hostage to a ratio nobody
has argued for.

What it does assert is the thing that is genuinely the crew's own: that the census reads the
whole prefix and can account for it. A census that silently skipped a category, or an anchor form
its reader could not parse, would report a balance over material it had not seen, which is worse
than not measuring.

It also reports **repetition between categories**, and this one is not hypothetical. The contract
currently publishes the compiler's check meanings twice — the `catalog` projection carries them at
`contract.checks` and the `checks` category publishes the same 9,367 bytes, hashing identically —
so about 15% of the prefix is one document sent twice, on every turn. The crew cannot fix that:
dropping the repeat would be the crew editing a published projection, which its own assembly rule
forbids. Production issue 28 removes it at the source. What the crew can do is *notice*, so that
the next occurrence is a number on a census rather than something found by hand while measuring
something else.

## Implementation Decisions

- **It measures the assembled instructions, not the projections separately.** The prefix is what
  reaches a model, including the preamble and the per-category framing. Measuring the bodies alone
  would answer a question nobody asked.
- **The anchor vocabulary comes from the contract, through the existing reader.** A form the
  contract adds is a form the census counts, with no edit — the same rule the rest of the crew is
  held to. A form the reader cannot parse is reported as unparsed rather than dropped, because a
  silent drop is how a census starts lying.
- **Distinct statements are counted alongside raw occurrences.** Both numbers are published. The
  raw count is what a reader expects; the distinct count is what ticket 17 actually needed, and
  publishing only one of them would re-create the confusion the ticket had to work through.
- **The per-category division is published, not just the total.** *"The catalog projection is 52%
  of the prefix"* is a fact about where the model's attention is being spent, and it is the number
  most likely to move as the catalog grows.
- **It is a record, not a gate.** No threshold, no failure on a ratio. What a balanced prefix
  looks like has never been argued, and encoding an unargued ratio as a build failure would give
  it an authority no one granted it.
- **Repetition between categories is reported, and the crew does not act on it.** The census names
  duplicated content and how much of the prefix it is. It does not elide it: the assembly rule is
  that bodies go in whole, and a consumer that edits a projection is a consumer with an opinion
  about the contract. Reporting is the whole of the crew's part.
- **Duplication is measured on content, not on wording.** The case on record is byte-identical, and
  a check for identical content is exact, cheap and produces no false positives. A similarity
  measure would produce arguments instead of numbers.
- **It runs against the recorded contract fixtures.** The crew's whole test discipline is that no
  test reaches a service, a key or the network, and a census is not the place to make an
  exception.
- **The output is durable and comparable.** A session should be able to read the current census
  and the one taken before a contract moved and see what changed, without re-deriving either.
  Where that record lives is an implementation decision; that two of them can be compared is not.

## Testing Decisions

The census is itself a measuring instrument, so the tests are about whether it can be trusted
rather than about what today's numbers happen to be.

**It accounts for everything it was given.** Over the recorded fixtures, every category the index
publishes appears in the division, and the parts sum to the whole prefix. A category the census
does not know about is a category it must report rather than ignore.

**It reads the anchors the contract publishes.** Every anchor form the time vocabulary publishes
is counted when present, and an anchor shaped like nothing the contract describes is reported as
unparsed. There is prior art: a test already holds every published anchor example to the reader's
pattern.

**Repetition is visible.** A fixture prefix carrying one idiom repeated reports a low distinct
count against a high raw one. This is the assertion that the census would have found ticket 17's
defect, and it is the reason the instrument is worth building rather than a count being run once
more by hand.

**Today's numbers are not pinned.** Asserting that the prefix contains exactly 44 anchors would
make a green suite depend on another team not touching their own contract, and would be a
stale-fixture guard wearing a census's clothes. The fixtures already have a guard for staleness
and it is not this.

## Out of Scope

- **Deciding what a balanced prefix is.** The census produces the numbers that argument would
  need. It does not settle it, and ticket 17's Out of Scope on ADR-0012 is unchanged.
- **Failing a build on a ratio.** Rejected above.
- **Changing what the instructions contain or how they are assembled.** The census reads the
  prefix and does not touch its construction.
- **Measuring anything about a Run.** Word anchors *per Run* is ticket 17's own closing
  measurement, over authored plans. This census measures the surface the author reads, which is
  the other half of that comparison and a different number.
- **Measuring tokens.** Characters, offline, for the reasons `context.py` records.

## Further Notes

**The boundary this measures at is the assembled prefix**, the one ADR-0017 and every bundle
field are denominated at — `cache_prefix(SURFACE).text`, framing included, **118,598 characters**
today. It is not the 117,332 that counts the five contract bodies as the `contract show`
envelopes deliver them (ticket 28's boundary). Neither supersedes the other; this instrument
stays at the first one, and any figure quoted from the record is a 118,598-boundary figure.

**Ticket 17's four numbers, re-measured by the instrument** rather than re-reasoned about. They
have all moved, which is the argument for having built it:

| ticket 17, by hand | the census, today |
|---|---|
| 44 anchors, 35 Boundary and 9 Word | 53 anchors: 40 Boundary, 12 Word, 1 unparsed |
| 7 of the 9 Word anchors are one idiom | 12 Word occurrences in **6 distinct statements** |
| the catalog projection is 52% of the prefix | **47.6%** |
| the catalog is 30 Boundary anchors and no Word | **33 Boundary and 1 Word** |

The Word anchor now in the catalog arrived with ticket 17's own description fixes, and the
Boundary count rose with them. The record is `services/agents/prefix-census.md`, rewritten on
every `pytest` run; the comparison the ticket asks for is its diff.

**The duplication this ticket was written about is already gone at the source.** The catalog
projection no longer carries `contract.checks` — it publishes `manifestVersion`, `time` and
`capabilities` and nothing else, so the 9,367 bytes the Solution names are now published once,
by the `checks` category, at 9,585. Production issue 28 landed it. The census reports what is
there now: the largest single repeat in the prefix is **5,146 characters inside `protocol`**,
where `schemas.preflightReport.properties` and
`schemas.commandData.run.preflight.properties.report.properties` are byte-identical — 4.3% of
every turn's prefix. Repetition *within* one category is reported the same way repetition
between two is, because it costs the prefix exactly as dearly and a census silent about it
would be the naive count this ticket rejected wearing a different hat. In total 12,754
characters, 10.8% of the prefix, are copies of content published elsewhere in it.

**A statement is the JSON object or the sentence an anchor sits in, with the anchor elided.**
That definition is the whole of the distinct count, and it is what makes the idiom visible: the
seven `advanceWord` events that walk down one typographic statement normalise to one
`{"at":"<anchor>","action":"advanceWord"}` and are counted once. Nothing else the census does
would have found ticket 17's defect.

**One number in the census is not read from the contract, and it is named where it lives.**
`census.BEAT_ID` is the crew's own reading of the beat-id convention, because the published forms
name their left side `<beatId>` and the plan schema asks only for a non-empty string. It is
deliberately wider than the forms — that is what makes `b5.mid`, which the language projection
carries as a retired form, reportable as unparsed instead of invisible. A convention that moved
would make the scanner blind, so a form whose own published examples the scanner cannot find is
reported `readable: false` rather than counted as zero.

**The 100-character floor is on listing, never on counting.** Without one the record's table was
54 rows led by `{"type":"string"}` twenty-one times, which buries the case the record exists to
show. `PrefixCensus.repeats` and `repeated_chars` still carry every repeat; the record lists the
ones that are documents and says how many smaller ones it did not list and what they come to.

**Ticket 24's premise is now measurable.** The catalog is 47.6% of the prefix and eight
capabilities, and this instrument is where "what did offering the catalog rather than showing it
do to the prefix" gets answered with a before and an after rather than an argument.

**Blocked by:** None (can start immediately)

- [x] A census of the assembled instructions is produced by the suite, with no service, key or network
- [x] It reports the prefix size and its division across the categories the index published
- [x] It reports anchors by the forms the contract publishes, read through the existing contract-derived reader
- [x] It reports distinct statements alongside raw occurrences
- [x] An anchor form the reader cannot parse is reported as unparsed, never silently dropped
- [x] The division accounts for the whole prefix, asserted rather than assumed
- [x] Content published in more than one category is reported, with how much of the prefix it is
- [x] The census reports duplication and never elides it
- [x] A repeated idiom reports a low distinct count against a high raw one, under a test
- [x] No threshold fails a build, and today's counts are not pinned as expected values
- [x] Two censuses taken either side of a contract change can be compared without re-deriving either
