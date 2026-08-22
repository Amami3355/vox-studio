# Proposals against the frozen architecture

`vox-studio-architecture-figee.md` is frozen for the hackathon. Its §0 says proposals
accumulate here and are dealt with after the demo. Nothing in this file has been applied
to the frozen document.

Entries marked **[already deviating]** describe code that does not match the letter of
the frozen doc, with the reason. Everything else is a suggestion for later.

---

## [already deviating] `layout` and `motionProfile` are not in the props schema

**Frozen doc:** §4.1 puts `motionProfile` and `layout` inside `barChartSchema`.
**Code:** they live on the `SceneInstance`, as siblings of `props`.

The doc contradicts itself: §7.1 and §10 both show them at instance level, next to
`props`, which is also where `SceneInstance` places them. Keeping them in both would
force `validateScene` to reconcile two sources for the same field — a direct violation
of rule 1. Instance level wins because that is what the compiled document format uses.

---

## [already deviating] Zod 4 instead of Zod 3 + `zod-to-json-schema`

**Frozen doc:** §6.1 uses `zodToJsonSchema(scene.schema, { target: "openApi3" })`.
**Code:** `z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' })`.

Same output, one fewer dependency, faster validation. See ADR-0001.

---

## [already deviating] Resolved assets travel beside the plan, not inside it

**Frozen doc:** §5.2 has the Asset Resolver rewrite the plan, so a scene's `AssetRef`
arrives *inside* it — "Plan avec AssetRef en status ready | placeholder | failed".
**Code:** the plan is never rewritten. `SceneProps` gains an `assets` input
(`core/types.ts`), a `ResolvedSceneAssets` value keyed by the requirement field
(`core/assets.ts`), and `resolveSceneAssets` returns it without touching `props`.

Rewriting the plan would put a resolver output where an agent writes its input. The
manifest is generated from the same schema the agent authors against, so an `AssetRef`
reachable from `props` is an `AssetRef` the Visual Planner learns to write — and rule 1
gives it no second source of truth to be corrected against. Keeping the resolved
reference on a separate runtime channel is what lets `assetRequirement` stay strictly
semantic and lets the future compiler reject a missing reference without ever teaching an
agent to author one.

The cost is one extra input threaded through the generic renderer, which every
capability now carries whether or not it needs assets. `NO_RESOLVED_SCENE_ASSETS` keeps
that free for the capabilities that do not.

---

## [already deviating] `SceneCapability.checks`

Added an optional per-capability hook for referential integrity that the generic
validator cannot express: a `highlight` naming a label absent from `data`, or a
`highlightBar` payload pointing at a bar that does not exist.

The frozen doc identifies "renders perfectly, animates nothing" as the most dangerous
failure mode (§4.2) but only closes the *action name* half of it. A valid action name
with a dangling label reference fails exactly the same way and was not covered.

---

## §7.2 "alignement forcé" becomes "TTS + timepoints"

**Frozen doc:** §7.2 puts `TTS + alignement forcé` between the beat plan and the timed
beats, and §12 makes it an imperative constraint of the vertical slice.
**Decision:** ElevenLabs `/v1/text-to-speech/{voice_id}/with-timestamps`, beat boundaries
derived from n+1 character start-offsets. Was Google Cloud TTS `v1beta1` with one SSML
`<mark>` per boundary, until ADR-0004.

Character timings give beat boundaries exactly; an aligner would give them approximately.
The distinction survives the change of provider — timestamps returned *by the synthesiser*
are a report, not an inference — so §7.2's "alignement forcé" is still not what was built.
See ADR-0004, and ADR-0002 for the argument it inherits.

## The anchor grammar gains a word form

**Frozen doc:** §7.2's anchor vocabulary is entirely beat-relative, and §12 requires that
"les événements tombent sur les mots attendus" without saying how an event names a word.
**Decision:** the grammar gains `<beatId>.word:<word>` beside `start|mid|end`, and the take
carries a word onset per word. `ANCHOR_RE` is gone: one grammar in `core/anchor-grammar.ts`,
parsed by both the validator and the resolver, with one tokeniser in `core/words.ts` shared
with the fold.

The first real take showed the two are not the same requirement. Boundary anchors are exact
and still landed on the wrong words, because arithmetic over a beat cannot name one — the
slice highlighted London on the exact frame the narrator began "Berlin". ADR-0002 expected
to close this with a snapping rule and the measurement rejected it: the failing anchor was
already on an onset. Rule 3 is unaffected — an agent naming a word writes less arithmetic
than one naming a midpoint, not more. See ADR-0002's last amendment.

## §3 resolution is per scene, and relocation targets must already be declared

**Frozen doc:** §3 resolves competing slot occupations "frame par frame", and a resolvable
conflict moves the persistent element "vers un slot libre".
**Decision:** ADR-0003 makes the **scene** the unit of resolution — outputs stay
frame-accurate, but one outcome holds for a scene's whole duration — and narrows "free
slot" to a slot that element already uses elsewhere in the same section.

An element that appears and disappears inside one scene reads as a bug rather than as a
resolution, and a compiler free to place a character anywhere manufactures §9.3's "a
character that jumps" while fixing a slot collision. The same principle rejects carving a
safe area out of a scene that never declared it can render smaller: the compiler chooses
among declared alternatives or it hides the element.

## §7.2 and §10 name the same output differently

`SectionTimeline` in §7.2, `layoutStates` in §10. `CONTEXT.md` adopts `layoutStates`,
the name that survives into the compiled artifact.

## Aggregation past the soft limit produces 9 bars, not 8

§4.1 says values beyond rank 8 are aggregated into an "Others" bar, which yields
8 + 1 = 9 bars — above the recommended maximum of 8 stated two lines earlier.

The code follows the doc literally. The alternative is to keep the top 7 and let
"Others" be the eighth, which respects the stated soft maximum. Worth resolving once
someone has actually looked at both renders.

---

## `SceneCapability.schema` is a Zod schema, `SceneCapability.examples` are instances

§1.2 types `examples: SceneInstance[]`. In practice an example also needs a human-facing
title and a note saying what it demonstrates, so the code uses
`SceneExample = SceneInstance & { title, note }`.

The contract test relies on those notes to enforce "at least one edge case and one empty
case", which is a checklist item the doc states but provides no mechanism for.

---

## Anchor grammar was under-specified

§7.1 lists `b4.start`, `b4.end`, `b4.mid`, `b4.start+short`, `scene.end-short` without
defining the offsets. The code fixes `short = duration.quick` (12f) and
`long = duration.slow` (34f), resolves `scene` as a pseudo-beat, and clamps results
inside the scene rather than emitting negative frames.

---

## The compile report has no `ok` derivation rule

§8.2 types `CompileReport.ok` but never says what sets it. The code sets
`ok = errors.length === 0`; warnings never affect it. This is the only reading
consistent with §8.1/§8.3, but it should be stated.

---

## §13 step 8 becomes depth in the capabilities that exist, not four new ones

**Frozen doc:** §13 step 8 is "CharacterExplainer, TypographicStatement, Map, Comparison".
**Decision:** no new capability ships before the step 9 harness has measured the two that
exist. Step 8's budget goes into depth — `image_context` gains compositions, layouts, prop
slots and an action vocabulary, and every new composition ships its render-level contract
test in the same commit.

§14 already argues this and the two sections disagree: the catalogue strategy is "8–12
capabilities robustes × plusieurs layouts × plusieurs actions", against the alternative it
names and rejects, "40 scènes moyennes". Today's catalogue is two capabilities, and only
one of them is deep. `image_context` ships **one** layout, **zero** actions, and
`supportedCompositions: ['full']`, against §14's promise that a single `ImageContextScene`
covers full bleed, split, détourage sur aplat, and the rest.

Three consequences, each a reason the harness would otherwise measure the wrong thing:

- **"Actions inventées" is one of step 9's four measures**, and `image_context` has no
  action vocabulary to invent against. A capability with zero actions cannot fail that
  measure, which means it cannot pass it either.
- **ADR-0003's ladder has never met a scene that could yield.** Rung b needs a
  `supportedCompositions` entry that clears every element crossing the scene; with `full`
  as the only entry, every `image_context` conflict falls through to relocation or hiding.
  The joint solve committed in `4a3e064` is untested against the case it was written for —
  and ADR-0003 decision 6 says the way to make a character survive an `ImageContextScene`
  is to declare a composition and design that layout. That is this work.
- **Each new capability is another unverified claim.** ADR-0003's consequences record that
  a declared composition is trusted and nothing renders it to check. Four new capabilities
  would be four more of them, on a foundation that has not been checked once.

Order: compositions (`full`, `left`, `right`), then layouts, then prop slots, then actions.
Compositions and actions are the two the measures cannot do without; the middle two are
volume, and are the first things to cut if the schedule slips.

**Progress, 2026-08-15.** Both ends of that order are now done, and the two paragraphs
above are stale where they describe the code.

- **Compositions** — `supportedCompositions` has read `['full', 'left', 'right']` since the
  half-frame layout landed, and `tests/render/safe-area.test.ts` renders all three. The
  sentence above saying it ships `full` alone describes a state that no longer exists.
- **Actions** — `image_context` publishes `revealImage`, `revealCopy` and `emphasize`.
  `supportsEvents` is `true`. So "a capability with zero actions cannot fail that measure,
  which means it cannot pass it either" is closed: the harness now has something to
  measure invention against on both capabilities.

`emphasize` declares `deicticFields: ['text']`, which makes it the second action in the
catalogue held to a word by `DEICTIC_ANCHOR_REQUIRED` — and the first whose deictic value
is copy the agent invents rather than a key that must already appear in `props`. There is
no referential check standing behind it, so the landing rule is the whole of its guard.

One consequence worth recording, because it is a limit of the catalogue rather than of
this capability. **A scene example cannot demonstrate a deictic action.** An example has
no take, `syntheticBeats` gives it `words: []` (`core/anchors.ts`), and a word anchor
against it throws by design. So `image_context`'s scene examples demonstrate the two
reveals and not the stamp, exactly as `bar_chart`'s anchor `highlightBar` at `b3.start`.

**This is not a hole, and an earlier draft of this entry wrongly called it one.** It is now
**ADR-0012**, which decides that examples illustrate and refusals teach, records the three
channels that already publish the word form, and records the structural plan example that
was written to "fix" this and then removed. `CONTEXT.md` gained a **Teaching surface**
entry. Nothing further belongs in this file — the argument has a home.

**Still open from the order above:** layouts and prop slots — the two this entry already
called volume.

`Map` is the one worth naming separately, because it is also what the essayistic reference
films are made of. What those films contribute here is *pace* — cut rhythm, push-ins — and
that lives in motion profiles and a `cameraPush` action, not in a capability. If maps are
still wanted after the measure, that is step 8 proper and it will have earned its place.

**Progress, 2026-08-22.** The gate this entry set has not opened, and the question it was
answering has changed shape. Both need recording: the second is the reason to reopen step 8,
the first is the reason not to reopen it yet.

**The gate is still shut.** The rule above is that no new capability ships before the step 9
harness has measured what exists. `packages/production/src/proof/` is built, and its three
`proof-harness` cases do not pass — they need an external agent run, a Codex credential and a
TTS key — so no measure has been taken. Nothing below unblocks step 8 by argument. What
follows is what step 8 should *be* when the measure lands, written now because the list has
changed and a list decided under schedule pressure is the one that gets decided badly.

**Depth was the right axis and it is largely spent.** The catalogue is six capabilities, not
the two this entry describes: `bar_chart`, `image_context`, `quote`, `stat_counter`,
`line_chart`, `typographic_statement`. The order it set — compositions, layouts, prop slots, actions — is done at both
ends for `image_context`, and `quote` and `stat_counter` carry all three compositions with
`occupiesRegions` measured rather than hoped. Layouts and prop slots remain the open middle,
and they are still volume. **Two capabilities now ship `supportedCompositions: ['full']` and
so can never reach ADR-0003 rung b** — a persistent element crossing either relocates or
hides, and the scene never yields. `line_chart`'s is a first-increment non-goal to be paid
off. `typographic_statement`'s is the intent, argued in its own `meta.ts`, and nothing should
later "fix" it. Recorded here because the second one is a deviation from the plan of record,
not because the argument lives here.

`typographic_statement` also carries the registry's only `paintsOwnGround` declaration. It is
an internal `SceneCapability` render contract, not `SceneMeta`: the catalog already says that
the scene occupies and supports only `full`, while the flag exists solely to select the bitmap
reading used by safe-area and stress tests.

**What is left is not depth, it is kind.** Three of the six are charts, and the sixth is the
first entry in the table below to be built. A catalogue that can
compare, trend and count states a number well and cannot make an argument: it has no way to
say *when*, *where*, *who*, or *what this chapter is*. §14's target of 8–12 robust
capabilities was never a count for its own sake — it is the breadth at which a sequence of
correct frames becomes a film. That is the axis step 8 should buy, and it is not the axis this
entry ordered.

| Capability | What the film gains | Cost |
|---|---|---|
| ~~`typographic_statement`~~ **built** | Structure. Chapter and act cards are what divide a sequence into a film. | Low — type, motion and an internal render contract; no new manifest field |
| ~~`timeline`~~ **built** | Chronology, the documentary spine. `bar_chart` **and** `line_chart` redirected to it before it existed; both now land somewhere. Shipped with the `spine` layout only — `ledger` and `lanes` are specified and staged behind it. | Moderate |
| `character_explainer` | A presenter that carries the explanation. `PERSISTENT_ELEMENT_TYPES` already has `character`, placed and relocated under ADR-0003. | Moderate |
| `archive_document` | Evidence — a clipping, an extract, an annotated page. `AssetRequirement.type` already admits `document` and nothing consumes it. | Moderate |
| `map` | Place. `AssetRequirement.type` already admits `map`, likewise unconsumed. | Highest — projection, geo data, sourced assets |

Three of those are already §13 step 8's own row: `CharacterExplainer`, `TypographicStatement`,
`Map`. Its fourth, `Comparison`, is what `bar_chart` does. `timeline` and `archive_document`
are the additions, and both are the documentary register the row was written before the
vertical slice had picked one.

**Not recommended: `stat_donut` and `scatter_plot`.** Both are honest `avoidWhen` targets and
both are more chart. Building them deepens the axis that is already the catalogue's strongest
and leaves the weak one untouched.

**And the highest-value item is not a capability at all**, which is this entry's original
decision holding rather than failing. `quote` gaining an optional background `assetRequirement`
and a layout for it — copy held left over a full-bleed plate whose subject sits right — buys a
second register out of a capability that already measures its ink to x = 70.7% and already
declares all three compositions. That is depth, and it costs one prop, one layout and a render
test. Three things have to move with it:

- **`AssetRequirement` cannot ask for negative space.** `orientation` is an aspect ratio, not a
  composition, so there is no way to require that the subject sits right and the left stays
  clear — which is the entire premise. The field would be `Slot`-shaped, and it has to enter
  the identity key: the same subject composed left and composed right are two pictures, and
  the resolver matches on identity alone, never on subject.
- **Nothing verifies the returned pixels obey.** A `ready` plate whose subject lands under the
  copy is unreadable, and a legibility promise is rule 5's loud half. The repo's own idiom
  answers it — a scrim primitive as the repair, a contrast probe over the text region as the
  proof, in the shape `tests/render/occupies-regions.test.ts` and `StressControl` already use.
- **`quote.avoidWhen` reads `'pairing a claim with a photograph → image_context'`.** That line
  becomes false the day this ships and goes with it, or the catalogue redirects agents away
  from its own best frame.

A full-bleed plate also moves `occupiesRegions` to `['full']` by `image_context`'s own
reasoning — there is no quadrant it leaves empty — which costs `quote` the two free corners it
currently gives a character. That is a trade to make against a render, not on paper.

---

## Nothing above the section decides what the film is arguing

**Frozen doc:** rule 6 puts premium richness in "les scènes et leur mise en scène", and §1's
layers stop at the section runtime. **Code:** `videoPlanSchema` is `.strict()` with exactly two
keys, `beats` and `sections`, and a section is `{ id, spansBeats, persistent?, scenes }`. A
section is a span of time that owns elements. It carries no statement of what it is *for*, and
`.strict()` means there is nowhere to put one.

The absence is not a missing feature. It is a missing *check*, and it is the same defect class
as everything else in this repository. Every compiler check that exists decides whether a shot
is legible and honest — `BEAT_UNCOVERED`, `BEAT_DOUBLE_BOOKED`, `SCENE_CUTS_MID_SENTENCE`,
`MOTION_PROFILE_REPETITION`, `NARRATION_NAMES_COLLAPSED_VALUE`. Not one of them decides whether
the film says anything. A code-blind agent can therefore emit a sequence of individually
correct frames with no through-line, no act, no callback and no question ever answered, and
every gate stays green. The compile report will call it clean, because clean is the only thing
it was ever asked to decide.

**Why this is not an ADR yet.** There is no decision here, only an identified absence — and
this file's own history is the precedent. The deictic-example question lived here as an entry
until it was decided, became ADR-0012, and the entry then recorded that the argument had a home
and nothing further belonged in this file. The same sequence applies. What is open:

- Is an act a first-class noun in the plan, or a property derived from the sections?
- What may a compiler check without becoming a critic? Rule 5 puts most of dramaturgy on the
  soft side, and "your film is boring" is not a repair anyone can act on.
- Does the agent declare the structure, or is the structure inferred from what it wrote?

**The last question already has its answer implied.** ADR-0003 decision 4 keeps scene geometry
out of the compiler — it may only be *told*, never work it out — and `capacityByComposition` is
declared and checked, never computed. Dramaturgy would take the same shape: the plan states its
acts and what each one opens, and the compiler checks the declaration against itself. A
question opened in the first act and never returned to is a contradiction the plan supplies
both halves of, exactly like a narration naming a value the frame collapsed. That is checkable
with no taste in the compiler at all.

**One consequence for the catalogue, and it is no longer hypothetical.**
`typographic_statement` is the *visible* half of this and it now exists. Built alone, it
produces title cards that decorate rather than divide — worth having either way, and worth
considerably more once there is something for it to be the boundary of.

The gap has a name on the card. Its `ordinal` prop is a free string the agent writes by hand,
so a card reading "02 / 05" in a film with six acts validates, compiles and renders, and no
check in the system has anything to say about it. It is not derivable today for exactly the
reason above: a section carries no statement of what it is for, and `.strict()` leaves nowhere
to put one. **Deriving the ordinal is the first thing an act model would buy**, and it is the
cheapest possible demonstration that the model is real — a number that stops being a claim the
agent makes and starts being a fact the plan implies.

---

## Deferred, by design

- **Quality Agent.** The warning contract exists; the loop does not. §8.2 explicitly
  reserves this, and debugging an oscillating compiler↔agent loop the night before a
  demo is a bad time.
- **Image snapshot tests.** §9.4 asks for them. Worth adding once tokens stabilise.
- **Multiple themes.** The `Theme` type supports them; only `editorial-cold` exists.
