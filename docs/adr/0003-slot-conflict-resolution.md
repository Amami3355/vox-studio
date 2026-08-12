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
