# ADR-0002 — The time pipeline

**Status:** accepted · 2026-08-11 · **superseded in part by ADR-0004** · 2026-08-12
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

> **Closed on 2026-08-13, and against this expectation.** Measured against a real take,
> snapping was the wrong repair: the worst failure in the shipped slice was already exactly
> on a word onset — the wrong word's. The answer is a word-naming anchor, and `.mid` stays
> arithmetic on purpose. See the last amendment.

## Decisions

> **The first two decisions below are superseded by ADR-0004.** The provider is ElevenLabs
> and there are no SSML marks; beat boundaries come from character start-offsets instead.
> The n+1 *shape* survives, and so does the reasoning that rejected forced alignment — see
> ADR-0004 decisions 2 and 3. Everything from "Timepoints are in seconds" onward stands.

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
- `packages/voice` needs a synthesis credential — an `ELEVENLABS_API_KEY` under ADR-0004,
  Google Cloud credentials as originally decided; the compiler and the renderer never do.
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
  **Superseded by the amendment of 2026-08-13**: such an event belongs on a word anchor,
  and snapping was measured to be the wrong repair. `.mid` and the offsets stay arithmetic
  on purpose.

## Amendments

**2026-08-12 — the timed take is checked as a projection of the plan.** This ADR gave
`TimedBeat` its shape and said where it comes from, but never said what the compiler does
when it is handed one that is wrong. The compiler checked that each plan beat id appeared
somewhere in the take, and nothing else: a reversed window, a `NaN` boundary, two beats
out of order, a gap between them, or text the plan no longer contains all compiled into a
document.

The decision is the one `checkPlanShape` already took one layer up, applied to the other
input. A take arriving as JSON — from `packages/voice`, from a fixture, from a file
written before the plan was last edited — has none of the guarantees its TypeScript type
makes, and every window derived from it assumes all of them. A `TimedBeat[]` is therefore
required to be an **exact, ordered, contiguous projection of the plan's beats**: same ids
in the same positions, the same text, every boundary finite and forward, and each beat
starting where the previous one ended.

Two of those are worth their own sentence.

**Contiguity is an invariant, not a policy.** Nothing above decides that a voice-over may
not pause. It is that this ADR synthesises n beats from n+1 marks, so mark *i* is both the
end of one beat and the start of the next — a take built the way this document describes
cannot have a gap, and one that does was not built that way. (Under ADR-0004 the marks
become character start-offsets and the invariant is unchanged; see its decision 3.) The
compiler cares because
scene and section windows are derived from beat boundaries: 200ms nobody owns is a black
flash between two scenes, not silence under a picture.

**Text equality is the stale-audio detector this ADR promised and never built.** A beat
carries its voice-over verbatim so that a script and the beats pointing into it cannot
drift "with nothing able to detect it mechanically". Something now detects it. Editing a
plan after synthesis is the ordinary way the two come apart, and it is invisible in the
render — the pictures are cut against words that are no longer spoken.

One error code, `INVALID_TIMING_INPUT`, where the beat partition earns three. Those three
are three different corrections an agent can make. This is one correction no agent may
make: rule 3 forbids an agent from writing a timing at all, so the only repair is to
synthesise again, and the distinction that matters goes in the message rather than in the
code. `MISSING_BEAT_TIMING` survives as its own code and is reported alone — with holes in
the take, every ordering and contiguity check fires too, and a report naming ten problems
that are one problem is worse than useless to whoever has to fix it.

The check has no cost today, because every timing the compiler has ever seen came from a
fixture the same file constructed. It is written now because that stops being true the
moment `packages/voice` lands, and a stale take is not a failure anyone notices by
watching the video — it is a video that plays.

**2026-08-12 — the provider changes; see ADR-0004.** The first two decisions of this
document are superseded. ElevenLabs has no SSML `<mark>`, so beat boundaries are derived
from the n+1 character start-offsets of its `with-timestamps` alignment instead of from
n+1 marks. Three things are worth knowing without opening the other file.

The **shape** is unchanged: n+1 boundaries, the first one read rather than assumed to be
zero, the tail taken from the end of the last character because there is still no duration
field to recover it from. The **contiguity invariant is unchanged**, and so is every line
of `compile/timings.ts` written above — only the sentence justifying it moves, from "n
beats from n+1 marks" to "n beats from n+1 character offsets".

And the **rejection of forced alignment stands**, which is the part a quick reading gets
backwards. Character timings are the synthesiser reporting what it spoke, not an aligner
inferring it from a waveform, so the class of bug this document rejected — a boundary off
by a syllable, to be debugged — is not what was adopted. ElevenLabs' actual Forced
Alignment API remains rejected, for the reasons given above.

**2026-08-13 — open question 1 is closed, and the answer is not snapping.**

This document recorded, twice, that `.mid` and offset anchors "land wherever they land,
which is on no particular word", and named the repair it expected: a **snapping rule**, the
compiler moving an arithmetic anchor to the nearest word onset. It called that rule
undecided and said the decision above made it *cheaper to adopt*. The first real take made
the question measurable, and the measurement says snapping would not have worked.

The shipped slice's worst failure was `highlightBar { label: 'London' }` at `b3.start`,
firing at frame 310. Frame 310 was the exact onset of a word. The word was **"Berlin"**.
Snapping moves an anchor to the nearest onset; that anchor was already *on* one. A second
failure, `revealAll` at `b2.mid`, landed mid-word on "loses" — snapping would have moved it
about seven frames, onto "loses", still 2.2 seconds after "London" was spoken and still
wrong. Neither defect was a precision defect. Both were the anchor naming the wrong moment
with complete precision.

So the repair is **naming, not snapping**: the grammar gains `<beatId>.word:<word>`, and an
event that must land on a word says which word. The agent still writes no frame and no
millisecond — rule 3 is untouched, and if anything sharpened, because "the word London" is
more semantic than "the midpoint of b2" ever was.

Four things follow, and are worth stating because each was a choice with a losing
alternative.

**Word anchors take no offset.** `b2.start+short` is meaningful — the boundary is exact and
the lag is deliberate. `b2.word:London+short` is not: an offset from a word onset is the
same arithmetic this branch exists to replace, one token later. Naming the next word is
exact where `+short` is only close. It also removes a real ambiguity rather than
documenting one: `-short` and `-long` are offsets, `-` is a word character, and
`b2.word:month-long` would otherwise parse as "month" plus an offset, silently.

**A repeated word is an error, not a first match.** `b2.word:rent` where the beat says
"rent" twice is `AMBIGUOUS_ANCHOR`. Resolving it to the first occurrence would be a silent
choice of which word the picture cuts on — the exact failure this branch repairs, arriving
through the mechanism built to prevent it. The correction is cheap and an agent can make it
unaided: name a word that appears once, or take a boundary.

**The words live on the `TimedBeat`, and are a projection of its own text.** Not a separate
`TimedWord[]` beside the take: a beat already carries its voice-over verbatim, and its words
are that same text tokenised with onsets the character alignment always contained. So
`checkTimings` requires `beat.words` to be exactly `tokenise(beat.text)` — equality, not
containment, because "every word appears somewhere in the text" would accept a fold with an
off-by-one whose output still looks like English. One tokeniser, in `core/words.ts`, shared
by the fold, the grammar and the compiler; three definitions of a word that agreed by hand
would make a word visible in the beat text unnameable and say nothing about why.

**Empty is legal at the take and loud at the anchor.** A take that was not folded from a
recorded alignment — `render-demo.mts`, every catalog example under `syntheticBeats` —
genuinely has no word timings, and reports `words: []`. Fabricating onsets by spreading
words across a duration was rejected outright: the numbers would be indistinguishable from
measured ones and would cut the picture against the wrong syllable. So the compiler accepts
a take with no words, and `resolveAnchor` refuses the *anchor* that asks for one, because
that is where somebody asked.

The check that matters most is the cheapest one. Whether "London" is a word of b2 is a fact
about the beat text the agent has just written — no audio, no credential, no quota — so
`validateVideoPlan` answers it in the cold pass and the agent repairs it unaided under §8.1.
The compiler's version of the same question, asked of a take rather than a plan, is the
unreachable defensive half.

### What is still not word-synchronised

The consequence below that reads *"an event that must land on a specific word belongs on a
beat boundary"* is superseded: it belongs on a word anchor. But `.mid` and the offsets are
**unchanged and still arithmetic**, deliberately. They were never broken — a push-in that
begins halfway through a beat is not trying to land on a word — and giving them a snapping
rule now would move every existing anchor in the catalog to serve a case that has its own
grammar. What changed is that an event with a word in mind is no longer forced to express
itself in arithmetic.

And the vocabulary only reaches events that *name* something spoken. `annotate` names the
bar its note attaches to, and takes its timing from the sentence that justifies the note,
which may be a beat away — the slice's annotation reads "Twenty points above Berlin" and
fires on "twenty" in b3, while its payload says London. Which of an action's payload fields
refer to something the narrator says is not in the manifest, and the vertical slice's
landing gate carries that list in the open until it is. That is the next thing this
vocabulary wants.

**2026-08-13 — the grammar is published, and deixis is declared.** The amendment above
ends by naming what the vocabulary wanted next: the manifest did not say which of an
action's payload fields refer to something the narrator speaks, so the landing gate carried
`DEICTIC_ACTIONS = ['highlightBar']` as a literal in the test file. Measuring the manifest
against rule 2 turned up something larger standing beside it — `catalog.json` contained no
mention of anchors **at all**. Every event in every example is placed with one, and the
entire vocabulary for placing them was described exclusively in TypeScript the agent, by
rule 2, never reads. Both are the same defect: a fact the code holds and the manifest
withholds.

**The grammar is data, and the sentence is derived from it.** `ANCHOR_GRAMMAR` in
`core/anchor-grammar.ts` carries the branches, what each means, and examples;
`ANCHOR_EXPECTATION` — the fragment that completes a rejection — is now generated by
joining them, and `catalog.json` grew a top-level `time` block. The losing alternative was
a hand-written description in the manifest generator, which is the same mistake this file
has already made twice: the grammar has existed in three copies in this repository, one of
which would have rejected the first example to use a word anchor. A grammar that describes
itself twice describes itself differently within a month. `manifestVersion` is 2.

**Deixis belongs to the action, as a list of fields rather than a flag.** `ActionDef` gained
`deicticFields`, and `highlightBar` declares `['label']` while `annotate` declares nothing.
A boolean on the action would have been shorter and wrong: `annotate`'s `label` also names a
spoken word — it is the same bar — and the distinction that matters is not whether the
payload contains a spoken word but whether the *event* must land on it. `annotate` takes its
timing from the sentence that justifies the note. Naming fields also makes the gate read the
payload it was told to read instead of guessing which key holds a word.

**What is guarded, and what is not.** A declaration that names a field the payload does not
carry reads `undefined`, yields no word, and turns the gate green by giving it nothing to
look at — the "renders fine, animates nothing" species one level up. `catalog-contract`
rejects it, and the slice's own vacuity check catches the consequence independently; both
were run red before being trusted. What is **not** guarded is the permissive default: a new
pointing gesture that forgets to declare is unchecked and silent. That is the residual risk,
accepted knowingly, because the alternative — requiring every action in the catalog to
declare a field it does not have — would make the common case pay for the rare one.

The gate is now general rather than exemplary: it holds every action that declares itself
deictic, in any capability, without a test file knowing their names. Declaring `annotate`
deictic was used as the falsification and made it fail, which is what proved it reads the
declaration rather than merely passing.

**2026-08-13 — the declaration is enforced, and "loud at the anchor" is made to mean a
report.** An adversarial review of the two sessions above found that `deicticFields` was
published and read by nothing outside one test over one shipped plan. The amendment before
this one closed with the claim that the gate was "general rather than exemplary"; it was
general over the *slice*. A user-authored plan could anchor `highlightBar` with a payload
saying London at `b3.word:Berlin`, or at `b1.start`, and validate and compile — reproducing
by hand the exact defect in the shipped plan that having word onsets first revealed. Rule 2
makes that worse than an omission: the manifest is what the agent learns from, so publishing
a rule the compiler does not apply teaches a rule that is not true.

**Landing is enforced over a plan, not over an instance, and that is forced.** An instance
with no take cannot carry a word anchor at all — `syntheticBeats` has no words, by the
decision above not to fabricate onsets — and every catalog example is such an instance.
Holding `validateScene` to landing would make a pointing gesture impossible to *illustrate*,
leaving the catalog unable to teach the rule it enforces. A plan is what gets a take, so a
plan is what is held to it. `DEICTIC_ANCHOR_REQUIRED` is the code, and it carries the
anchors that would satisfy it in `expected`, because the repair is mechanical.

**A multi-word deictic value lands on any one of its tokens.** This was the open
sub-question. `word:` names a single token by construction and a phrase has no single onset,
so "New York" is satisfied by `b2.word:New` or `b2.word:York`. The narrator is saying the
phrase across both and which of them the picture cuts on is an editorial choice the plan is
entitled to make. Requiring a phrase-level selector was rejected: it would add a second
anchor form to serve a case the existing one already covers acceptably.

**Hard, not soft.** The plan renders either way — a gesture on the wrong frame is not a
broken video — so rule 5 admits both readings. It is an error because the capability
*declared* the obligation: `deicticFields` is the catalog saying this action means "this
one", and a declaration the compiler downgrades to a warning is a declaration that does not
hold. The soft reading is recorded here as the losing option in case a real plan makes the
strictness intolerable.

**"Empty is legal at the take and loud at the anchor" stands, and now means what it said.**
Loud meant a thrown `UnresolvableWordError`, which left `compile` past a signature promising
a `CompileResult` and past §8.1's promise of a reason. A crash is not a report. The
resolver's throw is unchanged; `checkAnchoredWords` in `compile/timings.ts` now answers the
take's half of the question before resolution runs, over the same `sectionAnchors` walk the
plan's half uses — a placement and an event were checked differently before, which is why a
word anchor in a placement crashed compilation while the same anchor in an event was
reported.

The claim in the amendment above that the compiler's copy of this question is "the
unreachable defensive half" was **wrong for one input**, and the sentence was part of the
defect: `checkWords` exempts an empty list, so a plan whose text speaks London passed the
plan check, a take with `words: []` passed the take check, and the unreachable half was
reached. Reachability is now a property of three checks rather than of a sentence in a
docstring.

**Recorded is a property of a take, not of a beat within one.** A take with onsets on some
beats and none on others is refused. The glossary already defined empty as "this take was
never recorded", which is a sentence about a take; a fold either ran or it did not. A mixed
take is a fold that half completed, a hand-edited artifact, or two takes spliced, and it is
the quiet case — only the beats that happen to lack words complain, while the rest resolve
to plausible frames. A beat whose text tokenises to nothing is exempt, since an empty list
is the correct fold of a beat with no words in it.

**And `words` is checked for shape at all.** This ADR's own premise is that a take arriving
as JSON has none of the guarantees its TypeScript type makes. `words` was the one field
still leaning on them: a take written before the field existed has no `words` key, and
reading `.length` off it threw a TypeError from inside the gate whose purpose is to return
an error instead.
