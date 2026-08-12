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

**2. The scene is the unit of resolution.** One outcome per (scene, persistent element)
pair, held for the scene's whole duration. If an element's placements change *within* the
conflicting scene, the segments are resolved together and the worst outcome wins: any
irreducible segment hides the element for the entire scene. Visibility that changes
mid-scene reads as a bug, not as a resolution.

**3. The ladder**, tried in this order, per scene, per persistent element:

| # | Condition | Outcome | Warning |
|---|---|---|---|
| a | The element's slot does not overlap the scene's occupancy | Both keep what they declared | — |
| b | Overlap, and the scene declares a `supportedCompositions` entry that clears the element's slot | The scene takes that composition; the element does not move | `SLOT_RELOCATED` |
| c | Overlap, no such composition, but the element declares a slot elsewhere in the same section that clears the scene | The element takes that slot for the scene's duration | `SLOT_RELOCATED` |
| d | Neither | The element is hidden for the scene's duration | `PERSISTENT_ELEMENT_HIDDEN` |

The scene yields before the element moves. A scene composed into a declared alternative is
a composition somebody designed; a relocated element is a character that jumps. Where both
are possible, prefer the one that was drawn on purpose.

Multiple persistent elements are resolved in declaration order, and a relocation target
must clear the scene *and* every element already placed.

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
