# The measurement gate

**Status:** specified · 2026-08-13 · not yet run
**Scope:** §13 step 9 — "test au harnais généraliste". What is measured, on what, by whom,
under what isolation, and what a result obliges the project to do. Nothing about the agent
crew of PRD §17: this gate runs *before* them and deliberately does not need them.

## Why this document exists

The gate was settled in grilling sessions and then recorded **nowhere but a handoff file in
the OS temp directory**, carried forward by hand for seven sessions on the understanding
that one temp cleanup would lose it. This is that conversation written down. The sections
marked *settled* are not new positions; the ones marked *specified here* are operational
detail the handoff never carried, and are the only parts open to revision by reading them.

It is a spec and not an ADR because it constrains a procedure, not the code. Nothing here
generates, validates or renders anything.

## What is being measured — settled

**The catalog, not the agent.** §13 says it in one line: *"Ce qu'elle révèle porte sur le
catalogue, pas sur l'agent."* Every number below is evidence about whether a competent
model, given only the manifest, can author a plan that compiles and reads well.

**The pre-committed response to failure**, agreed before any number exists so that no number
can argue its way out of it:

> Anything under threshold is a **catalog** defect, repaired by depth — a better schema, a
> better `useWhen`, a better example, a published vocabulary — and **never** by adding a
> capability to route around a bad one.

Committing to this in advance is the whole point. A gate whose remedy is chosen after seeing
the score measures nothing, because "the catalog needs one more scene" explains every
possible result.

## The five measures — settled thresholds, operational definitions specified here

§13 names four measures. The fifth was added because a catalog that serves every brief
including the ones it should refuse has learned to force-fit, and none of the other four can
see that.

| # | measure | threshold | computed from |
|---|---|---|---|
| 1 | first-pass prop validity | ≥ 90% | `validateScene` over cold-pass instances |
| 2 | invented actions / layouts | **0 — hard fail** | the `UNKNOWN_*` codes |
| 3 | selection relevance | ≥ 8 / 10 briefs | human judgement, blind on render |
| 4 | rendu présentable | subjective, see *Premium* | rendered after the run |
| 5 | does it decline? | both unservable briefs declined, no false decline | the run transcript |

**1 — First-pass prop validity.** Denominator: every `SceneInstance` in the cold-pass plans.
Numerator: those for which `validateScene` returns zero *errors*. Warnings do not count
against it — rule 5 keeps the two regimes apart, and a warning is by construction a
degradation the render survives. A brief that was declined contributes no instances to
either side.

**2 — Invention.** Machine-computable, no judgement: the number of `UNKNOWN_CAPABILITY`,
`UNKNOWN_ACTION`, `UNKNOWN_LAYOUT` and `UNKNOWN_SLOT` errors across the cold-pass plans.
Counted from `validateVideoPlan` and not `validateScene`, because `UNKNOWN_SLOT` is raised
on a *placement* — it carries a `sectionId`, not a `sceneId` — and an invented slot on a
persistent element is the same defect seen one level up. Nonzero fails the gate outright,
whatever the other four say. Rule 2 is why: the agent sees
the manifest and nothing else, so an invention is proof that something the manifest was
supposed to teach was not learnable from it. That is a defect in the manifest even when the
invented name is a reasonable guess — *especially* then.

**3 — Selection relevance.** Per brief, binary, judged by the user from the plan alone
against one question: *would a competent editor have reached for these capabilities for this
brief?* Judged before anything is rendered, because a strong frame is persuasive about a
weak choice. A correctly declined unservable brief **scores as relevant** — declining is the
right selection when nothing fits — which is what leaves the threshold two misses of room
rather than zero.

**4 — Rendu présentable.** Judged after the measured run, in Component Studio, in two
verdicts that are asked separately: **system-premium** before real images land (does the
composition, the rhythm and the typography hold with stand-ins?) and **frame-premium** after
(does the finished frame hold?). Subjective but anchored — see *Premium* below.

**5 — Does it decline?** Two of the ten briefs are deliberately unservable. Both must be
declined in the cold pass, and a decline means producing no plan *and naming what the
catalog lacks* — a plan with an apology in a caption is not a decline. A **false decline**
(refusing a brief the catalog can serve) fails this measure too, because without that half
the measure is passed by refusing everything.

## The briefs — settled

**Ten briefs, written by the user.** One paragraph of editorial intent each. No structure,
no scene names, no counts, no vocabulary borrowed from the manifest.

They are written by the user and not by an agent as **bias control**, and it is the load-
bearing constraint of the whole exercise: an agent that has read the catalog writes briefs
the catalog can serve, and the gate would then measure the brief-writer's memory instead of
the catalog's reach. Any run whose briefs were authored with the catalog in view is void.

**Two of the ten are deliberately unservable** — genuinely outside what the library can do,
not merely hard. Which two is known to the user and to the scorer, and to nobody preparing
the run.

## The harness — settled shape, mechanics specified here

**A CLI bin inside `packages/video`**, exposing three commands — `search`, `spec`,
`validate` — as transport over the four tools already in `catalog/tools.ts`. No MCP server:
§6.2 says none in V1, and a transport adds nothing while the catalog stays internal.

**The agent runs in a generated directory outside the repository**, holding only the CLI,
`catalog.json` and the briefs. It must not be able to read `packages/video/src` — a run in
which the source was reachable measures Claude and not the catalog, and is void.

*Specified here:* "cannot read the source" is a property of what the directory contains, not
of an instruction not to look. The generated directory therefore holds the CLI **bundled to
a single file** with no path back into the workspace, and the generator asserts that no
`.ts` under `src/` is reachable from it. An instruction would be a request; this is a fact
about the filesystem, and only the second kind survives an agent that is trying to succeed.

**Blind on render during the measured run.** No stills, no video, no frame of feedback. The
run produces plans; measure 4 is judged afterwards, from renders of those same plans.

## The two passes — settled

Both scored, separately, and never averaged.

**Cold.** One shot, no feedback. `search` and `spec` are available; **`validate` is
withheld** — that is what "no feedback" means operationally, since a validator called in a
loop is feedback. Measures 1, 2, 3 and 5 are all computed from this pass and this pass only.

**Repair.** The same briefs, with `validate` unlocked, called freely until the plan is
green. What it reveals is not validity — validity is reachable by brute force — but *cost*:
how many calls, and whether any brief never converges. A brief that cannot be made green
with the validator in hand is the strongest signal the gate can produce, because it means
the error messages do not say what to change.

Repair-pass scoring is on the **pre-agreed cut line** if the schedule slips: cut in order,
group 3 → `cutoutOnFlat` → repair-pass scoring. Never cut: group 1, group 4, the contract
tests.

## Premium — settled

Measure 4 is subjective, and it is anchored so that it is not merely taste on the day.

**(a) Data-editorial references — Bloomberg Originals, The Economist, FT — for
*composition*.** Density, hierarchy, restraint, how a number is made to carry a sentence.

**(b) Essayistic references — Vox, Johnny Harris — for *pace only*.** Cut rhythm and
push-ins. Pace lives in motion profiles and in a `cameraPush` action; it never becomes a
capability. There is no `Map`-style capability hiding in this reference, and reading it as
one is how a catalog acquires a scene it does not need.

## When the gate may be run — specified here

The gate measures reach across a library. Run against today's catalog it would measure
almost nothing, and that is worth stating precisely rather than as an intuition:

- **`image_context` publishes zero actions**, so measure 2 — the hard-fail one — is
  untestable on half the catalog. This is the stated reason group 4 (`annotate`,
  `cameraPush`, `recontextCrop`) comes before groups 2 and 3.
- **With two capabilities, measure 3 has almost nothing to be wrong about.** Selection
  relevance needs briefs for which at least two capabilities are plausible; otherwise it
  scores the absence of alternatives.

Entry conditions, therefore: every capability in the catalog publishes at least one action;
every capability meets §15's checklist including its three examples with an edge case and an
empty case; and the majority of the ten briefs admit more than one plausible capability.
**How many capabilities that takes is the user's call** — the PRD says 8–12 for V1, and the
gate does not need all of V1 to be informative.

## What a run leaves behind — specified here

Raw artifacts — transcripts, generated directory, plans, reports, renders — go to
`.scratch/measure/<date>/`, which is gitignored in full.

The **scorecard** is committed, appended to the *Runs* section below: date, model and
version, the catalog commit it ran against, the five results, the verdict, and — the part
that matters six weeks later — **what it sent back to the catalog**. A gate whose findings
are not traceable to the repairs they caused is a number, not a measurement.

## What voids a run — specified here

Each of these has an argument behind it; none is procedural fussiness.

- The agent could reach `packages/video/src`.
- A brief was written, edited or "clarified" by anyone who had read the catalog.
- The catalog changed between the first brief and the last.
- A render was seen during the cold pass.
- `validate` was reachable during the cold pass.

**Re-running on the same briefs after a repair is a regression check, not a fresh
measurement.** It is legitimate and expected — it is how you learn the repair worked — but
the briefs are no longer blind to the catalog, because the catalog was changed in response
to them. A fresh number needs fresh briefs, written under the same bias control.

## Decisions I made writing this down

Each of these is operational detail the handoff never carried. Veto any of them and the
sections above change accordingly.

1. **Warnings do not count against measure 1.** Follows rule 5, but it is a choice: it means
   a plan full of `SOFT_LIMIT_EXCEEDED` scores as valid.
2. **A correctly declined brief scores as relevant in measure 3.** Otherwise the ceiling is
   8/10 and the threshold demands perfection on the servable eight.
3. **A false decline fails measure 5.** Without it, refusing everything is a perfect score.
4. **`validate` is withheld in the cold pass.** The strictest reading of "one shot, no
   feedback", and the one that makes the two passes measure different things.
5. **`UNKNOWN_ANCHOR` is *not* counted in measure 2**, though I think it should be. Session
   11 published `ANCHOR_GRAMMAR` to the manifest precisely so anchors are learnable, which
   makes an unparseable anchor exactly the species measure 2 names. Left out because
   tightening a hard-fail measure is not a thing to do while writing down someone else's
   decision. It is the one item here I would actively argue for.

## Open, deliberately

- **How many capabilities before the gate runs at all** — see *When the gate may be run*.
- **Who judges measures 3 and 4 if the user is unavailable.** No answer that keeps the
  measure honest has been found; a model judging plans it could have written is not one.
- **Whether a second run reuses the model of the first.** Comparing across models measures
  the model; comparing across catalog commits with one model is what the gate is for.

## Runs

None yet.
