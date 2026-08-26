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

**What is left is the run itself, and one decision before it.**
`catalogShowcasePlanViolations` is a hard pre-spend gate that throws inside the IPC audit hook,
and `ipc/host.ts:104` destroys the socket on a throwing hook — so a first-attempt miss is a dead
pipe, exit 1, and no evidence bundle. It fires after compile and before synthesis, so no voice
credit is at risk, only model tokens. Whether it should instead surface as a refusal the crew
can repair from, or whether a cheap dry authoring pass on flash is the way in, is not decided.

**Status:** ready-for-human

- [ ] The showcase Brief runs end to end with live synthesis
- [ ] Exactly one Take is recorded
- [ ] Machine assertions pass and the evidence bundle verifies
- [ ] The run stays inside the measured budget
- [ ] The preview is watched and listened to end to end by a human
- [ ] The human verdict is recorded alongside the evidence bundle
