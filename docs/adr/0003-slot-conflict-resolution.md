# ADR-0003 — Slot conflict resolution

**Status:** accepted · 2026-08-12
**Scope:** what the compiler does when a scene's `occupiesRegions` overlaps a persistent
element's `placements`. §3 of the frozen document names the three outcomes — no conflict,
`SLOT_RELOCATED`, `PERSISTENT_ELEMENT_HIDDEN` — but never says which is tried first, what
makes a conflict irreducible, or where `safeArea` percentages come from. This decides
those three things, and nothing about time.

Open question 2 of `docs/handoff.md` is closed by this ADR. Open question 1 (arithmetic
anchor snapping) is untouched.

## Context

The decision was forced by `ImageContextScene`, which declares `occupiesRegions: ['full']`
and `supportedCompositions: ['full']`. Both declarations are truthful: `splitLeft` divides
the whole frame and leaves no quadrant empty, and with one layout the scene genuinely
cannot be composed into a half. `.scratch/image-context-scene/issues/06` records why the
metadata is an input to this decision rather than a defect to be edited away.

Against a `full` scene, `SLOT_RELOCATED` has nowhere to relocate to. The frozen doc's
remaining option is to hide the element — but a third path was available and had to be
ruled on: carve a safe area out of the scene and accept a tighter composition.

Two facts settle the shape of the rule.

**A character that jumps is a named failure.** §9.3 lists the problems that appear only in
sequence: slot collisions, brutal transitions, *a character that jumps*, rhythmic
uniformity. A compiler that eagerly relocates persistent elements to whatever slot is free
manufactures the third one while fixing the first.

**A carve nobody designed is not a degradation, it is an improvisation.** Rule 5 gives
soft constraints silent degradation — but degradation into a composition the capability
never declared support for produces a frame no one has ever looked at. `SlotFrame` will
happily shrink a 7/5 split until the copy column is unreadable.

## Decisions

**1. The compiler chooses only among alternatives someone declared.** It may move a scene
into a composition the scene lists in `supportedCompositions`, and it may move a
persistent element to a slot that element itself uses elsewhere in the same section. It
never invents a slot, and never carves a scene that did not declare it can render smaller.
When nothing declared fits, it hides and warns.

**2. The scene is the unit of resolution — for every element at once.** A scene has one
effective composition, held for its whole duration, and every persistent element crossing
it is resolved against that same composition in one pass. Four consequences, all of them
load-bearing:

- **An element that moves inside the scene is one crossing.** Its placements are resolved
  together: the scene must clear every slot the element occupies while it plays, and an
  element that relocates takes a single slot for the scene's whole duration. Position or
  visibility that changes mid-scene *as a resolution* reads as a bug.
- **The worst outcome wins, within one element.** Any irreducible part of a crossing hides
  that element for the whole scene. It never hides the others.
- **The scene yields for everyone or for no one.** A composition is taken only if it clears
  every element crossing the scene, including the ones that were never in the way. Yielding
  into a half that still contains someone rehouses the conflict instead of resolving it;
  yielding for one element while a second has to relocate anyway buys a smaller frame *and*
  a character that jumps — both repairs, for the benefit of one.
- **Elements are resolved in declaration order**, and a relocation target must clear the
  scene *and* everything already standing in it: elements the compiler is not moving hold
  their authored slots from the start, and each relocation adds its own. Two characters
  sent to the same free corner would be this rule's own failure, one level down.

**3. The ladder**, tried in this order, per scene:

| # | Condition | Outcome | Warning |
|---|---|---|---|
| a | No element's slots overlap the scene's occupancy | Everyone keeps what they declared | — |
| b | Overlap, and the scene declares a `supportedCompositions` entry that clears *every* element crossing it | The scene takes that composition; no element moves | `SLOT_RELOCATED`, per contending element |
| c | Overlap, no such composition, but a contending element declares a slot elsewhere in the same section that clears the scene and everything already standing | That element takes that slot for the scene's duration | `SLOT_RELOCATED` |
| d | Neither | The element is hidden for the scene's duration | `PERSISTENT_ELEMENT_HIDDEN` |

Rungs c and d are per element; rungs a and b are properties of the whole scene. The scene
yields before any element moves: a scene composed into a declared alternative is a
composition somebody designed, and a relocated element is a character that jumps. Where
both are possible, prefer the one that was drawn on purpose.

Ties are broken by declaration order throughout — the first entry of
`supportedCompositions` that clears everyone, and the first slot in the element's own
placement order that clears the scene. Nothing is scored, and nothing is optimised: a
compiler that picked the "best" composition would be picking between frames on a criterion
no one wrote down.

**4. `safeArea` is how a chosen composition reaches the component.** It is derived from the
scene's effective composition — the frame minus the rectangle the scene renders into,
reduced further by clearance for any retained element. This is why the component never
sees a slot and the agent never sees a percentage: `safeArea` is the translation, not a
second layout system.

**5. Slot geometry is one table, in `packages/video/src/core/slots.ts`.** Slots become
rectangles in percentage space; overlap is rectangle intersection and `safeArea` is derived
from the same table. The compiler is its only consumer. Two tables — one for overlap, one
for percentages — would drift.

**6. `ImageContextScene` therefore hides the persistent element** for its duration, and the
compiler warns. This is the rule applied, not an exception carved for it. To make a
character survive an `ImageContextScene`, declare a supported composition the scene can
render into and design that layout. That is a design act, in the capability, reviewed like
any other frame — not something the compiler should decide at 3am on the night of a demo.

**7. A scene's resolution depends on the whole section, and that coupling is stated rather
than discovered.** Rung c draws its fallback from slots the element occupies *elsewhere in
the same section*, so adding a placement at the end of a section can change an earlier
scene's outcome from hidden to relocated with nothing in that scene edited. That is
genuinely surprising if you read the compiler as a per-scene function, and it is the direct
price of decision 1: the only slots the compiler may use are slots a human put the element
in, and the section is the scope over which a persistent element is one continuous
character. The rule is kept and the surprise is paid for in the report — `SLOT_RELOCATED`
names the slot the element moved to, so the coupling is legible to whoever reads the
compile output rather than only to whoever reads this file.

## Considered options

**Carve a safe area out of any `full` scene rather than hiding.** Rejected. It preserves
continuity, which is the more valuable thing, but it buys it with a composition nobody
designed and no capability can refuse. It is also not reversible cheaply: once agents and
examples are built against scenes that silently shrink, taking it back changes every
render. Decision 6 keeps the door open at the only place it can be opened safely — the
capability's own declaration.

**Relocate the element before reflowing the scene** (the order the frozen doc's sentence
implies). Rejected for §9.3's reason above: it makes the compiler the author of character
movement.

**Relocate to any free slot**, rather than only to slots the element already uses.
Rejected. It is the same improvisation as an undeclared carve, applied to the element
instead of the scene.

## Deviations from the frozen document

Both recorded in `docs/proposals/architecture-evolutions.md`.

- §3 says resolution happens *frame by frame*. Decision 2 makes the scene the unit.
  Outputs stay frame-accurate; it is the *decision* that is not taken per frame.
- §3 says a resolvable conflict moves the element "vers un slot libre". Decision 1 narrows
  free to *free and already declared by that element in this section*.

## Consequences

- **`supportedCompositions` becomes load-bearing.** It is the only lever a capability has
  to keep a persistent element alive over it. A capability that declares one composition is
  declaring that persistent elements do not survive it.
- **A persistent element with a single placement in a section can only be kept or hidden.**
  Resilience is bought by declaring more placements, which is an authoring act with a
  visible cost — the right place for that cost to sit.
- `SLOT_RELOCATED` covers two different repairs. The warning message must say which
  happened; the code alone is ambiguous and the report is a deliverable, not a log.
- The slot geometry table is new work the Section runtime slice must carry, and it is the
  first thing in the codebase that assigns slots a size.
- **A declared composition is trusted, and nothing yet checks that it renders.** The
  compiler treats a `supportedCompositions` entry as proof that the capability has a layout
  for it, but the only thing a composition changes at runtime is `safeArea`: a capability
  that declares `left` without a layout designed for a half-frame gets squeezed, silently
  and legally. This is decision 1's bet, taken knowingly — the alternative is the compiler
  judging layouts it cannot see — but the bet is only paid off by a render-level contract
  test per declared composition, which does not exist yet. Until it does,
  `supportedCompositions` is a claim a reviewer has to check by eye.
- **The scene's yield is all-or-nothing, so a second persistent element can cost the first
  one its composition.** Adding an element that no composition can clear makes the scene
  stop yielding for the element that was previously kept in frame. That follows from
  decision 2 and is the intended trade, but it means the persistent layer of a section is
  resolved as a whole and cannot be reasoned about one element at a time.

## Amendments

**2026-08-12 — the render-level contract test exists, and decision 6 has been carried
out.** The consequence *"a declared composition is trusted, and nothing yet checks that it
renders"* is discharged. `packages/video/tests/render/safe-area.test.ts` is generated from
`supportedCompositions` itself — every capability × every composition it claims — so
declaring one adds its own gate rather than relying on a reviewer's eye.

It states containment as a relation, never a hash baseline: two renders of the same
composition carrying different content must be **byte-identical outside** the reserved
rectangle, because that region is backdrop and backdrop does not know what the scene says,
and must **differ inside** it, which is what stops the first assertion passing over a
rectangle the probe read wrong or a frame that drew nothing. Both survive a change of
machine and of font.

`image_context` now declares `full`, `left` and `right`, which is decision 6 applied to the
capability that forced this ADR: a persistent element in a corner either half clears is
kept, and the scene stacks its plate over its copy instead of splitting into two columns
too narrow for their own words. `ImageContextScene` is no longer the worked example of rung
d — an element in `center`, which no half clears, is.

**What the gate does not do, and this is worth knowing before the next capability declares
a composition.** It ran green against the *unfixed* layout. A 7/5 column split inside 960px
put a 39-character headline through `AnimatedText`'s `overflow: hidden` and clipped it
mid-word — "The rent squeez / is / reshap" — which is unreadable and entirely legal:
nothing was drawn outside the rectangle, so nothing the test can see went wrong. The gate
answers *"did this scene stay inside the frame it was given"*, and the failure mode ADR-0003
actually named — a capability "squeezed, silently and legally" — is only half caught by it.
The other half was found by rendering the frame and looking at it. A composition is not
paid off by adding it to `meta.ts` and watching the suite pass.

**2026-08-12 — decisions 2, 3 and 7, after an adversarial review of the implementation.**
The original text already made the scene the unit, but only for one element at a time, and
the first implementation followed it literally: outcomes were computed per placement
segment and per element, and only `hide` was promoted to the whole scene. One element with
`cornerBR` then `cornerBL` inside one scene selected `left` for the first segment and
`right` for the second; the first won, and the element spent the second half of the scene
standing inside the half the scene had just been composed into. Two elements collided the
same way through the scene's safe area.

The defect was in the code, but the ADR was thin enough to permit it: it never said what
happens when two segments or two elements ask for different compositions. Decision 2 now
states the joint solve, decision 3 restates the ladder as a scene-wide rule with an
explicit tie-break, and decision 7 writes down the section-wide fallback coupling that was
true all along and documented nowhere.

**2026-08-12 — the other half of the gate, and the camera allowance is no longer optional.**
The amendment above ends by saying the suite answers *"did this scene stay inside the frame
it was given"* and that the other half was found by rendering a frame and looking at it.
That other half now has a gate too, and closing it turned up a defect in `SlotFrame`.

The defect first: in `section--vertical-slice` the closing scene lost the end of its caption
off the right of the canvas. `ImageContextScene` declined the grid margin — correct, it sets
a tighter editorial inset of its own — and `padded={false}` silently also declined
`cameraInset`, the compensation `CameraRig` publishes so that whatever margin was chosen
survives the camera. A 12% push-in then ate the 46px the scene had left. Nothing illegal was
drawn: for a `right` composition there is no region outside the reserved rectangle to the
right of it, so the frame was clipped by the *canvas* and every containment hash still
matched.

`padded` was one boolean over two independent facts. The design margin is a scene's choice;
the camera allowance is arithmetic, and declining it was only ever a way to be wrong. It is
therefore no longer declinable: the prop is now `gridMargin`, it buys the grid margin and
nothing else, and `SlotFrame` applies the allowance unconditionally. The interface got
smaller rather than larger — no second boolean, no opt-in wrapper. Should a scene ever
genuinely need to bleed, that is a *region* declaring itself, not a whole frame giving up
its physics; nothing bleeds today, so no such seam was built for one hypothetical caller.

The gate is a third assertion in the same generated suite, in the same relation: two
examples carrying different copy must also be byte-identical along a 16px band *inside* the
reserved rectangle. A scene reaching its own edge is being cropped by it, whether or not it
drew anything illegal. It was falsified before being trusted — red on both `image_context`
cases, green on both `bar_chart` cases, against the unfixed code.

One corroboration worth keeping: of the three accepted key frames in
`tests/render/image-context.test.ts`, only two moved. `example-empty-context` renders
`editorialStatic`, which has no camera, so it had no allowance to be missing — the change
moves a scene exactly where a camera moves it and nowhere else.

The cost was accepted deliberately: under `pushIn` a half-frame scene now loses 115px per
side horizontally, so the shot is visibly tighter. That is the trade `CameraRig`'s header
already committed to — *"the cost of a big push-in is visible as a tighter frame rather than
as a crop"* — and it had simply never been paid by the one scene that opted out.

**2026-08-12 — an absolute control, and `bar_chart`'s half frame is now drawn rather than
claimed.** An adversarial review of the two amendments above argued that the gate had
false-negative paths. Three were real, and closing them found a defect older than either
amendment.

The gate now measures against a **control** — one still of `Backdrop` with nothing standing
on it (`src/runtime/BackdropControl.tsx`). The previous form asked its questions as a
relation between two examples of the same capability, which is blind by construction to
anything a capability draws identically every time: the `Visual context` eyebrow is
byte-identical in every `image_context` render, so had *it* overflowed, both frames would
have matched and the suite would have passed. An absolute reference has no such blind spot,
and it makes each render checkable on its own — so the suite no longer pairs examples up
and asks every example in the catalog rather than the first two. Each case also runs under
**two camera profiles**, because containment's worst case is the largest *translation*
(`cinematic`) while the quiet border's is the largest *inset* (`pushIn` — which the shipped
slice's own closing scene uses, and which the suite had never rendered); and the quiet
border is now asked of `full`, which the containment-only filter had excluded.

What that found: **`bar_chart` had declared `['full', 'left', 'right']` since the first
scaffold commit, with no half-frame layout ever drawn for it.** `example-long-ranking`
composed into a half put a 68-character title through five lines of display type, and ran
its ranking off the bottom of the canvas. This is exactly the consequence recorded above —
"a capability that declares `left` without a layout designed for a half-frame gets squeezed,
silently and legally" — surviving for the whole life of the codebase, because the amendment
that gave `image_context` its halves reasoned about that capability alone and nobody
re-read the other one's declaration.

Decision 1 is unchanged, and was applied as written: the composition was **drawn**, not
withdrawn and not handed to the compiler to judge. `BarChartScene` now reads the shape of
its box exactly as `ImageContextScene` does, and in a portrait box the title labels the
chart instead of declaiming over it, while how many categories fit becomes a question the
box answers. Both are degradations the capability already publishes — `TITLE_DENSITY` and
the `Others` bucket — asked on the box's terms rather than only on the string's.
`barChartGeometry` sits beside `splitLeftGeometry` and carries the same distinction: a
composition is not a layout, and all three layouts keep their identity in half a frame.

Withdrawing the claim was the considered alternative, and is worth recording because it was
the cheaper one. It costs the shipped slice its narrator: with no half to yield into, the
chart scene falls to rung d and compiles `PERSISTENT_ELEMENT_HIDDEN` for the whole 11.5
seconds. Drawing the frame keeps the section a human can sit down and watch, which is what
§12 asked for, and it errs in the recoverable direction — a drawn composition can be
withdrawn later, while a withdrawn one leaves the compiler nothing to pick.

**What is still not answered** is the general form of the review's objection: nothing checks
that content the *schema* accepts but no example carries will fit. The gate asks the
catalog's own examples, which is why it caught this one, and the schema's ceilings — a
120-character headline, a 240-character caption, twenty categories — remain unrendered in
any composition. Whether `supportedCompositions` should stay a static declaration or become
content-dependent is a decision this ADR has not taken; it has only made the static
declaration honest for the two capabilities that exist.

**2026-08-13 — the declaration stays static, and the content it accepts gets rendered.**
The question the amendment above left open is answered, and answering it started by
separating two problems the paragraph fuses.

**Eligibility and fit are not the same hole.** *May `bar_chart` be composed into `left` at
all* is a static property of the capability, and the amendment above closed it the right way
— by drawing the half frame rather than withdrawing the claim. *Does this instance's
120-character headline survive the column it landed in* is a property of one plan's content,
and it is the one still open. Making `supportedCompositions` content-dependent aims the
first mechanism at the second problem.

**So the declaration stays static, and the reason is rule 5.** Content-dependent eligibility
turns "your title is too long" into "this capability may not be composed here" — a
degradation promoted to a rejection, in a codebase whose fifth rule is that the two regimes
never overlap. The degradations for this exact content already exist and already work:
`titleStep` drops the type scale, `TITLE_DENSITY` says so, the `Others` bucket folds a
twenty-category ranking. Nothing was missing from the *response* to oversized content. What
was missing is that **no one had ever rendered it**.

**The content-stress suite.** Cases are generated from the schemas rather than written:
every `.max()` gives a ceiling — a 120-character headline, a 240-character caption, twenty
categories, forty-character labels — and the deliberately-absent limits this file's own
schema comment defends give the floor, since "no `.min(2)`, so the empty state stays
reachable" is a promise with the same standing as a ceiling. Strings are filled
deterministically from a fixed word corpus, because a string at the ceiling made of one
token exercises no wrapping and wrapping is the whole question. Each case renders across
**every layout × every composition × both camera profiles**: a layout is how the scene
arranges itself and a composition is how much frame it gets, and the claim made above —
*"all three layouts keep their identity in half a frame"* — is checkable no other way. It is
also exactly the claim that went unverified for `bar_chart`'s `left` for the entire life of
the codebase.

**What it asserts, and why containment alone would have been theatre.** Containment and the
quiet border, as `safe-area.test.ts` asks them against the `Backdrop` control — plus
**nothing is clipped**, plus a line-count ceiling. The clipping assertion is the one that
earns the suite. `AnimatedText` wraps its content in `overflow: 'hidden'` and `titleStep`
floors at step 3, so a headline past the floor in a 537px column loses its tail *inside* the
safe area: containment passes, the quiet border passes, and the sentence is gone. That is
blind-by-construction in the same shape the absolute control was introduced to fix one
amendment ago, arriving by a different route. The line ceiling makes a check out of a
sentence this repository already wrote — *"five lines of display type is a header that has
eaten its own scene"*.

**Properties, never hashes.** The three curated key frames in `image-context.test.ts` stay
hashed because three is a number a human will actually look at. A hash baseline over the
hundred-odd generated cases would be re-accepted wholesale the first time anyone changed a
font, and a baseline that is always bulk-accepted is a ritual wearing a check's clothes.

**It runs as its own `pnpm test:stress`.** Own config, same `fileParallelism: false`, sharing
`png.ts`. `test:render` is 44 tests in 47 seconds and the standing discipline that a red one
is a real failure depends on people running it; the stress matrix roughly triples that today
and more later. Splitting the slow suite off is what this repository already did once when
`test:render` left `test`. It is obligatory for any commit touching a schema, a layout or
`supportedCompositions` — a change-scoped obligation with `catalog:check` as its precedent,
rather than a universal one nobody honours.

**It is not on the cut line.** Grouped with the contract tests, for the same reason: both
check that the catalog's *published claims* are true, and a claim nobody checks is worse
than a claim never made. The scheduling argument is that its cost **self-scales with the
cut** — the cases are generated from whatever schemas, layouts and compositions survive, so
cutting scope shrinks the suite instead of leaving an obligation behind it.

**The response to a failure is pre-committed**, before any case exists, for the same reason
the measurement gate's is: after seeing the failure, "lower the ceiling" explains everything.
Draw the box so it fits, or extend the degradation. Lowering a schema ceiling is legitimate
**only** when no content at that size is editorially defensible — a 240-character caption may
genuinely not be a caption any more, and saying so is an answer. What it may not be is the
quiet repair, because a ceiling is a promise the schema makes to the agent and rule 1 makes
the schema the single source of truth; lowering it moves the failure from the frame, where a
human sees it, to the plan, where the agent meets it as a rejection.

*Decided, not yet built.* The suite does not exist. It comes after ADR-0006's publication

work and after the action group, and nothing in this amendment is carried out in the commit

that records it.


**2026-08-20 — the suite is built, and the first run is red in one place only.**

The amendment above is carried out. `packages/video/tests/stress/cases.ts` derives the
content from the **published** projection of each schema — `buildCatalogEntry(…).propsSchema`,
the JSON Schema that ships in `catalog.json` — so the ceiling being stressed is the ceiling
the agent was told about, and a hand-written fixture never gets the chance to go stale
against it. `content-stress.test.ts` renders it: seventy-two cases, every capability at its
ceiling and at its floor, in every layout, in every composition it declares, under
`cinematic` and `pushIn`. `pnpm test:stress`, its own config, 144 stills in 124 s.

**Two of the four questions had to leave the pixels.** Containment and the quiet border are
statements about regions and are asked exactly as `safe-area.test.ts` asks them, against the
backdrop control. The other two are not in the bytes at all: a frame that has lost its tail
and a frame that never had one are the same still, and a line box is a browser fact rather
than a pixel one. So `runtime/StressControl.tsx` — a third kind of control, one with no
content of its own, whose content arrives as input props — measures both in the DOM once the
entrances have landed, and ends the render through `cancelRender` when it finds either. The
test names the case; the render names the defect. The alternative, reading sharp cuts out of
an ink profile, would have been a guess about typography dressed as a measurement.

**Every floor passes. Twelve of the thirty-six ceilings pass. Twenty-four do not.** The
floors are the first time the empty states these schemas keep reachable have been drawn in
every composition, and all thirty-six are green on all four questions. Of the ceilings,
`stat_counter` is green everywhere and `bar_chart` is green on the full canvas. The rest:

- **`bar_chart`, all three layouts, both halves** — the 120-character title sets *five lines*
  of display type. Exactly the sentence the ceiling was made out of.
- **`quote`** — seven lines on the full canvas, twelve to thirteen in a half.
- **`image_context`** — seven to eight lines on the full canvas, and in a half the copy is
  *clipped*: 96 px off the headline, 48 px off the caption, and 4–7 px off the `Visual
  context` eyebrow, which is fixed chrome and nothing to do with the content.

**The clipping is what pays for the suite**, and it is the failure this amendment predicted
in the abstract one week earlier. It happens inside the safe area, so containment has nothing
to say about it and the quiet border has nothing to say about it; `image_context` has declared
`left` and `right` since the amendment above, the compiler is entitled to choose them, and no
still had ever shown what that copy column does at the schema's own ceiling.

**Nothing is repaired here.** The response was pre-committed before any case existed
precisely so that this moment could not be argued from the failure — draw the box so it fits,
or extend the degradation, and lower a schema ceiling only where no content at that size is
editorially defensible. Which of the three each of the twenty-four is remains open, and none
of it is carried out in the commit that records the suite.

---

**2026-08-20, later — the twenty-four are repaired, and one of the four questions was
asked wrongly.**

The amendment above left three responses open and said which of them each red case was
remained undecided. Answered here, case by case, and the count moved from twenty-four red
to zero — but not before the suite turned up two failures nobody had reported, and one
defect in the check itself.

**Eight of the twenty-four were also failing a question that was never answered.** When
`StressControl` ends a render, the three region assertions in the same block `skip()` —
by design, and documented: a refused render leaves no still to measure. So for every red
case containment and the quiet border went *unanswered*, not green. Rendered at the frame
the probe does not cancel and measured with the suite's own assertions, `bar_chart` at its
ceiling composed into `left` drew ink to x = 1552 — 592 px into the half the compiler had
reserved for a persistent element — in `standard` and `withCallout`, at both test frames.
A ninth and tenth appeared only once the headers passed and the renders completed:
`horizontal` under `pushIn` overflowed its box vertically, the ranking bleeding under its
own title and off the canvas. **A skipped assertion behind a red one is a place a failure
can sit indefinitely**, and this suite had ten of them.

Both had one cause, and it is the cause `titleFit.ts` was written about, one layer down:
**a category label cut to a character count rather than to the column carrying it.**
`truncate(label, 14)` hands the same fourteen characters to a column 300 px wide and to
one 60 px wide; because a flex item's minimum size is its min-content width, the row then
sized itself to the labels and took the plot with it. The ranking paid the same price on
the other axis — a name wrapped to three lines makes the row three lines tall, so the
`rowPitch` the scene aggregates against stops being the pitch and the ranking it cut down
to fit overflows anyway. `truncateToWidth` measures instead, `truncate` is gone, and
`capacity` now bounds a composed *vertical* chart by width exactly as it already bounded a
composed horizontal one by height — the note excluding it (*"they simply get narrower"*)
was true of the bars and false of the names underneath them.

**`image_context`'s clipping was the copy band being given a fixed share of a portrait
box.** The stack divided the height 7/5 outright; at the schema's ceiling the copy needed
about a fifth more than that, and grid children do not refuse — each of the three shrank
below its content and clipped under `AnimatedText`'s own `overflow: hidden`. The `Visual
context` eyebrow losing 7 px is what proved it: fixed chrome with no content of its own
cannot be too long. A plate can be any height and a paragraph cannot, so the copy row is
now `minmax(owed, auto)` and the plate takes the remainder — identical to 7/5 for any copy
that fitted it, yielding rather than cutting for copy that does not.

**The line ceiling itself was the fourth question asked wrongly, and that is the finding
worth keeping.** `MAX_DISPLAY_LINES = 4` was this repository's own sentence made checkable
— *five lines of display type is a header that has eaten its own scene* — and the sentence
is right. The count was a proxy for it, and a proxy that is faithful only at the size the
failure was first seen at. The ranking that produced the sentence set a 68-character title
at 63 px: five lines, 321 px, **39%** of a composed box, and the nine rows underneath ran
off the canvas. The same five lines *after* the length ladder and the composed drop have
done their work are 178 px and **16%**, with the chart below them untouched — measured, on
frames this suite drew. A count cannot tell those two apart. A share can.

So the rule is now `MAX_HEADER_SHARE`, a share of the box the scene was given. **It was
written as a third and the frames argued it to a half**, which is worth recording because
the first number was the plausible one. A third leaves two thirds for what the header
labels, which sounds like where *leaves room for it* stops being true — and it rejected
`example-housing-context`, the canonical accepted frame of `image_context`, whose headline
is **42%** of its scene. Rendered side by side, the frame a third produced is the meeker of
the two: the accepted one is a confident headline beside a plate with a two-line caption
under it, crowding out nothing. And the ranking that started all of this is **39%** —
*below* the good frame. No share separates them, and a number chosen to fit both would have
been tuned to a pair of stills.

A half is the statement that stands without them: past it a header is the larger half of its
own scene, which is what *eaten* means. It is a coarse backstop on purpose. **It does not
catch the 39% ranking and does not need to** — that harm was nine rows running off the
canvas, which the quiet border measures directly and without a proxy. This session watched
that path work twice: `bar_chart` spilling 592 px into a reserved half, and its ranking
under `pushIn` bleeding off the bottom, were both caught as region failures once the renders
were allowed to finish. The fourth question is answered better by the two that were already
there than by any ceiling standing in for them.

Two things still follow from stating the rule properly, and both were decisions rather than
consequences:

- **It is a rule about *headers*.** A header labels something else and its job includes
  leaving room for it. Display type that **is** the scene — a pull-quote — has nothing
  below it to crowd out, and the only ceiling meaning anything for it is the box, which the
  clipping and region checks measure directly. `SceneTitle` takes a `displayRole` and
  publishes it as `data-display-role`; `header` is the default and unmarked type is held to
  the stricter rule, so forgetting to classify cannot buy a scene a larger budget. This
  answers `quote`, whose 240-character ceiling and a four-line ceiling could not both hold:
  240 characters is about six lines at the display floor on a full canvas and thirteen in a
  half, and no step of the scale reaches four. **No schema ceiling was lowered.** What the
  distinction must not become is an exemption: `MAX_STATEMENT_SHARE` is one, so a statement
  is measured against its own box rather than dropped from the measurement. The two roles
  differ in the share they carry, never in whether this question reaches them — a question
  nobody asks reports as a pass, which is the same defect as a skipped assertion and was
  briefly true of `quote`, the capability the role was introduced for.
- **The fit had to learn the same thing.** `fitTitleStep` answered width only — the widest
  *word*, because a string wraps and a word does not — which is why a 120-character
  headline could set eight lines down a 5/12 column with nothing clipped and nothing out of
  its safe area. It now takes a `maxHeight` and a `lineHeightAt` and steps down while
  *either* question is unhappy. In px and not in lines, for the reason above: the budget
  has to be re-asked at every rung.

The check is derived and not declared. `SlotFrame` publishes the box it computed as
`data-scene-height` and the probe works the ceiling out from it, rather than reading a
budget off the element — a header whose own arithmetic was wrong is still caught, and
asking the element what it was allowed would be grading the fit against itself.

**No accepted key frame moved, and this paragraph claimed otherwise until it was
corrected.** An intermediate version of this rule counted lines, and under it
`image_context`'s `example-long-context` headline dropped from five lines to four and its
hash moved with it. That build did not ship. The rule that shipped is a *share*, and five
lines there are 326 px of a 1008 px box — inside the half a header may take — so the fit
leaves the frame exactly where a human accepted it. Every md5 under `tests/render/` is
byte-identical to `dev`, and the sentence recorded beside that hash says so. What this
paragraph was describing is the build in between, which is the failure mode an amendment
written from memory rather than from the diff has.

What this leaves is a suite that is green on all four questions with **nothing skipped** —
the region assertions are answered for all seventy-two cases for the first time, because
no render is refused. The skip that guards those assertions is now per *frame* rather than
per case, so one refused frame no longer takes its sibling's answers down with it; what it
still cannot do is answer for the refused frame itself, which needs the probe to return a
verdict instead of ending the render. Two frames remain honestly poor rather than wrong: at
`bar_chart`'s absolute ceiling in half a frame the axis gutter takes 245 px of a 538 px
box to print an eight-character unit five times, which leaves the category names three
or four characters each. Contained, labelled, and inside every boundary — and a quieter
composed axis is a design question this repair did not need to answer.
