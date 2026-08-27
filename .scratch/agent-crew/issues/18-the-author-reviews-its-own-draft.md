# 18: The author reviews its own draft

Status: done

**Written after the fact.** The work landed in `1cc2c96` against no ticket, which a review
caught: nothing in tickets 1–16 asked for it, and ticket 17 — added in the same diff — was
describing it as already done. This ticket exists so the tracker records what was built and
what it was held to, rather than leaving a reviewer to reconstruct both from a commit message.
It is filed `done` because it is, and because a ticket written to look prospective about work
already shipped would be the second dishonest thing rather than the correction of the first.

**What was built:** `review` is offered to the live author as a tool it may call before it
answers, so a finding it could act on cheaply reaches it while it is still drafting.

`review` had always run *after* an author answered. Its findings travelled with the Run for the
repair loop and the bundle to read, which meant the one reader who could still act on them
cheaply — the author, mid-draft — was the only reader who never saw them. A plan reached the
interface carrying defects the crew had already found. Binding the same function as a tool
changes the cost of acting on a finding from a Run cycle to a tool call, and changes nothing
about its authority: the production interface remains the only authority on a plan, an empty
report is a reading that found nothing rather than an acceptance, and the preamble and the
tool's own docstring both say so.

**What it does not do.** It does not fix the anchor defect that prompted the investigation
around it. `review` has no check for a pointing gesture that was declined, so the tool is a
mirror that does not show that particular flaw — this was predicted before the run that
confirmed it, and ticket 17 is where that gap is specified. A reader comparing bundles either
side of this change must not read the unchanged anchor count as this ticket failing.

**Two consequences that were scope rather than optional.**

A tool-using ask is several model calls, each re-sending the ~125 KB prefix. `Ask.model_calls`
carries the count and `ContextSpend.model_calls` publishes it beside `asks_made`, because a
turn that under-reports its own spend puts a wrong number in a bundle that is evidence. The
budget line that bounds it came later, under the same review — see below.

`AuthoredPlan.reviewed` and `.review_calls`, published per plan version. A code in `reviewed`
and not in `findings` is the only direct evidence the tool changed what was written.
`review_calls` exists because the first live run showed `reviewed: []` from an author that had
called the tool and been told nothing was wrong, which is indistinguishable from never calling
it without the count.

**The seam widened, and ADR-0016 records it.** A tool is a callable and therefore not
serialisable, at an interface that had carried payloads only. The invariant that rule was
protecting — no path, root, directory, file or client, so an author cannot tell where it is
running or reach the production sequence sideways — is unchanged and still asserted.

**What the review of this work changed afterwards:**

- `MALFORMED_PLAN` was being built by hand with `means` and `repair` blank, while the tool's
  docstring promised the author both. It now carries what the registry publishes, through the
  same lookup `review` uses.
- The tool's declared parameter type said `str` and its docstring said "JSON object". The model
  reads both.
- The turn accounting folded the tool's answers into `fresh`, which charged them once and
  charged the Brief once — and the Brief is re-sent on every call while an answer is not. The
  two are separate fields now.
- `model_calls` was published and enforced by nothing, leaving the Run budget carrying a term
  nobody could promise. `MODEL_CALLS_PER_ASK` bounds it and `ContextSpend.overrun` reads it
  ahead of the character line it would also blow.
- The optional meter and its four `is None` call sites became one meter that every turn holds,
  reading zero where the author was offered no tool.

**Blocked by:** None (landed)

- [x] The live author is offered `review` as a tool and a scripted author is not
- [x] A scripted Run's instruction prefix is byte-identical — 124,690 characters, unchanged
- [x] The tool's docstring is prompt text and passes the leak scan, asserted by a test
- [x] The tool is assertable by a keyless machine, without a model credential
- [x] Every finding the tool returns carries the `means` and `repair` the registry publishes
- [x] The tool's declared type and its declared meaning agree
- [x] An ask reports every model call it made, and the bundle publishes the count
- [x] The prefix and the message beside it are charged per call; a tool's answer is charged apart
- [x] A Run that loops against the tool passes an enforced rate line and ends `budget_exhausted`
- [x] The seam widening is recorded in `docs/adr/`, not in a test docstring
- [x] `review` stays advisory, including as a tool
