# The measurement gate

**Status:** accepted · 2026-08-13 · not yet run
**Scope:** §13 step 9 — "test au harnais généraliste". What is measured, on what, by whom,
under what isolation, and what a result obliges the project to do. Nothing about the agent
crew of PRD §17: this gate runs *before* them and deliberately does not need them.

## Why this document exists

The gate was settled in grilling sessions and then recorded **nowhere but a handoff file in
the OS temp directory**, carried forward by hand for seven sessions on the understanding
that one temp cleanup would lose it. This is that conversation written down.

Everything below is settled. The *settled* and *specified here* labels are kept as
provenance, not as confidence: *settled* marks what came out of the earlier grilling
sessions, *specified here* marks operational detail this file proposed on 2026-08-13 and had
confirmed the same day. Both bind equally. Knowing which is which is what lets a future
reader reopen one without reopening the other.

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

The **warning count is still recorded**, as a reported number with no threshold attached.
Folding warnings into the threshold would let a soft failure fail the gate — rule 5's line,
crossed — but a plan tripping `SOFT_LIMIT_EXCEEDED` and `TITLE_DENSITY` on every scene
scores 100% valid, and that is a fact the scorecard should carry rather than hide. Measure 4
is where an ugly-but-valid plan is meant to be caught.

**2 — Invention.** Machine-computable, no judgement: the number of `UNKNOWN_CAPABILITY`,
`UNKNOWN_ACTION`, `UNKNOWN_LAYOUT`, `UNKNOWN_SLOT` and `UNKNOWN_ANCHOR` errors across the
cold-pass plans. Counted from `validateVideoPlan` and not `validateScene`, because
`UNKNOWN_SLOT` is raised on a *placement* — it carries a `sectionId`, not a `sceneId` — and
an invented slot on a persistent element is the same defect seen one level up. Nonzero fails
the gate outright, whatever the other four say.

**The line is names and forms that do not exist.** `UNKNOWN_ANCHOR` counts because an
unparseable anchor is invented *grammar*, and session 11 published `ANCHOR_GRAMMAR` to the
manifest precisely so the grammar is learnable — an agent writing `b2.word:London+short`
after reading the block that says word anchors take no offset has invented a form. What does
*not* count is well-formed vocabulary used at the wrong moment: `AMBIGUOUS_ANCHOR` names a
word the beat really speaks, twice, and `DEICTIC_ANCHOR_REQUIRED` resolves fine and lands
somewhere the narrator is not looking. Both are measure 1's business.

**A hard fail completes the run.** The verdict is failed the moment the count is nonzero,
but every other measure is still computed, because those numbers are what say *which* repair
to make — and the briefs' blindness is spent the moment they are used, so abandoning a run
throws away the only unbiased read those ten briefs will ever give to save compute that
costs nothing. Rule 2 is why: the agent sees
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

## When the gate may be run

The gate measures reach across a library. Run against today's catalog it would measure
almost nothing, and that is worth stating precisely rather than as an intuition:

- **`image_context` publishes zero actions**, so measure 2 — the hard-fail one — is
  untestable on half the catalog. This is the stated reason group 4 (`annotate`,
  `cameraPush`, `recontextCrop`) comes before groups 2 and 3.
- **With two capabilities, measure 3 has almost nothing to be wrong about.** Selection
  relevance needs briefs for which at least two capabilities are plausible; otherwise it
  scores the absence of alternatives.
- **The manifest publishes no check vocabulary**, and in the cold pass `validate` is
  withheld, so nothing the compiler checks is knowable. ADR-0006 closes this, and the gate
  should not be run before it does — the same argument that made publishing the anchor
  grammar block session 11's work rather than follow it.

Entry conditions, therefore: ADR-0006 is carried out; every capability publishes at least
one action; every capability meets §15's checklist including its three examples with an edge
case and an empty case; and the majority of the ten briefs admit more than one plausible
capability.

**Depth and breadth are not the same preparation, and the build plan only buys one.** §14's
strategy is 8–12 capabilities × many variants, and groups 2, 3 and 4 are all variants of
`ImageContextScene` — after all three the catalog still holds **two** capabilities. Group 4
unblocks measure 2. *Nothing on the plan unblocks measure 3.*

**The gate runs at four capabilities**: `bar_chart`, `image_context`, then
TypographicStatement — the cheapest, being pure type with no assets and no resolver — and
Comparison. Four is enough for a brief to admit a wrong answer, which is all measure 3 needs
in order to stop being decorative. It is a weaker read than eight would give, and **the
capability count is recorded on the scorecard as a caveat on measure 3** rather than left for
a reader in September to reconstruct.

**Order:** ADR-0006 → group 4 → TypographicStatement → Comparison → run the gate.

**The cut line, revised.** The pre-agreed order was set when nothing but depth was on the
plan. Both depth items now cut before either breadth capability, because measure 3 is
decorative without breadth while depth only sharpens measures 1 and 4, which are already
measurable:

> group 3 → `cutoutOnFlat` → Comparison → repair-pass scoring.

**Never cut:** group 1, group 4, TypographicStatement, the contract tests, and the
content-stress suite of ADR-0003's last amendment.

## What a run leaves behind — specified here

Raw artifacts — transcripts, generated directory, plans, reports, renders — go to
`.scratch/measure/<date>/`, which is gitignored in full.

The **scorecard** is committed, appended to the *Runs* section below: date, model and
version, the catalog commit it ran against, the capability count, the five results, the
unscored warning count, the verdict, and — the part that matters six weeks later — **what it
sent back to the catalog**. A gate whose findings are not traceable to the repairs they
caused is a number, not a measurement.

**A partial scorecard is legitimate; a blocked run is not.** Measures 1, 2 and 5 are
machine-computable and complete without anyone watching. Measures 3 and 4 need the user, and
if they are not available those two record as **pending** rather than absent. Nobody else
judges them — a model scoring plans it could have written is not an independent judge, and no
substitute has been found that keeps the measure honest. What is not acceptable is holding
back three computable numbers for scheduling reasons while the briefs' blindness expires.

**One model per series.** A run compares catalog commits, so the model is held fixed;
changing it starts a new series rather than adding to the old one. Model and version are on
the scorecard, which makes the break visible instead of inferred.

## What voids a run — specified here

Each of these has an argument behind it; none is procedural fussiness.

- The agent could reach `packages/video/src`.
- A brief was written, edited or "clarified" by anyone who had read the catalog.
- The catalog changed between the first brief and the last.
- A render was seen during the cold pass.
- `validate` was reachable during the cold pass.
- A brief was written or constrained for an **Agent production interface proof**.

That last one is the same bias control seen from the other side. A proof brief is engineered
*from* catalogue knowledge on purpose — it is written to force particular capabilities, an
action, a word anchor — which is exactly right for proving the production interface works and
exactly what voids a measurement. Such a brief is permanently ineligible for the ten. Its
successful reuse may serve **regression testing only** and can never enter a scorecard as a
blind brief.

**Re-running on the same briefs after a repair is a regression check, not a fresh
measurement.** It is legitimate and expected — it is how you learn the repair worked — but
the briefs are no longer blind to the catalog, because the catalog was changed in response
to them. A fresh number needs fresh briefs, written under the same bias control.

## The operational decisions, and what they cost

Detail the handoff never carried, proposed when this file was written and confirmed the same
day. Recorded with their costs rather than as bare rulings, because the cost is what a future
reader needs in order to reopen one honestly.

1. **Warnings do not count against measure 1**, though the count is reported. Follows rule 5.
   Cost: a plan tripping every soft limit scores 100% valid, and only measure 4 catches it.
2. **A correctly declined brief scores as relevant in measure 3.** Otherwise the ceiling is
   8/10 and the threshold demands perfection on the servable eight.
3. **A false decline fails measure 5.** The load-bearing half: measure 5 exists to catch
   force-fitting, and without this it rewards the opposite pathology instead of catching it.
4. **`validate` is withheld in the cold pass.** The strictest reading of "one shot, no
   feedback". It separates what the *manifest* taught from what the *error messages* taught,
   which are two repairs with two different owners. Cost: the cold pass measures a condition
   that never occurs in production — deliberately, because with `validate` in both passes the
   two passes measure the same thing and the second one reports nothing.
5. **`UNKNOWN_ANCHOR` counts in measure 2.** Added on the line drawn under measure 2 above:
   names and forms that do not exist. Cost: it makes a hard-fail measure stricter, so it is
   the one decision here that can fail the gate on its own.

## Open

Nothing. The three questions this file opened with — how many capabilities, who judges 3 and
4 without the user, and whether a run reuses the previous model — were closed the same day,
and the answers are in *When the gate may be run* and *What a run leaves behind*. What
remains unknown about the gate is its results.

## Runs

None yet.
