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
