# 15: One real Helios Bay run

**What to build:** The crew produces the Helios Bay showcase end to end with live
synthesis and exactly one Take, its machine assertions pass, and the result is submitted
for the standing human watch/listen verdict.

This is the run that proves the crew on the same frozen fixture the proofs use, with a
real voice rather than a stub, and it is where catalog breadth is demonstrated rather
than asserted.

Everything the machine can check is checked before a human is asked for anything: the
assertions pass, the evidence bundle verifies, and the budget from the previous ticket
holds. The human verdict is about whether the result is *good* — watched and listened to
end to end — which no assertion replaces.

Marked for a human because it spends real synthesis quota and ends in a judgement only a
person can give. An agent should not be spending live quota unattended, and the verdict
is not something to self-report.

**This is acceptance bar (3).**

**Blocked by:** 12 (The end-to-end crew test through the proof harness), 14 (The teaching surface is cached, and the budget is a number)

**What ticket 12 leaves here.** `createCrewAgentDriver({ plan })` runs the crew against the
harness today; omitting `plan` is the live path and needs no structural change to the driver.
Two things do change with it. **`agent.unscripted-generalist` becomes earnable** — it is the one
assertion the deterministic run fails, and it fails honestly because the plan was handed in.
**The harness stops being able to find the plan**: it reads `workRoot/plan.json`, which exists
only because a driver wrote it, and a crew that authors its own plan puts it inside the Run.
That read becomes `checkpoint.bindings.plan.snapshot` — the plan the Run actually bound, which
is the better source for every driver — and the harness's zero-budget probe needs a plan file of
its own rather than the agent's.

**What is already built, before a credential is spent.** Everything above is done, and none
of it needed a key:

- The harness reads the plan its Run is **bound** to (`readBoundPlan`) rather than
  `workRoot/plan.json`. Unconditional, no fallback: `run validate` binds a snapshot that parses
  equal to the plan it was handed (`validate-command.test.ts`), so the binding is the better
  source for every driver, not only the crew. It was also a latent fragility for the Codex
  path, whose task message never named `plan.json` at all.
- The zero-budget probe validates against `plan-paused.json`, which the harness writes from
  that same parse, beside the `request-paused.json` it already wrote.
- A driver that leaves no plan file behind is exercised in `proof-harness.test.ts` — the live
  crew's shape, at fixture cost. It fails with `ENOENT` against the old read.
- `pnpm --filter @vox/production proof:crew-showcase` is the runner: the showcase scenario, the
  crew driver with no `plan`, live synthesis, working roots kept.
- `vox-crew --model NAME` chooses the author's model for one invocation, so the showcase run can
  ask for a pro model without the pinned default moving. Refused alongside `--plan`, which
  reaches no model at all, and refused for a floating alias — the same rule the pinned default
  is held to, enforced at the crew rather than at any caller.
  `createCrewAgentDriver({ model })` passes it through and the bundle records
  `vox-crew/adk:<model>`.

**The gate decision is made. What is left is the run itself.**
`catalogShowcasePlanViolations` no longer blocks anything. It was a second evaluation of an
assertion that already existed — `scenario.brief-compliance` scores the same function over the
finished Run — and the blocking copy bought nothing the trusted service was not already
enforcing (`run-store.ts:964` caps dispatches at `maxNewTakes`) while costing the run its whole
diagnostic value: a throwing audit hook destroys the socket, so the run died *before* it ever
compiled. Note the correction — earlier notes said the gate fired after compile; `converge.py`
sequences `validate:657 → preflight:670 → record:685 → compile:709`, and the gate hooked
`record`.

Three things followed from removing it:

- **The word window went with it.** The Brief asks for 110–130 seconds and never translates
  that into words, so a 230–310 word check was an uncalibrated guess at a speaking rate the
  Brief never states. `media.take-duration` measures the artifact against the scenario's real
  window and Preflight's calibration is the crew's early warning.
- **The unscripted claim is protected structurally.** With no refusal there is no channel
  through which the proof's answer key could reach the author. That was the risk in surfacing
  the gate as a repairable refusal, and it is now impossible rather than merely avoided.
- **A crashing audit hook is no longer silent.** Its reason is recorded into `failure.json`
  rather than dying in `ipc/host.ts`'s catch, which is what made a harness bug and a gate
  refusal indistinguishable.

**Rehearse before spending.** `--provider fixture` runs the whole pipeline with the real model
and no voice credit; the paid run is `--provider elevenlabs` (the default). Run live on the
pinned default model, and escalate to `--model` with a pro model only if the rehearsal shows
flash cannot reach brief-compliance — a claim earned on the default is the stronger result.

**Status:** ready-for-human

- [ ] The showcase Brief runs end to end with live synthesis
- [ ] Exactly one Take is recorded
- [ ] Machine assertions pass and the evidence bundle verifies
- [ ] The run stays inside the measured budget
- [ ] The preview is watched and listened to end to end by a human
- [ ] The human verdict is recorded alongside the evidence bundle
