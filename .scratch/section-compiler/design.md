# Design — the Section runtime and the minimal compiler

Status: design, pre-spec. Build order step 6.

Vocabulary is `codebase-design`'s: **module** (interface + implementation), **interface**
(everything a caller must know), **seam** (where behaviour can be altered without editing
in place), **depth** (behaviour per unit of interface), **adapter** (a thing filling a
slot at a seam).

The decisions this design is downstream of: ADR-0002 (the time pipeline), ADR-0003 (slot
conflict resolution), and rule 3 — the agent expresses semantic time, the compiler
produces physical time.

---

## The seam: the compiled document

There is one seam worth putting in this slice, and it is the artifact between the
compiler and Remotion.

```
VideoPlan + TimedBeat[]  →  compile()  →  CompiledDocument  →  <CompiledVideo>
   symbolic: anchors,                        physical: frames,      React
   slots, beat ids, ms                       rects, safe areas
```

Everything symbolic dies at that line. Nothing downstream of it knows what an anchor is,
what a slot is, or that milliseconds exist. Nothing upstream of it knows what a frame is.

**The seam is real, not hypothetical.** The document has one producer today but four
consumers already in view: the Remotion render, `@remotion/player` for the live demo, the
Component Studio, and the tests. A test that asserts "this plan puts the character in the
bottom-right for beats 1–3 and hides it for beat 4" wants the document, not a browser.

**The document is JSON.** No functions, no class instances, no React elements, no Zod
schemas. It can be written to disk, posted to a Player, and compared with `toEqual` in a
test that takes a millisecond. This is the single constraint that keeps the render suite
small: anything assertable about *composition* is assertable on the document, and only
pixels need Chrome.

---

## Module 1 — `compile`

`packages/video/src/compile/`

```ts
export type CompileInput = {
  plan: VideoPlan;
  /** From `packages/voice`, or a fixture. The compiler never calls TTS. */
  beats: TimedBeat[];
  /** Accepted, not constructed — see "Dependencies" below. */
  resolver?: AssetResolver;
  fps?: number;
};

export type CompileResult =
  | { ok: true; document: CompiledDocument; report: CompileReport }
  | { ok: false; document: null; report: CompileReport };

export const compile = (input: CompileInput): CompileResult;
```

One function. Behind it:

1. `validateVideoPlan` — structure, then meaning (already built).
2. Beat timings joined to plan beats; a plan beat with no timing is `MISSING_BEAT_TIMING`.
3. Milliseconds to frames — the one conversion ADR-0002 names.
4. Beat windows folded into scene windows and section windows.
5. Anchors resolved to frames per scene (`resolveEventTimings`, already built).
6. Placements resolved to runs, then ADR-0003's ladder run over every (scene, element)
   pair, producing `layoutStates`, per-scene `safeArea`, and its warnings.
7. Asset requirements resolved over the whole plan.
8. Every warning and error from all of the above folded into one `CompileReport`.

**Depth.** A caller learns one function and one result type, and gets seven pieces of
machinery. The interface does not grow when the machinery does: anchor snapping (open
question 1), a second theme, or a real TTS all land behind it without a caller changing.

**The result type makes the failure mode unforgeable.** `document` is `null` exactly when
`ok` is false, so no caller can render a plan that did not compile. That is one class of
bug removed at the type level rather than by discipline — errors are loud, per rule 5, and
now structurally so.

**Convert boundaries, never durations.** Each beat boundary is converted to a frame once,
and every window is derived from consecutive boundaries. Converting durations and summing
them accumulates rounding into gaps and overlaps between scenes — a one-frame black flash
that no test would name and everyone would see.

---

## Module 2 — the Section runtime

`packages/video/src/runtime/`

```tsx
<CompiledVideo document={document} theme={theme} />
```

One prop that matters. Internally: a `<Sequence>` per section, a `<Sequence>` per scene
delegating to the existing `SceneRenderer`, and a persistent layer driven by
`layoutStates`.

The runtime **decides nothing**. It has no access to slots, no fallback when an asset is
missing, no opinion about what happens when two things overlap. Every such question was
answered by the compiler and is already in the document. If the runtime ever needs an
`if` about layout, the compiler failed to decide something.

`SceneRenderer` is unchanged. It already takes exactly what `CompiledScene` carries —
props, assets, layout, events, safeArea, motionProfile — which is the confirmation that
the document's scene shape is the right one: it was reverse-engineered from a working
component contract rather than invented.

Scene events stay **relative to the scene's start**, as `resolveEventTimings` already
produces them, because Remotion's `<Sequence>` reparents the frame clock for its children.
Scene and section windows are **absolute**. The document says which is which per field.

---

## Module 3 — the conflict ladder (internal seam)

```ts
export type ConflictOutcome =
  | { kind: 'keep' }
  | { kind: 'recompose'; composition: Slot }   // the scene yields
  | { kind: 'relocate'; slot: Slot }           // the element moves
  | { kind: 'hide' };

export const resolveConflict = (
  scene: { occupies: Slot[]; supportedCompositions: Slot[] },
  element: { wanted: Slot; declaredElsewhere: Slot[] },
): ConflictOutcome;
```

A pure function over **declarations**, not over plans. It never sees a `VideoPlan`, a
frame, a section or a capability — only the four facts ADR-0003's ladder actually reads.

This is the module that earns a table test: ten slots against ten slots against a handful
of composition sets is a table, and a table over this signature is three lines per case.
Driving the same coverage through `compile` would mean constructing a whole plan per case,
which is how a rule with four branches ends up with two of them tested.

It is an internal seam: `compile` is its only production caller, and the module is not
exported from the package.

---

## Module 4 — slot geometry

`packages/video/src/core/slots.ts`, per ADR-0003 decision 5.

```ts
export type Rect = { top: number; right: number; bottom: number; left: number }; // %
export const slotRect = (slot: Slot): Rect;
export const overlaps = (a: Slot, b: Slot): boolean;
```

> **Corrected while building.** The planned `safeAreaFor(composition, keepClear)` does not
> exist: under ADR-0003's ladder a retained element never intersects the scene's effective
> composition — `keep` means no overlap, `recompose` and `relocate` both end disjoint, and
> `hide` removes the element — so `keepClear` is always empty and the safe area is exactly
> `slotRect(composition)`. A parameter that can only ever be empty is a worse interface
> than no parameter. `Rect` is defined as *insets from each edge*, the same shape and
> reading as `SafeArea`, which is what removes the conversion.

One table. `overlaps` is rectangle intersection over it and `safeAreaFor` is derived from
it, so the symbolic relation and the percentages cannot drift apart. The compiler is the
only consumer: this is the first code in the repo that gives a slot a size, and it must
stay the last.

---

## Dependencies: accepted, not constructed

**The asset resolver is a parameter.** Two adapters already exist — the repository library
and an empty one in tests — so the seam is real. It also has to be a parameter for the
resolver's identity cache to be project-scoped rather than process-global, which is the
property `02` was fixed to preserve.

`compile` stays **synchronous**, and the resolver interface stays synchronous, even though
generation and licensed search are async by nature. When those land, the async work fills
the identity cache *before* `compile` runs; resolution inside the compiler stays a lookup.
This is what the explicit cache is for, and it keeps the compiler a pure function —
testable without a single `await`.

**The capability registry stays a module-level singleton.** `validateVideoPlan` already
reaches for it and there is exactly one registry, so parameterising it would buy a
hypothetical seam and cost every caller a parameter. One adapter is not a seam.

---

## What is deliberately *not* a module

- **No `Section` component per video.** CONTEXT.md already forbids it; the generic runtime
  plus the document is the whole mechanism.
- **No layout engine.** `SlotFrame` consumes a `safeArea` and that is the entire layout
  protocol between compiler and component. A second one would be a second source of truth.
- **No compile *pipeline* abstraction.** Registering stages against a bus would be a
  shallow module — a large interface over `a(); b(); c();`. The stages are private
  functions in one file until something varies across them.

## The deletion test

Delete `compile` and its work reappears in every caller: the Studio, the Player demo, the
render tests and the Component Studio each rebuild ms-to-frames, anchor resolution and
conflict resolution, and drift apart on the rounding. It earns its keep.

Delete `CompiledVideo` and the same `<Sequence>` nesting reappears in three places. It
earns less, but it earns.

Delete `resolveConflict` as a separate module and ADR-0003's ladder dissolves into
branches inside a loop inside `compile`. The behaviour survives; the test surface does not.

## Test surface

- `resolveConflict` — a table, at the internal seam. Every branch of the ladder.
- `slots.ts` — geometry invariants: `full` overlaps everything, opposite halves overlap
  nothing, a corner is inside its two halves.
- `compile` — the external seam. A handful of whole plans in, documents and reports out,
  compared as data. This is where "the character is hidden for scene 2 and only scene 2"
  is asserted, and it needs no browser.
- `test:render` — pixels only. It does not grow for this slice beyond one section playing.

## Out of scope for the minimal compiler

Anchor snapping (open question 1 — arithmetic anchors stay arithmetic) · `packages/voice`
(timed beats come from a fixture) · the Quality Agent loop · `replaceComponent` prop
migration · any second layout or capability.

One small gap to close while here: `checkPlacements` accepts `scene.start` in a placement,
where `scene` is meaningless — placements belong to a section, not a scene. It should be
rejected with the same `UNKNOWN_ANCHOR` the events path uses. **Still open** — the
compiler resolves such an anchor against the *section's* bounds, which is a defensible
reading but not one anybody chose.

---

## What the build changed

Recorded so the design and the code do not disagree.

- `safeAreaFor` collapsed into `slotRect` — see the note above.
- `CompiledSection` gained a **`persistent`** table: `layoutStates` says where an element
  is, and that table says what it looks like. Without it the runtime would have to read
  the plan to draw a character, which is the seam leaking.
- `MISSING_BEAT_TIMING` was added to `CompilerErrorCode`. A plan beat the voice-over never
  spoke used to be a `NaN` propagating into every window derived from it.
