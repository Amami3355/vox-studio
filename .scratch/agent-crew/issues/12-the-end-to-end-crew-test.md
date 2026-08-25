# 12: The end-to-end crew test through the proof harness

**What to build:** The crew runs headless in a bootstrapped workroot against the real
production service with stubbed synthesis and render adapters, and the resulting run is
scored by the existing assertion sheet. Deterministic, free, and needing no key, quota or
network.

Reaching the crew from the harness needs a crew driver alongside the existing one. That
shim stays TypeScript and lives with the harness, because drivers belong to the harness
rather than to the crew.

The isolation assertions are reported as **not evidenced** for this run, per review
decision 1, and nothing in that section fails on that basis rather than passing vacuously.
The aggregate verdict is a separate matter, settled in the first Note below. The crew process
is not sandboxed in this phase: code-blindness is convention here, not enforcement, and
the sheet says so plainly instead of implying a boundary that was never tested.

No new assertion vocabulary unless a crew behaviour is genuinely unmeasured by the
existing sheet. The point of this ticket is that the crew is judged by the same bar as
the scripted driver it replaces.

**This is acceptance bar (1).**

**Blocked by:** 02 (Score isolation as not-evidenced when a driver brings no sandbox), 09 (The producer records, compiles and renders under the quota rules), 10 (Every crew run leaves an evidence bundle)

**Note — what "deterministic, free, and needing no key" costs, said plainly.** The crew's author
is a model, and a model is none of those three. So this run hands the crew a plan and everything
else is the crew's own: discovery, the review, the convergence, the producer, the read-back and
the bundle. `agent.unscripted-generalist` is therefore honestly **`fail`**, and the aggregate
machine verdict with it. Every other assertion on the sheet passes, and the six isolation and
direct-network assertions report `not-evidenced` because nothing measured them. That is the
whole content of bar (1) that a free run can carry: **the pass itself needs a model, and it is
ticket 15 that earns it.** The same driver takes the live author with no structural change.

**Note — the harness reads the submitted plan from `workRoot/plan.json`.** Every driver so far
leaves it there, and this one does too because it is the plan it handed in. A crew that authors
its own plan puts it inside the Run instead, so before the live path can be scored that read
becomes `checkpoint.bindings.plan.snapshot`. Named in `harness.ts` at the site, and carried by
ticket 15.

**Status:** done

- [x] A crew driver lets the harness run the crew headless
- [x] The run uses the real production service with stubbed synthesis and render adapters
- [x] The run is deterministic and needs no key, quota or network
- [x] The existing assertion sheet scores the run, with no new assertion vocabulary for already-measured behaviour
- [x] Isolation assertions report as not evidenced, and nothing in that section fails — the run
      is scored on that basis rather than passing it vacuously. The aggregate is still `fail`,
      on authorship alone; see the first Note.
- [x] The run produces an evidence bundle that verifies after the fact
- [x] The crew driver is the first caller of `write_bundle`, so the run *persists* its transcript
      and every command envelope in issue order — ticket 10 built the bundle and left the caller
      here, and nothing persists one until this ticket does
- [x] The crew's own assertion restatement and `evaluateNorthbridgeAssertions` are held to each
      other over the same Run, and a divergence is reported rather than reconciled silently
