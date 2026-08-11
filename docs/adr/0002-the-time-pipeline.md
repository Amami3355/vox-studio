# ADR-0002 — The time pipeline

**Status:** accepted · 2026-08-11
**Scope:** everything between "an agent has written a narrative" and "the compiler has
absolute frames" — the beat contract, how beats acquire timings, and where that work
lives. §7 of the frozen document specified the shape of this pipeline but not its
mechanism.

**Supersedes** the separate-`Script` model in the PRD: §41's data model lists `Script`
and `Beats[]` as sibling artifacts, §17.3 has the Narrative Agent produce both, and §47
checks both in the definition of done. Under this ADR the script is a projection of the
beats, not an artifact. Those three sections are updated in the same change.

## Context

`vox-studio-architecture-figee.md` §7.2 draws the pipeline as
`Beat plan → TTS + alignement forcé → Beats horodatés → COMPILATEUR`, and §12 makes a
real voice-over with forced alignment an imperative constraint of the vertical slice.
The handoff of 2026-08-11 called it "the biggest unknown in the whole chain".

It is a smaller unknown than it looks, and the reason is in the code. `ANCHOR_RE`
(`packages/video/src/catalog/validate.ts:30`) accepts `<beatId>.start|mid|end` with an
optional `±short|long` offset — and nothing else. The entire anchor vocabulary the agent
can write is **beat-relative**, so the compiler needs beat boundaries, not a timestamp
per word.

That covers `.start` and `.end` exactly. It does **not** cover `.mid` or an `±short|long`
offset: those resolve arithmetically and land wherever they land, which is on no
particular word. §12's success criterion "events land on the expected words" therefore
holds today only for boundary anchors.

Word timings would not by themselves fix that, because `.mid` names a temporal midpoint
and not a word — under a full forced aligner it stays exactly as arithmetic as it is now.
What would fix it is a **snapping rule**: the compiler moving an arithmetic anchor to the
nearest word onset. That rule is not in the frozen document and is not decided here. It
is recorded as an open question in `docs/handoff.md`, and the decision below makes it
cheaper to adopt rather than harder — a mark per word costs one more mark, and is exact.

## Decisions

**SSML marks, not a forced aligner.** Google Cloud TTS `v1beta1` with
`enableTimePointing: ['SSML_MARK']` returns a timepoint for every `<mark>` in the input.
Marks at the beat boundaries yield exactly the timings the compiler consumes, and remove
the aligner from the architecture. The rejected alternative was a real forced aligner
(WhisperX, Montreal Forced Aligner) running over the synthesised audio. It was rejected
because it is probabilistic where marks are exact: an aligner introduces a class of
bug — a boundary off by a syllable — that has to be *debugged*, to buy word timings that
marks can also produce, exactly, by emitting one mark per word.

**n beats need n+1 marks, not n−1.** A mark *between* each beat's text gives the internal
boundaries only, leaving the first beat with no `fromMs` and the last with no `toMs`. The
synthesis response carries `audioContent`, `timepoints` and `audioConfig` — there is no
duration field to recover the tail from, short of decoding the audio. So: one mark before
each beat's text, plus one trailing mark after the last. The first is not assumed to be
zero; it is read like the others.

**Timepoints are in seconds; `packages/voice` converts.** The API field is
`Timepoint.timeSeconds`, a double — *not* milliseconds. The conversion to `fromMs`/`toMs`
happens once, at the edge of `packages/voice`, and nothing downstream sees seconds. This
is written down because the failure is silent and absurd: a boundary at 1.5 s stored as
1.5 ms puts every compiled event within a frame of zero, and the video looks like it
simply has no animation.

**A beat carries its voice-over text verbatim.** The spoken script is the ordered
concatenation of beat texts and does not exist as a separate artifact. Had the script
been written alongside beats that point into it, the two could drift with nothing to
detect it mechanically. Carrying the text also makes mark insertion trivial, since a beat
boundary is now a position in a string this agent owns.

It does **not** make "a scene cuts mid-sentence" impossible — an agent can perfectly well
write `b1: "The reason is"` and `b2: "a design flaw."`. What kills drift does not kill
that. The invariant that does is narrower than "every beat is a whole sentence", because
two beats *inside one scene* may split a sentence harmlessly — there is no cut. The rule
is therefore: **the last beat of every scene ends a sentence.** Validated at the section
level, where scene boundaries are known, and reported as an error.

**`Beat` and `TimedBeat` are distinct types, and the seam is in milliseconds.**

```ts
type Beat      = { id: string; text: string };
type TimedBeat = Beat & { fromMs: number; toMs: number };
```

One type with optional timing fields would let an agent write a timing, which rule 3
forbids. The glossary already states the equivalent for anchors — "an agent that writes a
frame is a bug" — so the constraint is made unrepresentable rather than validated.
Milliseconds, not seconds and not frames: ms are the audio domain, frames are the
Remotion domain, and there are exactly two conversions in the system — seconds to ms in
`packages/voice`, ms to frames in the compiler.

**Sections are authored; persistent elements declare placements.** A Section is the scope
of a persistent element — a contiguous run of beats. The agent writes it, and declares
its persistent elements on it with a list of `{ at: <anchor>, slot }` placements. The
compiler folds those into the `layoutStates` of §10.

Deriving section boundaries from runs of persistent elements was considered and rejected
as circular: it would require the elements to be declared per scene, which the glossary
forbids ("owned by the Section runtime, never by scene nesting"). The authored form also
reuses machinery — folding placements into `layoutStates` is the same operation as
folding events into `TimedEvent`, which `resolveEvents` already performs.

**`spansBeats` is required, contiguous, exclusive and total — at both levels.** It was
optional, while the glossary made a scene's duration depend on the beats it spans. It is
now required and non-empty, and the same three properties are checked twice:

- **scenes within a section** — a scene's beats are contiguous in plan order, no two
  scenes share a beat, and their union equals the section's `spansBeats`;
- **sections across the plan** — a section's beats are contiguous, no two sections share
  a beat, and their union equals the plan's `beats`.

Checking only the first level is not enough, and the hole is easy to miss: a plan with
beats `[b1, b2]` and a single section covering `b1` passes every within-section check
while `b2` still plays over nothing. Totality is the property that earns its keep at both
levels — it makes "duration = sum of spanned beats" a total function, and it makes the
orphan beat, voice over a black screen, impossible to express rather than merely unlikely.

Three error codes, because they are three different corrections to feed back to the agent
under §8.1: `BEAT_NOT_CONTIGUOUS`, `BEAT_DOUBLE_BOOKED`, `BEAT_UNCOVERED`. Each carries
`sectionId` when it fires at the scene level and omits it at the section level, which is
how the report says which of the two partitions broke.

**The impure half is a separate package.** The compiler lives in
`packages/video/src/compile/` — it is pure and deterministic, and it reuses
`core/anchors.ts`, `core/events.ts`, the Zod schemas and the registry, so reimplementing
it in Python would duplicate the single source of truth and break rule 1. The TTS call
lives in a separate `packages/voice`. Without that split, a Google Cloud client ends up
inside the package Remotion bundles.

`packages/voice` returns **both halves of the synthesis**, not just the timings:

```ts
type VoiceTake = { beats: TimedBeat[]; audio: AssetRef };
```

The call produces `audioContent` alongside the timepoints, and the compiled document's
`audio.voiceover` (§10) has nothing to point at if that audio is dropped on the floor.
The mp3 is persisted and referenced as an `AssetRef`, which is the union every other
asset already travels in — the voice-over is not a special case.

Python stays reserved for the ADK agents, which exchange only JSON — manifest in, beat
plan out — exactly the boundary ADR-0001 reserved. Making Python a runtime dependency of
step 7 of the build order, when the agents are step 10, would invert that order.

## Deviations from the frozen document

§7.2's "TTS + alignement forcé" becomes "TTS + timepoints". Recorded in
`docs/proposals/architecture-evolutions.md` rather than by editing the frozen document,
per its §0.

§7.2 and §10 name the same generated output differently — `SectionTimeline` and
`layoutStates`. `CONTEXT.md` adopts `layoutStates`, the name that appears in the compiled
artifact.

## Consequences

- The vertical slice's riskiest brick is no longer a research problem. What remains is an
  API call and a fold.
- The voice-over script cannot be authored independently of the beats. Any writing agent
  or hand-written plan produces beats, not prose to be chopped afterwards.
- `packages/voice` needs Google Cloud credentials; the compiler and the renderer never do.
  Nothing in CI or in a contributor's checkout requires a cloud account to run the tests.
- Making `spansBeats` required costs nothing at the call sites: all five `BarChartScene`
  examples and every fixture in `validate.test.ts` already set it. What it removes is the
  fallback in `ExampleScene.tsx:40` (`example.spansBeats ?? ['b1']`), which becomes dead.
- Totality cannot be checked against today's types. `VideoPlanSection` is
  `{ id, scenes }` — a section does not declare which beats it covers, so there is
  nothing to compare the union of its scenes' beats against, and nothing to partition the
  plan's beats over. The section gains `spansBeats` in the same change.
- `.mid` and offset anchors are not word-synchronised, and will not be until the snapping
  rule is decided. Until then, an event that must land on a specific word belongs on a
  beat boundary — which means the writing agent's beat granularity, not the anchor, is
  what buys precision. Worth saying out loud when the beat texts for the slice are written.
