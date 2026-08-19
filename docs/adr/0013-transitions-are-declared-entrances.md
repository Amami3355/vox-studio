# ADR-0013 — Transitions are declared entrances

**Status:** accepted · 2026-08-17 · not yet built
**Scope:** how the hand-off between two adjacent scenes gets motion. The plan shape, the
effect vocabulary, the compile checks, and the timing budget. Not the implementation —
that is deferred behind the plan of record (`docs/measurement-gate.md`), and this document
decides what it will meet when it arrives.

**The frozen document named the problem and a shape; this decides the mechanism.** §9.3
lists four failures that "n'apparaissent qu'ici": slot collisions, *transitions
brutales*, a character that jumps, rhythmic uniformity. §10 shows the compiled scene
carrying `"transitionIn": { "type": "wipe", "durationInFrames": 12 }`. And §12's vertical
slice demanded *"Les transitions ne cassent pas la continuité"* — a criterion the shipped
slice passed vacuously, because nothing in the repository has ever transitioned. Every
scene boundary rendered so far, including the whole sandboxed 2-minute run, is a hard cut.
This is the same situation ADR-0003 met for slots: the frozen doc names the failure and
shows a glimpse of the shape, and decides neither the rule nor the mechanism.

## Context

Three facts constrain the design, and they pull in different directions.

**A transition is between two scenes, and ownership must land on one of them.** The
hand-off has two participants, and a field both could write is a field that needs a
reconciliation rule. ADR-0003's first decision — *the compiler chooses only among
alternatives someone declared* — forbids the compiler from inventing the motion, and the
frozen doc's own §9.3 forbids the two tempting defaults: an automatic transition fixes
*transitions brutales* by manufacturing *uniformité de rythme*, and a compiler-chosen one
improvises a motion nobody declared. Whatever the shape, one author must declare it.

**The frozen doc's `durationInFrames: 12` is written in the wrong language — for a plan.**
§10 shows the field on a *compiled* scene, where frames are the native currency: the
compiled document is "frames, percentages and resolved assets; never an anchor, a slot or
a millisecond". But the choice of type and length originates with the agent, and
`ANCHOR_GRAMMAR.rule` binds that side: "The agent expresses semantic time; the compiler
produces physical time. Write an anchor, never a frame." `durationInFrames` as authoring
vocabulary would be the first plan field where an agent writes frames, and the first
exception the grammar's rule has ever admitted.

**The duration vocabulary already exists, and it was built for exactly this.** `motion.duration`
carries `instant: 6, quick: 12, base: 20, slow: 34`, and ADR-0009 records that the anchor
offsets resolve through them because they were "chosen for how long a transition should
take". The frozen doc's example duration — 12 frames — *is* `quick`. The rhythm tokens a
plan already speaks for pacing (`pace`) and hold are the tokens a transition's length wants;
no new scale is needed.

Two further facts settle the rest.

**The anchor grammar needs no part in this.** A transition plays at a scene's own start —
the boundary between it and the scene before. It is self-anchoring by construction: no
`at` field, no anchor string, nothing for ADR-0009's frozen grammar to admit or refuse.
The `scene` pseudo-beat (`core/anchors.ts`) exists for a scene's own bounds and stays
untouched; a transition never needs an anchor written, so the grammar does not widen.

**Anchored events are the thing a transition can destroy.** A window straddling a scene's
start covers the incoming scene's first frames and the outgoing scene's last ones. An
event that resolves inside that window fires while the picture is mid-dissolve — and if
the event is deictic, the narrator is pointing at something the viewer cannot see. The
demo run carries exactly the collision in embryo: `showBaseline` at `b3.start`, the very
frame an entrance transition for `overrun-record` would own. Rule 5's loud half applies:
this is not a degradation the render survives, it is the plan and the render disagreeing
about whether the event happened.

## Decision

**1. A transition is the incoming scene's to declare.** `transitionIn` becomes an optional
field on the `SceneInstance` — the frozen doc's field name, at the frozen doc's level of
ownership, consistent with `layout` and `motionProfile` living on the instance. The
outgoing scene declares nothing: its final frames play under whatever the next scene
arrives through. Absence means hard cut, which is the default, the current behaviour of
every boundary in the repository, and not a degradation to be repaired.

**2. The plan shape speaks rhythm tokens, the compiled document keeps its frames.** The
plan writes `transitionIn: { type: <effect>, duration: quick|base|slow }`, resolved at
compile time through `motion.duration`. `instant` is excluded: six frames is a cut wearing
a transition's clothes. The compiled document carries the resolved shape — type plus
frames — and §10's `durationInFrames` survives there, where frames are legal. The agent
writes tokens; the compiler writes frames; the seam in CONTEXT.md is intact.

**3. The effect vocabulary is closed, and published.** An initial set of two — `fade` and
`wipe` — published to the manifest as `TRANSITION_EFFECTS` in the shape of
`ANCHOR_GRAMMAR`: a `means` sentence per effect, generated into `catalog.json`, because
rule 2 makes an unpublished vocabulary unlearnable by construction. An unknown type is
`UNKNOWN_TRANSITION`, same family as the other inventions. The set extends by manifest
change with measurement behind it — measure 4 of the gate is where a transition earns its
place — never by a capability adding one privately.

**4. The incoming capability consents.** A capability's `meta.ts` declares
`supportedTransitions`, parallel to `supportedCompositions` in ADR-0003, and a plan
writing a type the incoming capability does not list is refused
`TRANSITION_NOT_DECLARED` — the refusal teaches, per ADR-0012, naming what the capability
does accept. The capability shape does not move: consent is one field in a file that
already exists, not an eleventh file. Whether the *outgoing* capability should hold a veto
— its last frames are spent under the transition — is recorded as open, and is a question
about exits, which this document deliberately does not create.

**5. An anchored event never resolves inside a transition window.** The check runs in
`compile()`, on the frames `resolveEventTimings` just produced, like
`EVENTS_OUT_OF_ORDER`: an anchor is a string until a take turns it into a moment, so no
schema check and no validate-time text check can answer completely. The refusal is
`TRANSITION_COVERS_EVENT`, naming the event, its anchor, its frame, and the window that
swallows it, and it applies to both participants — an incoming event too early and an
outgoing event too late are the same defect from opposite sides. The repair the agent is
offered is the transition, not the event: the event is the reason the scene exists.

**6. The overlap is carved from the incoming scene's head.** A transition of duration D
starts the incoming scene D frames early; scene durations and composition duration are
unchanged, because the total is pinned to the take. What the early window shows is the
incoming scene's initial state — no event has fired yet, since every event anchors at or
after the first spanned beat — which is precisely what an entrance should carry, and the
reason this carve and not a symmetric one.

This is a language change, so when the shape lands, `manifestVersion` becomes **5** and
the four `catalogManifestVersion` sites in `packages/production/src/commands/service.ts`
follow it, as ADR-0010's change did.

### Considered and rejected

**Frame counts in the plan.** The frozen doc's `durationInFrames` taken literally as
authoring vocabulary. Rejected for the grammar's own rule, quoted above; it would also
detach transition lengths from the rhythm-token scale that offsets, pace and hold already
share, giving the agent three durations it must reconcile by arithmetic. The shape survives
where it was written — on the compiled scene — which is where it was always legal.

**A plan-level `transitions` array keyed by boundary anchors** — `{ at: "b5.start", ... }`
beside the sections. It expresses the same boundaries and was the first shape proposed for
this feature. Rejected because `transitionIn` is self-anchoring: the entrance is the
scene's own start, so the array's `at` field would exist only to restate what ownership
already says, and validating that a named boundary is actually a scene boundary becomes a
check for a class of error the other shape cannot express. It would also make the
transition a fact about the plan while leaving both scenes ignorant of it — a third owner
for a decision that belongs to one.

**Symmetric `transitionOut`.** Rejected: one boundary, one decision, one owner. Two fields
meeting at a boundary need a reconciliation rule for when they disagree, and either answer
— last writer wins, refuse both — makes the plan harder to write than the single field.

**Theme-declared or automatic transitions.** The theme declaring `every entrance fades`
is still "someone declared it", but the someone is no longer the author of this video:
rhythm is an editorial fact about *this* cut, and a standing default manufactures the
uniformity §9.3 names as a failure while appearing to fix the brutality. Transitions stay
opt-in per instance, and hard cut stays innocent.

**Word-anchored or mid-scene transitions** — a wipe timed to "Montreal". Rejected twice
over: a transition is a boundary phenomenon, and splitting one scene across a beat against
its own `spansBeats` unbuilds the time pipeline; and it would require an anchor form the
grammar does not have, which ADR-0009 has already ruled on.

## Consequences

- **Nothing in the repository has to move today.** No plan declares a transition, no
  capability declares consent, hard cut remains everywhere, and the four catalog examples
  are untouched. This document is a decision with its implementation deferred — the plan of
  record is still `docs/measurement-gate.md` (TypographicStatement → Comparison → run the
  gate), and a transition is not a capability: it will not cut in line ahead of the gate,
  and it adds nothing to the never-cut list.
- **The frozen doc's §12 criterion gets its content back.** "Les transitions ne cassent
  pas la continuité" has been vacuously true since the vertical slice; when this is built,
  it becomes checkable again, and §9.3's continuity test gains the failure mode it always
  named.
- **Two new refusals and one new invention.** `TRANSITION_NOT_DECLARED` and
  `TRANSITION_COVERS_EVENT` join the compile report; `UNKNOWN_TRANSITION` joins the
  `UNKNOWN_*` family that measure 2 of the gate counts as hard fail — the list in
  `docs/measurement-gate.md` gains the code when the shape lands, not before.
- **Catalog examples can illustrate transitions, which word anchors cannot.** A transition
  needs no take — it is self-anchoring — so `syntheticBeats` instances can declare one and
  ADR-0012's "examples illustrate" applies fully, unlike the deictic landing that examples
  can never show.
- **Persistent elements are untouched by construction.** The persistent layer renders at
  section level, outside the scene sequences, so a character crossing a boundary keeps its
  slot while the scenes dissolve beneath it. *Personnage qui saute* remains ADR-0003's
  problem, and a transition neither worsens nor repairs it.
- **Still sampling must stay clear of transition windows.** A frame inside one belongs to
  neither scene — non-regression stills (§9.4) and any measurement that samples the
  picture must treat windows the way they treat nothing else today, as frames no single
  capability owns.
- **The implementation choice is recorded, not decided.** `@remotion/transitions` is pure
  functions of frame number — compatible with deterministic rendering and with
  content-addressed render reuse — and is the natural vehicle; a hand-rolled overlap is
  equally legal. Whichever is taken, decisions 1–6 above bind it.
- **`docs/proposals/architecture-evolutions.md` gains an entry when built**: the plan
  speaks rhythm tokens where the frozen doc's glimpse showed `durationInFrames`, and the
  deviation is deliberate, in the direction the grammar requires.
