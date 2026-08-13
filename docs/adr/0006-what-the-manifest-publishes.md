# ADR-0006 — What the manifest publishes

**Status:** accepted · 2026-08-13
**Scope:** the compiler's check vocabulary — its error and warning codes — and whether
`catalog.json` carries it. Nothing about what any individual check *does*; every code named
here already exists and none changes behaviour.

This is the second time rule 2 has been found to have a hole of the same shape, and the
first time the question has been asked in general rather than about one vocabulary.

## Context

Rule 2 says the agent never sees the code, it sees the manifest. ADR-0002's amendment of
2026-08-13 found the first breach: `catalog.json` contained no mention of anchors **at all**,
while every event in every example is placed with one. The repair made the grammar *data* —
`ANCHOR_GRAMMAR` — published as a top-level `time` block, with the compiler's own rejection
sentence derived from it rather than written twice.

The same measurement, repeated one field over, finds the next one. **`catalog.json`
publishes no compiler error codes at all.** It was noticed while adding
`DEICTIC_ANCHOR_REQUIRED`, which is consistent with existing practice and therefore equally
unpublished: twenty error codes and seven warning codes exist as TypeScript unions whose
meaning lives in comments beside them, in a file the agent by rule 2 never reads.

**The anchor argument does not transfer, and it is worth saying why.** An anchor is
something the agent must *write*, from nothing, so a manifest that omits the grammar makes
the vocabulary unlearnable by construction. A code is something the agent *reads*, and it
arrives inside a `CompileReport` with a situated `message` and often an `expected[]` of valid
alternatives. On that reasoning alone the case would be weak, and it was nearly filed as one.

What makes the case is the **cold pass**. The measurement gate withholds `validate` in its
first pass — `docs/measurement-gate.md`, and the reason is that a validator called in a loop
is feedback, so cold and repair would otherwise measure the same thing. In that pass the
agent never sees a report at all. Everything the compiler checks must be inferable from the
manifest or it cannot be known, and a published list of checks is precisely a list of the
mistakes it is possible to make.

Note carefully what this does and does not shore up: **measure 1 in the cold pass, not
measure 2.** Layout, action, slot and capability names are already published, so an invented
name is not a code-publication failure. Getting that backwards is what nearly filed this
under the wrong measure.

## Decisions

**1. The manifest publishes the compiler's check vocabulary, as a top-level `checks` block.**
Beside `time` and `capabilities`, for the reason `time` sits there: a check is not a property
of any one capability, and repeating it per capability would be the copy that drifts.

**2. All twenty-seven codes, not a curated subset.** A subset needs a membership rule; the rule
would be "can the agent act on it?"; and that judgement drifts as the agent's authorship
surface grows. `MISSING_BEAT_TIMING` looks internal and fires *because* the agent named a
beat the take has no timing for. The whole set costs a few hundred tokens once, and curating
costs a decision per code forever — made silently, by whoever adds the next one.

The useful inversion: **a code the agent genuinely cannot act on is a smell at its source.**
If it can reach a report the agent reads, it needs a `means` and a `repair`; if it cannot, it
should not be in that report. Publishing everything turns "which codes are the agent's
business" from a question answered privately into one the manifest asks out loud.

**3. Each entry carries `code`, `regime`, `means` and `repair`; warnings also carry
`severity`.** `regime` is `error` or `warning`, and it is the load-bearing field. Rule 5's
distinction — an error rejects the plan, a warning degrades the render and the plan still
ships — is exactly what an agent needs in order to respond proportionately; one that cannot
tell them apart either ignores both or treats both as fatal, and both failures look like
incompetence rather than like a missing fact.

`means` and `repair` follow `AnchorForm`'s split between a terse `expectation` for a
rejection and a `means` for a reader who has never seen the vocabulary. The call site keeps
its situated `message` and its `expected[]` — which field, which bar, which alternatives. The
data says what the code means and what to do about it; it does not say which bar.

`severity` is a non-empty list of the levels that a situated report may carry. Most warning
codes admit one level. `SOFT_LIMIT_EXCEEDED` also reports an empty but valid state as `info`,
and `ASSET_PLACEHOLDER` escalates a failed resolution from `quality` to `important`; keeping
those distinctions public preserves existing Rule 5 behaviour without inventing a second
private severity source.

**4. `COMPILER_CHECKS` is the source, and the TypeScript unions derive from it.**
`CompilerErrorCode` and `CompilerWarningCode` become `keyof typeof COMPILER_CHECKS.errors`
and `…​.warnings`, the way `ANCHOR_EXPECTATION` is generated rather than written beside the
grammar. A data structure sitting *beside* a hand-maintained union is two sources for one
fact, and this repository has the receipt: the anchor grammar existed in three copies, one of
which rejected the first example to use the form it described.

The consequence is structural rather than tested — a new code cannot be added without a
`means` and a `repair`, because there is nowhere to declare it that does not require them.
That is better than a contract test asserting the same thing, since the test can be made to
pass by filling the fields with the code's own name and the type cannot be satisfied at all.

**5. `manifestVersion` becomes 3.** Bumped by hand and deliberately, per its own comment.
Nothing consumes it — it appears in the type, the generator and the output and is read
nowhere — so the bump costs nothing today and is the record that the shape changed.

## Considered options

**Publish nothing; the report is the teaching surface.** Rejected on the cold pass, which is
the one measurement where no report exists. It is otherwise the strongest counter-argument
and it is genuinely true of the repair pass, where an agent holding `validate` learns the
vocabulary the moment it needs any part of it.

**A curated, agent-actionable subset.** Rejected under decision 2. It is the option that
looks tidiest in the manifest and costs the most over time.

**Hand-write the block in the manifest generator.** Rejected. It is the losing alternative
from ADR-0002's amendment, restated for a different vocabulary, and it loses for the same
reason: a vocabulary that describes itself twice describes itself differently within a month.

**Generate the call-site messages from the data too.** Rejected. Twenty-seven codes with
situated text would become a template language, and the situated messages are the part of
the current errors that is actually good — `expected` carrying the anchors that would fix a
`DEICTIC_ANCHOR_REQUIRED` is not something a generic sentence can do.

## Consequences

- **Sequencing: this comes before the action group.** It is one data structure, the build
  wiring and a version bump — days rather than weeks — and it is an entry condition for a
  fair cold pass. Doing it first also means the actions added next publish their codes as
  they land, instead of being retrofitted by someone who has to rediscover this document.
- **The `means` and `repair` text is new writing, and it is the real cost.** Twenty-seven
  entries of prose aimed at a reader who has never seen the codebase. Written badly it is
  worse than nothing: a `repair` that restates the code name teaches the agent that the
  block is noise, and it will read the rest of the manifest in that light.
- **`docs/measurement-gate.md` gains an entry condition.** The gate should not be run against
  a manifest with a known hole in it, which is the same argument that made the anchor grammar
  block session 11's work rather than follow it.
- **Nothing about measure 2 changes.** Invention is still counted from the `UNKNOWN_*` codes
  and is unaffected by whether those codes are published, because the names they reject were
  already published.
- **This ADR is where the next publication question goes.** The anchor grammar landed in
  ADR-0002 because it was a *time* decision that happened to touch the manifest, which was
  right for that decision and would be wrong twice. There will be a third vocabulary; §6 of
  the frozen document describes the manifest and takes no position on what belongs in it.
