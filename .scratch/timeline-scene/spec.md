# Spec — the `timeline` SceneCapability

Status: stage 1 built — `spine` shipped on `capability/timeline`, `ledger` and `lanes` open

Built 2026-08-22: `packages/video/src/scenes/TimelineScene/` (eleven files), the pure
geometry module `packages/video/src/primitives/timelineLayout.ts`, the L1
`primitives/TimelineSpine.tsx`, and the registry line. Two decisions in this spec were
overtaken by the code and are recorded where they landed:

- **`meta.capacityByComposition` is not declared.** `catalog/build.ts` requires
  `seriesField` to name an array of required `{ label: string, value: number }` so the
  compiler's `aggregateBeyond` can run over it, and an event has no value to aggregate.
  The per-layout number is published as `constraints.events.recommendedMax` instead,
  computed by `timelineCapacity()` and recomputed across every theme and motion profile by
  `tests/timeline-layout.test.ts`. Reasoning in `constraints.ts`.
- **Event dates must be *strictly* ascending.** The spec says "ascending"; `utcTimeAxis` —
  the arithmetic this capability was told to reuse rather than reimplement — throws on
  equal dates, and two events at one axis position draw on top of each other. The refusal
  names the repair: one label that carries both.

## Problem Statement

The catalog can compare, trend and count. It cannot say *when*.

Three of the six shipped capabilities are charts, and two of them already redirect the
editorial intent for a chronology to a capability that does not exist: `bar_chart`'s
`avoidWhen` carries `a sequence of dated events → timeline`, and `line_chart`'s carries
`showing dated events without a numeric measure → timeline`. A code-blind Visual Planner
that follows either redirection arrives at nothing. Its only repairs are to misuse a chart
— inventing a numeric measure so that dated events have something to be plotted against —
to flatten a sequence into one `stat_counter`, or to author an unknown capability that
compilation rejects.

`docs/proposals/architecture-evolutions.md` names the same gap and its cost: a catalogue
that can compare, trend and count "has no way to say *when*, *where*, *who*, or *what this
chapter is*", and §14's target of 8–12 capabilities was never a count for its own sake — it
is the breadth at which a sequence of correct frames becomes a film. `timeline` is the
first entry on that table, and the one the existing redirections have already promised.

The missing capability must make a chronology legible in a narrated video, be truthful
about elapsed time where it claims to be and honest where it is not, carry a period as a
first-class thing rather than as two events that happen to be related, degrade visibly at
its limits, and refuse the shapes that would render correctly while meaning something the
author did not write.

## Solution

Add a `timeline` SceneCapability for a sequence of dated events carrying no numeric
measure. A SceneInstance supplies a title, an ordered list of dated events, optionally one
or two named periods, and optionally a track name per event. The capability draws the
chronology in one of three layouts, all built from L0/L1 primitives and the existing dated
axis arithmetic.

The three layouts answer three different questions about the same material, and they were
chosen from four drawn candidates:

- **`spine`** — a horizontal axis where position is proportional to elapsed time. The gap
  between two events is information, not composition. This is the layout that makes a
  fourteen-month period visibly occupy fourteen months of the axis.
- **`ledger`** — a vertical register, one event per row, date in a left rail. Time is no
  longer to scale; what is bought back is room for a real sentence per event. A period is
  drawn twice over, and the two halves say different things: a full-width band opens it
  like an intertitle and carries its name and duration, and the rail runs in the accent
  from that band down to the period's last event, so the duration is the line itself rather
  than a plate behind the rows.
- **`lanes`** — two tracks on one shared proportional axis, for a chronology with two
  threads whose coincidence is the point. The coincidence is drawn as a shared tinted
  column, never as an arrow, per `Callout`'s own rule: at documentary scale an arrowhead
  reads as a diagram and a rule reads as editorial.

A fourth candidate — a full-bleed playhead sweeping era bands on the cold ground — was
drawn, reviewed and **deferred**, not rejected. It is a different rhythm rather than a
different arrangement: a single event holds the frame at chapter-card scale and the scene
needs sustained duration to read at all. `docs/adding-a-capability.md` says a second
arrangement with its own rhythm is a different scene, and that sentence is what puts this
one outside the capability rather than inside it as a fourth layout.

The three layouts that ship share one schema, one action vocabulary and one component that
branches on `layout` — the shape `bar_chart` already carries with `standard`, `horizontal`
and `withCallout`.

The feature is complete when a code-blind Visual Planner can discover and author the
capability from the generated catalog, when every referential and ordering shape that would
mislead is refused with an actionable repair, when the published capacity table is
recomputed from the arithmetic the scene actually runs, and when the six gates in
`docs/adding-a-capability.md` pass.

## User Stories

1. As a viewer, I want to see a sequence of dated events in the order they happened, so that I can follow a chronology rather than assemble one from separate shots.
2. As a viewer, I want the events placed proportionally in time in the `spine` layout, so that a two-year silence looks like a silence and not like a gap between two labels.
3. As a viewer, I want the years labelled beneath the axis, so that I can situate the chronology without being told each date aloud.
4. As a viewer, I want the first and last events always labelled, so that I know the span the chronology covers.
5. As a viewer, I want crowded intermediate event labels stacked onto separate lanes rather than overlapped, so that a dense cluster of dates stays readable.
6. As a viewer, I want a named period drawn as a continuous thing with a start and an end, so that "for fourteen months" is something I can see rather than something I have to compute from two dates.
7. As a viewer, I want the period labelled with its own name and duration, so that I know what the marked stretch of time *is*.
8. As a viewer, I want a period that begins before the first event or ends after the last one to still be drawn in full, so that the axis tells me the truth about the span.
9. As a viewer, I want the event the narrator is naming to come forward while the others recede, so that the picture and the voice agree about which moment matters.
10. As a viewer, I want the focused event to arrive on the word the narrator says, so that the emphasis lands rather than trails.
11. As a viewer, I want an annotation attached to the event it explains, so that commentary does not float ambiguously over the chronology.
12. As a viewer, I want the annotation to stay on screen once it arrives, so that I can finish reading it after the narrator has moved on.
13. As a viewer, I want the `ledger` layout to give each event room for a full sentence, so that a chronology whose events need explaining is not reduced to four-word labels.
14. As a viewer, I want a period in the `ledger` to be opened by a band carrying its name and duration, and closed by the rail returning to grey, so that I can see where the marked stretch begins and ends without counting rows.
15. As a viewer, I want the `lanes` layout to show two threads against one axis, so that I can see that two things happened close together without being told so.
16. As a viewer, I want each lane named and colour-tagged, so that I know which thread a given event belongs to.
17. As a viewer, I want lane names set in readable ink rather than in the lane's own tag colour, so that a colour chosen to fill a shape is not asked to carry text.
18. As a viewer, I want a chronology with no events to show a designed empty state under its title, so that a data gap reads as a deliberate frame and not as a broken render.
19. As a viewer, I want the scene to look like the rest of the film, so that a chronology does not arrive as a visitor from a different design system.
20. As a Visual Planner, I want `timeline` to exist in the manifest, so that the `avoidWhen` redirections in `bar_chart` and `line_chart` lead somewhere.
21. As a Visual Planner, I want `meta.summary`, `useWhen` and `avoidWhen` to tell me when a chronology is the right shot, so that I can choose the capability before I read its schema.
22. As a Visual Planner, I want `avoidWhen` to redirect me to `line_chart` when my events carry a measure that moves, so that I do not draw a trend as a list of dates.
23. As a Visual Planner, I want `avoidWhen` to redirect me to `diagram` when my steps have an order but no dates, so that I do not invent dates to reach a timeline.
24. As a Visual Planner, I want each layout's `description` to say what it is for, so that I pick between them on editorial grounds rather than by trying them.
25. As a Visual Planner, I want to write dates as calendar strings, so that I never author a frame.
26. As a Visual Planner, I want to write event timing as symbolic anchors, so that I never author a frame here either.
27. As a Visual Planner, I want to name a spoken word for the moment an event takes focus, so that the emphasis is tied to the narration rather than to arithmetic on a beat.
28. As a Visual Planner, I want the capability to publish how many events each layout carries, so that I can size a chronology before I write it rather than after a warning.
29. As a Visual Planner, I want to be refused when I write events out of date order, so that a chronology I got wrong fails loudly instead of being silently sorted into something I did not write.
30. As a Visual Planner, I want to be refused when two events carry the same label, so that an event reference cannot silently pick one of two.
31. As a Visual Planner, I want to be refused when I focus or annotate a label that no event carries, so that an event that targets nothing fails at validation rather than at the render.
32. As a Visual Planner, I want to be refused when I write a focus or an annotation before the reveal that mounts the events, so that I do not emphasise something still held back.
33. As a Visual Planner, I want to be refused when I pick `lanes` with only one track, so that I do not get a two-lane frame with one empty rail.
34. As a Visual Planner, I want to be refused when I pick `spine` or `ledger` while my events carry two tracks, so that a track I authored is never silently dropped from the picture.
35. As a Visual Planner, I want to be refused when a period ends before it starts, so that a nonsensical duration does not reach a renderer.
36. As a Visual Planner, I want every refusal to name the repair, so that I can fix the plan without reading the code that rejected it.
37. As a Visual Planner, I want at least three normative examples, so that I learn the shapes I should write by copying them.
38. As a Visual Planner, I want an example at the edge of the recommended band and an example of the empty state, so that I learn where the capability degrades and what it does there.
39. As a Visual Planner, I want a soft warning rather than a refusal when I exceed the recommended event count, so that a dense chronology still compiles and still tells me what it cost.
40. As a maintainer, I want the capability to be one folder plus one line in the registry, so that adding it costs what `docs/adding-a-capability.md` says it costs and no more.
41. As a maintainer, I want the dated-axis arithmetic reused rather than reimplemented, so that two capabilities cannot disagree about where a date sits on an axis.
42. As a maintainer, I want the new geometry to live in a pure module with no React in it, so that it can be tested without a browser.
43. As a maintainer, I want the published capacity table recomputed from that module by a test, so that a number in `meta.ts` cannot drift from the arithmetic the scene runs.
44. As a maintainer, I want the ordering and referential refusals judged on written order rather than resolved frames, so that they fail at validation before anyone has paid to record a take.
45. As a maintainer, I want the layouts added one at a time, so that the first one is proven end to end before the second one is drawn.
46. As a maintainer, I want the accepted key frames to carry a sentence about what changed in the picture, so that a moved hash is a decision somebody made rather than a number somebody pasted.
47. As a maintainer, I want recessive text held to a floor, so that the capability does not inherit a contrast level nobody measured.
48. As an editor in the studio, I want the scene's props to be the only thing I can change, so that I cannot break the chronology's geometry by editing an instance.

## Implementation Decisions

### The shape: one capability, three layouts

`timeline` is one capability with `layouts = { spine, ledger, lanes }`, one `schema.ts`, one
action vocabulary and one `Component.tsx` that branches on the instance's `layout`. This is
`bar_chart`'s shape and not a new mechanism: `catalog/build.ts` already validates that
`capacityByComposition` covers exactly the declared layouts, and `catalog/validate.ts`
already refuses an unknown layout on an instance.

The rejected alternative was a second capability for the two-track form. It would duplicate
the dated-axis arithmetic, the action vocabulary and the refusals for a case that is a
variant of *arrangement*, not of *kind* — and the catalogue's weak axis is kind.

`docs/adding-a-capability.md` says to start with one layout. That is honoured as a build
order, not overridden: `spine` ships as the only layout and is proven end to end before
`ledger` is drawn, and `lanes` last because it is the only one that adds a field.

### Family

`family: 'context'`.

`SceneFamily` is a closed set — `data | context | character | typography | geo | diagram` —
and none of its members is "documentary". Widening a core type for one capability is not
worth it: `family` is coarse grouping for the studio grid, and the editorial fact the agent
actually reads is `summary` / `useWhen` / `avoidWhen`.

`context` is the right member of the existing set. A chronology situates; that is what
`image_context` does with a photograph. `data` was considered and rejected because it would
put the capability in the same family as the three charts while its own `avoidWhen` exists
precisely to say it is not one — a timeline carries no numeric measure.

### Schema

Props, all authored, `.strict()`, a `.describe()` on every field:

- `title` — the headline. Soft-limited, fitted by the shared type ladder.
- `events` — an ordered array of `{ date, label, track? }`.
  - `date` is a calendar string, never a frame. Same domain as `line_chart`'s `points[].date`.
  - `label` is the event, short enough to be set as display type.
  - `track` is optional and names the thread the event belongs to. Absent means one track.
- `periods` — an optional array of `{ label, from, to }`, 0 to 2 entries.

There is no `scale` or `orientation` prop. Whether time is proportional is a property of
the layout — `spine` and `lanes` are proportional, `ledger` is ordinal — and a prop that
restated it would let an instance ask for a combination no layout draws.

There is no `detail` field on an event. Durable per-event prose arrives through the
`annotate` action, which is where `line_chart` already puts it; a prop would give the same
text two homes and no way to time it.

`track` is to `timeline` what `series` is to `line_chart`: the field that turns one drawing
into a comparison. One distinct value is the ordinary case; two is `lanes`.

**The axis extent is the union of the event dates and the period bounds.** A period that
starts before the first event or ends after the last is drawn in full and widens the axis
rather than being clipped, so no refusal is needed for it.

### How a period is drawn, per layout

`spine` draws a period as a band behind the axis, labelled inside it. `lanes` draws it as a
tinted column crossing both rails. `ledger` was the one that needed deciding, and it was
decided by drawing: **the period is opened by a full-width band that replaces the hairline
between two rows**, carrying its name and duration, with the rail turning accent at the
band's top edge and grey again at the period's last event.

Three horizontal placements were drawn and compared before this one was chosen — the band,
the label set on the opening event's row aligned right, and the label in the date gutter.
The gutter version was rejected for a reason that reaches past the drawing: the gutter is
270px, which forces the period's name to one word, and that would have become a length
ceiling on `periods[].label` published in `constraints.ts`. A composition choice that
constrains a field is worse than one that costs pixels. The band costs pixels.

**What the band costs, and where it comes from.** It takes a fixed vertical slice out of the
list — roughly one spacing step plus its label — and that slice comes out of the room the
rows had. It is therefore not free with respect to capacity: `ledger` holds fewer events
when a period is present than when one is not. See the capacity note below; this is exactly
the kind of arithmetic that drifts if it is asserted rather than computed.

A period is drawn once. Two periods in a `ledger` are two bands, and the rail carries the
accent through both — which is the case the 0–2 ceiling on `periods` exists to bound.

### Actions

Three verbs, mirroring `line_chart`'s vocabulary so that an agent that has learned one data
scene has learned this one:

- `revealTimeline` — holds the events back and then reveals them, staggered in date order.
- `focusEvent { label }` — brings one event forward and recedes the rest.
  **Declares `deicticFields: ['label']`.** It is a pointing gesture: it says "this one", and
  "this one" is only true while the narrator is saying it. The anchor to write is therefore
  the word form (`b4.word:Karlsruhe`), never `b4.start`.
- `annotate { label, text }` — attaches one durable explanation to a named event.
  **Declares no deictic field**, for the reason `ActionDef` already gives for `bar_chart`'s
  `annotate`: the note's timing follows the sentence that *justifies* it, which may be a
  beat away, and holding it to the landing rule would be wrong rather than strict.

`state.ts` stores entrance frames inside the state rather than reading `resolveEvents`'
`since`, per the trap in `docs/adding-a-capability.md`.

### Refusals (`checks.ts`)

All of them judge **written order, not resolved frames**, per ADR-0011 — so they fail at
`validate`, before a take exists and before anyone has paid to record one.

1. **Events out of ascending date order** → error. The chronology is not sorted for the
   author. ADR-0011's own history is the argument: the runtime *does* sort events by frame,
   and that sort is exactly what turned an out-of-order list into a silent defect instead of
   a visible one. A timeline that quietly reordered its dates would repeat that, one level up.
2. **Duplicate event `label`** → error. `focusEvent` names a label, and two identical labels
   is the same shape as `AMBIGUOUS_ANCHOR`: picking one silently is the defect the reference
   exists to prevent.
3. **`focusEvent` / `annotate` naming a label no event carries** → `INVALID_PAYLOAD`, listing
   the known labels as `expected`. Direct `lineChartChecks` precedent.
4. **A focus or annotation written before `revealTimeline`** → `EVENT_BEFORE_ELEMENT_REVEALED`.
   Direct `lineChartChecks` precedent.
5. **`lanes` with fewer than two distinct `track` values** → error. The layout would draw an
   empty rail.
6. **`spine` or `ledger` with more than one distinct `track`** → error. This is the
   "renders fine, means something else" class: the frame would be correct and a dimension
   the author wrote would be missing from it.
7. **A period whose `to` precedes its `from`** → error.

Per the trap in `docs/adding-a-capability.md`, `checks.ts` is written *after* `Component.tsx`
or verified against it: refusals 5 and 6 are claims about how the component branches, and a
refusal that outlives the branch teaches the agent a rule that is not true.

### Constraints and capacity

`constraints.ts` publishes the soft band for `events` — a recommended minimum of 3, a
recommended maximum set to the **tightest layout at the full composition**, and a generous
absolute ceiling in the schema. Warning slightly early is the safe direction, and it is the
direction the codebase already takes.

`meta.capacityByComposition` publishes the per-layout number: `full: { spine, ledger, lanes }`,
with `seriesField: 'events'`. `catalog/build.ts` requires the entry to cover exactly the
declared layouts, so it grows as the layouts land.

**These numbers are computed, never asserted.** `layouts.ts` exports a `timelineCapacity()`
that derives them from the same tokens the component lays out with — the label pitch the
lane packer needs for `spine`, the row pitch for `ledger`, the track count for `lanes` — and
`tests/composed-capacity.test.ts` recomputes every published entry across every theme and
every motion profile.

**`ledger`'s capacity is not one number.** Its period band consumes list height, so the
layout holds fewer events with a period than without one, and `timelineCapacity()` takes the
period count as an input rather than assuming the worst or ignoring it. `capacityByComposition`
publishes one number per composition per layout and has nowhere to say "unless", so the
figure published for `ledger` is the one that is true whatever the plan writes — the
band-present case. Publishing the roomier number would be a promise the capability breaks
the moment an author adds the period the layout was chosen for. Warning slightly early is
the safe direction, and it is the direction `capacityByComposition` already documents for
motion profiles. `constraints.ts` told every agent for the life of the composed form
that `bar_chart` collapsed below the top 8 while it was actually collapsing below the top 3;
nothing was lying and nothing was checking. That is the failure this arrangement exists to
prevent.

### Compositions and regions

`supportedCompositions: ['full']` and `occupiesRegions: ['full']` to start.

`barChartMeta` is explicit about what a composition entry costs: *"Do not add an entry here
without drawing the frame and looking at it."* Its `occupiesRegions` read `['bottom', 'left']`
from the scaffold commit until a render put a narrator in the one corner that declaration
freed and the tallest bar's value label was drawn underneath it. Both lists here are
`['full']` and stay there until a frame has been drawn for something else.

Recorded for later: `ledger` is the one of the three that could plausibly survive a half
frame, because a vertical register degrades by dropping rows. `spine` cannot — a
proportional axis in half a width is no longer an axis — and that asymmetry is the reason
`capacityByComposition` is keyed by layout as well as by composition.

### Geometry seam

The dated-axis arithmetic is **reused, not reimplemented**:

- `utcTimeAxis` (`core/time-axis.ts`) already produces proportional positions and year ticks
  from a list of calendar dates.
- `layoutDateLabels` (`primitives/linePlotLayout.ts`) already packs colliding labels onto
  non-overlapping lanes while keeping a required set — which is exactly the crowding the
  `spine` layout meets, and the single largest thing the layout would otherwise have to
  invent.

`timeline` imports `layoutDateLabels` from `linePlotLayout.ts` rather than copying it. The
module's name becomes slightly narrower than its contents; that is cheaper and more
reversible than a rename, and if a third caller appears the module should be renamed to
something dated-axis-shaped rather than gaining a second copy.

The genuinely new arithmetic — event positions along the union extent, period band extents,
`ledger` row pitch, and `timelineCapacity()` — lives in a new pure module beside
`linePlotLayout.ts`, with no React and no theme object in its signature, following the split
`titleFit.ts` states in its own header: the measurement is a dependency of the decision
rather than part of it, which is what lets a test hand it a ruler that lies in a known way.

### Recessive ink

**Recessive *text* stops at `inkMuted`. The mixes below it are for lines, not for letters.**

The design-system audit done while drawing these frames found that `quietInk`
(`mix(inkMuted, bg, 0.45)`, `#A5A8AD`) runs 2.17:1 against `editorial-paper` and `axisInk`
(`mix(inkMuted, bg, 0.28)`, `#8C9199`) runs 2.89:1 — both well under 4.5:1, and under even
the 3:1 large-text floor. `theme.ts` promises that every value *in the theme* clears 4.5:1
on the light ground; the recessive mixes are computed on top of that promise and are not
covered by it, and nothing measures them.

`timeline` does not inherit that silently. Event dates and event labels — the material a
viewer reads — are drawn at `inkMuted` or darker in every layout. Ticks, rails, gridlines
and hairlines keep the lighter mixes, because a ruler that competes with what it measures
has failed and nobody reads a tick.

Two consequences are recorded rather than acted on here: a lane's tag colour comes from
`dataSeries`, which is a fill ramp, so a lane *name* is set in `inkMuted` and the colour is
carried by a swatch beside it; and `line_chart` draws its own date labels in `quietInk`
today. Changing `line_chart` is out of scope for this spec — see below.

## Testing Decisions

A good test here asserts what a plan author or a viewer can observe: a refusal and its
repair, a published number, a frame. It does not assert how the component is built. The
refusals are the sharp edge — `checks.ts` states rules the agent is taught, so a test that
pins a refusal is pinning a published contract, while a test that pins a DOM structure
pins something the next layout will move.

**Seams.** Everything rides an existing seam except one, and that one is the pure geometry
module:

| what is proven | seam | prior art |
| --- | --- | --- |
| the capability satisfies the catalog checklist | `tests/catalog-contract.test.ts` | automatic on registration — `describe.each` over the registry |
| refusals and their repairs | `tests/validate.test.ts` | the `line_chart` referential cases |
| event positions, label lanes, period extents, capacity | **new** `tests/timeline-layout.test.ts` against the new pure module | `tests/line-plot-layout.test.ts`, which tests `layoutDateLabels` with an injected monospace ruler |
| the published capacity table matches the arithmetic | `tests/composed-capacity.test.ts` | the `bar_chart` sweep across every theme and motion profile |
| the schema's ceilings actually draw | `tests/stress-cases.test.ts` + `tests/stress/cases.ts` | `line_chart`'s `stress.ts` hook |
| examples stay inside their safe area and their declared regions | `tests/render/safe-area.test.ts`, `tests/render/occupies-regions.test.ts` | automatic — both sweep the examples |
| the frames themselves | `tests/render/timeline.test.ts` | `tests/render/line-chart.test.ts` — harness plus accepted key-frame hashes |

The new seam is deliberately the highest one available: it is a pure function boundary with
no React, no browser and no theme object, so the arithmetic that decides whether a
chronology is readable can be tested directly instead of inferred from a rendered pixel.

**`stress.ts` is required**, and this is one of the cases the generic filler names as out of
reach. `tests/stress/cases.ts` sizes one field at a time and throws with two legal answers
when it cannot — bound it in the schema, or give the capability a control. `timeline` is
the third case, the same one `line_chart` is: its `date` strings must parse, be distinct and
ascend; a period's bounds must be dates from the same extent; and `lanes` needs exactly two
distinct `track` values. No per-field filler can produce an instance the schema accepts. It
is a hook and not a fixture — it reads its counts and lengths from the published projection
handed to it, and `tests/stress-cases.test.ts` holds it to that.

**The examples constraint bites here.** `focusEvent` declares `deicticFields`, and a scene
example has no take — `syntheticBeats` gives it `words: []`, so a word anchor resolved
against one throws by design. **`focusEvent` therefore cannot be illustrated in
`examples.ts` at all.** ADR-0012 says that is legal: illustrate it in a structural plan
example or leave it out, and do not invent a compensating example elsewhere. `examples.ts`
illustrates `revealTimeline` and `annotate`; `bar_chart` and `image_context` are the two
precedents for each half of that choice.

**Accepted key frames are decisions, not numbers.** A moved hash in
`tests/render/timeline.test.ts` is a picture a human has to look at — `scripts/still.mts`
into `.scratch/stills/` — and the accepted block carries a sentence saying what changed and
why, next to the hash.

**Gates.** All six from `docs/adding-a-capability.md`, compared by numbers rather than exit
codes. `pnpm catalog` is not optional and the unit suite will not tell you it was skipped;
`pnpm catalog:check` is the gate that goes red. `pnpm test:stress` is always in the list
here, because adding a capability touches a schema, a layout and `supportedCompositions`.
Biome's baseline is 9 pre-existing errors, not zero.

## Out of Scope

- **The playhead sweep.** Drawn and deferred, with its reasoning recorded above. If it is
  built it is a separate capability with its own spec, not a fourth layout here.
- **Composed forms.** `supportedCompositions` stays `['full']`. Adding `left` / `right`
  means drawing the frame and looking at it, and that is its own change with its own
  capacity entries.
- **Changing `line_chart`'s recessive ink.** The measurement is recorded here because
  `timeline` had to decide it for itself; applying it to `line_chart` moves accepted key
  frames in a suite this spec does not own.
- **A new theme token for recessive text.** Rejected: every theme would have to define it
  and nothing would check it. The rule is stated as a rule and applied in the component.
- **`AssetRequirement`.** `requiresAssets: false`. An archive clipping attached to an event
  is `archive_document`'s job, which is its own row on the evolution table.
- **Timeline zoom, date counters, and range brushing.** All three appear in the component
  inventory; none of them is needed to say *when*, and each would add a rhythm.
- **The studio's own timeline** (§24 of the PRD, the strip of SceneInstances along the
  bottom of the editor). Same word, unrelated thing. Nothing in this spec touches it.

## Further Notes

**The word is overloaded and `CONTEXT.md` already warns about it.** The glossary's
`Placement` entry flags "SectionTimeline" as a name to avoid for generated `layoutStates`,
and §24 of the PRD calls the editor's instance strip a timeline too. This capability is the
third use. Nothing in the code should say "timeline" without a qualifier where the compiled
document or the editor could be meant.

**Write `meta.ts` and `schema.ts` first, and get the wording approved before anything
else.** Action descriptions and error strings are published to the agent; changing them
later means regenerating and re-reading every diff that quotes them. This is step 1 and 2 of
the procedure and it is the step most easily skipped.

**Build order**, each stage green before the next starts:

1. `meta.ts` + `schema.ts` + `constraints.ts` — wording approved.
2. The pure geometry module and its unit tests. No component yet.
3. `spine` as the only layout: `layouts.ts`, `actions.ts`, `state.ts`, `Component.tsx`,
   `examples.ts`, `checks.ts`, `index.ts`, the registry line, `pnpm catalog`.
4. Render tests and accepted key frames for `spine`.
5. `ledger`, with its capacity entry and its own accepted frames.
6. `lanes`, the `track` field, and refusals 5 and 6.
7. `stress.ts` and the stress sweep.

Splitting this into tickets is `/to-issues`' job, not this spec's.

**The design canvas the three layouts were drawn on** carries each layout at 1920×1080 in
the real design system, with the motivation and the cost of each recorded beside it. The
frames are the reference for what "readable" means at each capacity number, and they are
where the capacity figures should be sanity-checked before the arithmetic is trusted. It
also carries the three period-label placements compared for `ledger`, of which the band is
the one that shipped.

**Both `ledger` frames on the canvas are four events with one period.** That is the shape
the band was judged at, and it is one event below the point where the band's cost has to be
paid by something other than slack. The first thing to draw when `timelineCapacity()` exists
is a `ledger` at its own published ceiling with a period in it, and to look at it.
