# Two-axis review — `b805ccc...HEAD`, 2026-08-27

Standards and Spec, run as parallel readers that could not see each other's context, over the
four commits that had accumulated unreviewed on `feat/crew-frontier`:

```
172893e docs(crew): ticket 17 asks the author to reach for the word anchor
1cc2c96 feat(crew): the author is offered review() as a tool while it drafts
29a3c6d docs(crew): ticket 15 records the rehearsal and stops asking for a verdict a crew run cannot give
6d0626e refactor(crew): the showcase gate becomes an assertion instead of an interlock
```

Fixed point `b805ccc`, the parent of the oldest of them. 15 files, ~1,087 insertions.

Answered in `c15526c` (code) and `0f254a6` (record). This file is the audit trail between the
findings and those two commits, kept because the reasoning for several of the fixes is only
legible next to the finding that provoked it.

---

## Standards

Sources: `CONTEXT.md` (glossary and numbered rules), `AGENTS.md`, `docs/adr/`,
`docs/measurement-gate.md`, plus the Fowler smell baseline. The reader was told that this
repo's long argumentative docstrings and full-sentence test names are house style, so that it
would not spend its findings on the thing the repo does on purpose.

| # | finding | verdict | disposition |
|---|---|---|---|
| S1 | `MALFORMED_PLAN` built by hand with `means` and `repair` blank, while the tool's own docstring — prompt text — promised the author both. Breaches rule 1 and ADR-0012's *"the check registry publishes the repair"* | **hard, confirmed** | fixed; both callers share one lookup |
| S2 | `def review_draft(plan: str)` against `Args: plan: … as a JSON object`. The model reads signature *and* docstring | **hard, confirmed** | fixed; `_plan_from` parses text, so the docstring was the wrong half |
| S3 | The seam widening is honest and asserted, but recorded in a test docstring; this repo keeps seam decisions in `docs/adr/`, and ADR-0009 exists purely to say a grammar does not widen | confirmed | **ADR-0016** |
| S4 | `_spent` overclaims: `Ask.chars` never multiplies `fresh`, though the Brief is re-sent on every call; and `resident_chars` is a `max`, so the hard resident line never sees the multiplied prefix | confirmed | `returned` split from `fresh`; `(resident + fresh) × model_calls + returned` |
| S5 | *Mysterious Name* — `Ask.turns` means model calls, and `ContextSpend.model_calls` already had the honest name | judgement | renamed |
| S6 | *Repeated Switches / Feature Envy / Middle Man* — `meter is None` at five sites, `review_calls=… if … else 0` duplicated across both call sites, `_tool` a one-line delegator | judgement | one meter every turn holds; an unoffered author reads zero |
| S7 | *Mysterious Name* — `seededViolations` includes `audit-crash`, which is the harness failing rather than an agent misbehaving | judgement | `seededFaults` |

The reader also judged the showcase-gate removal *"well argued"* and a genuine rule-1
duplication fix, with no issue. See the note on disagreement below.

## Spec

Sources: ticket 15 (the originating spec for the two markdown commits), ticket 14 (governs the
cached prefix and Run budget), `spec.md`. Ticket 17 was flagged to the reader as *added by* the
diff rather than implemented by it, so its criteria would not come back as false gaps.

| # | finding | verdict | disposition |
|---|---|---|---|
| P1 | Bar (3) still read *"passes machine assertions"* while bar (1) said the sheet's own pass *"is (3)'s to earn"*. Review decision 1 binds both, so ticket 15 was amending itself against a spec that still asked it for a verdict a crew run cannot give. Separately, *"No machine assertion fails"* accepted **any** count of `not-evidenced` | confirmed | bar (3) amended; the criterion now pins `51 pass / 6 not-evidenced` and which six |
| P2 | *"Both lines are enforced rather than reported"* made false by construction. `model_calls` published, read by no budget line; `overrun` tested only `resident_chars` and `fresh_chars`, so tool calls were uncapped | confirmed | `MODEL_CALLS_PER_ASK = 4`, enforced by `overrun` ahead of the character line |
| P3 | `1cc2c96` references no ticket; nothing in 1–16 asks for a draft-review tool, and ticket 17 — same diff — describes it as already done | confirmed | **ticket 18**, filed `done` |
| P4 | The gate removal cost ticket 15 a property. `run-store.ts` caps *how many* takes, not whether a Brief-violating plan gets one. The replacement was an operator remembering a flag — and the flag defaulted to `elevenlabs` | confirmed | `--provider` defaults to `fixture`; spending is opt-in |
| P5 | *"`agent.unscripted-generalist` is claim-eligible only under `elevenlabs`"* — scored from `authorship.unscripted` with no provider condition, and the fixture bundle the ticket cites records it `pass` | **confirmed false claim** | docstring corrected |
| P6 | *"The tool docstring is not leak-scanned."* | **refuted** | `test_planner.py` scans `tool.__doc__` directly. The residual true statement — the guarantee is test-time, not runtime — is appropriate for a source constant, and the code says so. No change |
| P7 | Ticket 14's measured 124,690 characters no longer described the live prefix | confirmed | re-measured: 124,690 scripted (unchanged), 125,039 live, the tool paragraph costing 349 |

---

## Two things worth keeping from how this ran

**The axes disagreed about `6d0626e`, and both were right.** Standards read the gate removal as
a clean refactor that fixes a rule-1 duplication. Spec read it as removing a property the spec
relied on. It was both — and the fix belonged in neither the refactor nor the assertion sheet,
but in the default the runner had never been asked about. Separating the axes is what surfaced
that; a single reader would have had to rank one reading over the other.

**Both axes landed independently on the accounting being soft** — Standards on the arithmetic,
Spec on nothing enforcing it. Neither could see the other. That agreement is the strongest
signal the pair produced, and it is why the budget line was treated as the most load-bearing
fix rather than as bookkeeping.

**One finding in seven was wrong** (P6), and one commit-message claim that a reader would
reasonably have taken on trust was false (P5). Both are arguments for verifying a reviewer's
findings against the source before acting on them, in the same direction as `-l`'s carried
refinement: verify the *correct* findings too.

## Numbers, for anyone re-measuring

- Suite before: 282 passed, 1 skipped. After: **286 passed, 1 skipped** (+4 tests, covering
  the registry lookup, the unoffered meter, and the rate line in both directions).
- Production: 152 passed across 32 files. `tsc --noEmit` clean, `biome check` clean,
  `catalog:check` up to date.
- Resident prefix: 124,690 scripted / 125,039 live.
- Rate allowance: 4 model calls per plan version. The one live Run on record used 2.
