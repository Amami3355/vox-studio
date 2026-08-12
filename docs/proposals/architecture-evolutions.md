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

`Map` is the one worth naming separately, because it is also what the essayistic reference
films are made of. What those films contribute here is *pace* — cut rhythm, push-ins — and
that lives in motion profiles and a `cameraPush` action, not in a capability. If maps are
still wanted after the measure, that is step 8 proper and it will have earned its place.

---

## Deferred, by design

- **Quality Agent.** The warning contract exists; the loop does not. §8.2 explicitly
  reserves this, and debugging an oscillating compiler↔agent loop the night before a
  demo is a bad time.
- **Image snapshot tests.** §9.4 asks for them. Worth adding once tokens stabilise.
- **Multiple themes.** The `Theme` type supports them; only `editorial-cold` exists.
