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
  crew driver with no `plan`, working roots kept. **It rehearses by default and spends only
  when told to: `-- --provider elevenlabs` is the live run.** That default was the other way
  round while `catalogShowcasePlanViolations` blocked a Brief-violating plan before synthesis;
  once that check moved to the assertion sheet, nothing else stood between a bad plan and a
  dispatch, so the default is what stands there now. A rehearsal is a full run — the crew
  authors through a real model and every assertion scores — and it costs no voice credit.
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

**The rehearsal is done, and flash cleared the Brief first time.**
`--provider fixture`, pinned default model, 2026-08-26: **51 assertions pass, none fail**, six
`not-evidenced` for the reason above. `scenario.brief-compliance` passed, all eight capabilities
appeared exactly once across exactly eight event-driven scenes, `compile.zero-errors` was 0, and
the take measured 111.76 s inside the 100-140 window. The crew used **zero repair cycles** — one
pass each of validate, preflight, record, compile and render, 12 agent commands in total. One
provider dispatch, `fixture`, so no voice credit was spent.

So the live run goes out on the pinned default. Do not reach for `--model` unless a live attempt
shows flash cannot hold the Brief with a real voice in the loop; a claim earned on the default
with no repairs is the stronger result. The rehearsal bundle is at
`.scratch/agent-production-interface/proofs/2026-08-26T185603-783Z-helios-bay-catalog-showcase`.

**The verdict is signed, and it needed a script.** `human-verdict.json` is written `pending` at
seal time and is one of the 51 hashed entries in `hash-index.json`, so hand-editing it fails
`PROOF_HASH_MISMATCH` before the verdict logic is ever reached. **No bundle had ever carried a
signed verdict** — all seven on disk were `pending` — which is the likeliest reason this ticket
sat at `ready-for-human`, and not anything about the film. Exempting the file from the index was
the alternative and was rejected: the bundle would then stop attesting the one thing a human puts
into it. So `pnpm --filter @vox/production sign:verdict <dir> --input <verdict.json>` rewrites the
verdict *and* re-hashes it, and it is the only thing that may. Three properties make that safe,
all held by `proof-sign-verdict.test.ts`: it verifies the whole bundle **before** it writes, so
signing can never be the step that launders one somebody edited; it moves only the two hashes it
actually changed, never re-sealing the index from current contents; and it leaves the artifact
bindings, the criteria and `verticalSliceReviewed` exactly as sealed — gap 8 is a separate watch
and the sealed note says so. `--template` prints an input file with the six criteria already in
order, so notes cannot be filed against the wrong rows.

**`verify:proof` is not this ticket's gate, and cannot be.** It runs `requirePass: true`, which
demands `machineVerdict === 'pass'` — and the third criterion below is that a crew run's aggregate
is `not-evidenced`, never `pass`. `environment.directNetworkPolicy.denied` is `false` for the same
measurement reason, a second condition the gate can never meet. Signing the bundle and then
running `verify:proof` still throws `PROOF_VERDICT_NOT_PASS`, and the verdict is not why. The gate
is `verifyProofBundle` without `requirePass`, which the signing script runs on itself afterwards;
on the signed bundle, re-run in a fresh process, it returns
`{ machineVerdict: 'not-evidenced', humanVerdict: 'pass' }`. **There is no standing command that
runs that check** — `verify:proof` is `requirePass`-only, so a crew bundle has no re-verification
script of its own.

**Status:** done

- [x] The showcase Brief runs end to end with live synthesis — `2026-08-27T175345-435Z`,
      `provider: elevenlabs`, `agent: fresh-generalist`, one provider dispatch
- [x] Exactly one Take is recorded — `record.one-take-used` observed `1`, `record.same-take` and
      `take.verified` both pass
- [x] No machine assertion fails, and the evidence bundle verifies. **The sheet reads exactly
      `51 pass / 6 not-evidenced`, and the six are the isolation and direct-network rows** —
      that count is the criterion, not "some not-evidenced is expected", which would accept a
      row going dark for an unrelated reason. The aggregate verdict of a crew run is
      `not-evidenced`, never `pass`: `spec.md` decision (1) settles that local crew runs report
      `sandboxEvidence: null`, so those six score `not-evidenced` by design and code-blindness
      is convention rather than enforcement here. Read this criterion as the failure count, not
      the verdict word — the spec now asks for exactly that in bar (3) as well as bar (1), so
      it is not rediscovered at submission time.
- [x] The run stays inside the measured budget, rate line included: at most four model calls
      per plan version, which `ContextSpend.overrun` enforces rather than reports — one plan
      version, `reviewCalls: 2`, and an overrun would have stopped the run rather than annotated it
- [x] The preview is watched and listened to end to end by a human — Mourad Amami, laptop display
      and headphones, 2026-08-27
- [x] The human verdict is recorded alongside the evidence bundle — `pass` on all six rows.
      **The notes quote the evaluator rather than paraphrase him**: the whole spoken verdict was
      *"all is good. I watched."* plus *"the anchor words are where they should be"* against row 2,
      and six invented observations attributed to a person is not a thing a proof bundle may
      contain. `SUMMARY.md` states the same verdict, so the bundle does not contradict itself.
