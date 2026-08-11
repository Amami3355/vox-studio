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

## [already deviating] `SceneCapability.checks`

Added an optional per-capability hook for referential integrity that the generic
validator cannot express: a `highlight` naming a label absent from `data`, or a
`highlightBar` payload pointing at a bar that does not exist.

The frozen doc identifies "renders perfectly, animates nothing" as the most dangerous
failure mode (§4.2) but only closes the *action name* half of it. A valid action name
with a dangling label reference fails exactly the same way and was not covered.

---

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

## Deferred, by design

- **Quality Agent.** The warning contract exists; the loop does not. §8.2 explicitly
  reserves this, and debugging an oscillating compiler↔agent loop the night before a
  demo is a bad time.
- **Image snapshot tests.** §9.4 asks for them. Worth adding once tokens stabilise.
- **Multiple themes.** The `Theme` type supports them; only `editorial-cold` exists.
