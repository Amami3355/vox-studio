# Vox Studio — Context

Vox Studio turns a question into a researched, narrated, visually premium explainer.
An agent crew does the research, writing and art direction; Remotion does the rendering.
This file is the glossary. Use these terms verbatim — the synonyms listed under
"avoid" are avoided deliberately.

## Glossary

**SceneCapability** — A *type* of scene available in the catalog (`bar_chart`,
`image_context`, …). 8–12 exist in V1. Defined by code, generated into the manifest at
build time, immutable at runtime. Avoid: "component", "scene type", "template".

**SceneInstance** — One *use* of a capability inside one video. Dozens per project.
Authored by the agent, edited by the user, serialised into the video document. The
studio edits instances, never capabilities. Avoid: "scene" on its own when the
capability is meant.

**Scene** — Level 2 only. A scene is a SceneCapability or an instance of one. Never a
primitive, never a section.

**Primitive** — A level 1 visual building block (`AnimatedText`, `Bar`, `Callout`,
`CameraRig`, `SlotFrame`). Not exposed to the agent, ever.

**Section** — Level 3. The scope of a persistent element: a contiguous run of beats over
which the same persistent elements survive. Authored by the agent, played by a generic
runtime — there is no hand-written section component per video. Every beat of a section
belongs to exactly one of its scenes.

**Persistent element** — Something (usually a character cutout) that survives across
scene boundaries inside a section. Declared on the section, never by scene nesting.

**Placement** — A persistent element's slot at an anchor. Placements are to persistent
elements what events are to scenes: the agent writes them symbolically, the compiler
folds them into `layoutStates` with absolute frames. Avoid: "SectionTimeline", which
§7.2 of the frozen doc uses for the same generated output that §10 calls `layoutStates`.

**Beat** — The narrative unit the agents work in. A beat carries its own voice-over text
verbatim, so the spoken script is the ordered concatenation of beat texts and never
exists as a separate artifact. Beats get real timings from the voice-over; scenes derive
their durations from the beats they span. Avoid: "script" as something written alongside
beats, or a beat that merely points at a range of one.

**VideoPlan** — The agent-authored semantic document: ordered Beats partitioned into
Sections, with their SceneInstances, persistent elements and placements. It contains no
timings, frames, safe areas or resolved asset references; the compiler combines it with a
Take to produce the Compiled document. Avoid: "compiled plan" — compilation produces a
different artifact.

**Timed beat** — A Beat plus its real start and end, in milliseconds, as spoken. The
agent produces Beats and never TimedBeats. Milliseconds are the audio domain and frames
are the Remotion domain; the compiler is the one place they meet.

**Frame beat** — A beat's window in frames, `{ id, from, to }`. The third and last domain
a beat travels through: `Beat` narrative → `TimedBeat` audio → `FrameBeat` Remotion. Only
the compiler crosses the second seam. Avoid: calling any of the three just "beat" in code.

**Anchor** — A symbolic point in time: `b4.start`, `scene.end-short`, `b2.word:London`. The
agent writes anchors. The compiler writes frames. An agent that writes a frame is a bug. The
grammar has one definition, `ANCHOR_GRAMMAR` in `core/anchor-grammar.ts`, and both the
compiler's rejection message and the manifest's `time` block are generated from it — an
anchor vocabulary the manifest does not publish is one rule 2 makes unlearnable.

**Boundary anchor** — The arithmetic form: an **edge** of a beat, optionally nudged by a
rhythm token. Two edges only. `b5.mid` was legal through `manifestVersion` 3 and was retired
by ADR-0010: the middle of a beat is a fraction of a duration rather than a moment anyone
wrote, and no one can say which word it lands on until the take exists. Offsets are absolute
frame counts, so this form reaches about a second in from either edge and no further. `scene`
is the pseudo-beat for a scene's own bounds and carries this form only. Avoid: "the default
anchor" — it is the form for the two moments a beat genuinely has, not the one to reach for
first.

**Word anchor** — The one anchor form that names a word instead of arithmetic:
`b2.word:London` resolves to the frame the narrator begins that word. Available to **any**
event, not only to a pointing gesture: a Deictic field makes this form an obligation, never
a permission, and any event whose moment is justified by a sentence may name a word of that
sentence. The word must appear **exactly once** in that beat: twice is `AMBIGUOUS_ANCHOR`,
since picking one silently is the defect this form exists to repair. No offset is allowed.
Resolvable only against a real take, never `syntheticBeats`. Two events that both name a word
fire in the order their words are spoken, which the agent can read off the beat text it
wrote — the property ADR-0010 retired the midpoint to protect, since a word cannot be ordered
against a fraction. See ADR-0002's last amendment, and ADR-0009 for why the narrower reading
cost the shipped run two late callouts. Avoid: "snapping", which was measured and rejected;
and "the word anchor is for highlights", which is the narrowing itself.

**Event order** — A scene's `events` array is a script: the order the events are written is
the order they play. Equal frames are legal — two events on one moment fold in written order
— so each event must land *at or after* the one above it, never strictly later. Judged on the
**resolved** frames and therefore at compile time, never in the schema: an anchor is a string
until a Take turns it into a moment. Violating it is `EVENTS_OUT_OF_ORDER`. See ADR-0011, and
ADR-0010 for the shipped callout that arrived 72 frames before the bar it described. Avoid:
reading it as "events are sorted for you" — the runtime does sort by frame
(`core/events.ts`), and that sort is exactly what turned an out-of-order list into a silent
defect instead of a visible one.

**Timed word** — One word of a beat and the moment it begins, in milliseconds. Carried on
the `TimedBeat`, and required to be exactly the beat's own text tokenised — not information
beside the beat, the same information the alignment always had. Empty means "this take was
never recorded", which is legal; a word anchor against it is not, and it is a property of
the *take* — a take with words on some beats and not others is refused.

**Take manifest** — `<id>.take.json`: a take id and SHA-256 of the audio and the alignment,
written by `record-take.mts` at the one moment "these were recorded together" is a fact
rather than an assumption. The take id is derived from the two hashes, so it *is* which take
this is rather than a claim about it. `refold.mts` verifies it before overwriting the beats,
and a standing test holds the committed mp3 against it. See ADR-0004's last amendment.
Avoid: treating it as metadata — it is the only thing that authenticates the audio.

**Motion profile** — A motion *role* chosen per scene from a closed set
(`editorialStatic`, `subtleDrift`, `pushIn`, `energetic`, `impact`, `cinematic`).
The agent picks a profile; it never picks an easing, a duration or a camera amount.

**Pace / hold** — Rhythm tokens (`quick|measured|slow`, `none|short|long`). They shape
the internal distribution of events, never the length of a scene.

**Slot** — A coarse region of the canvas an element occupies (`left`, `cornerBR`, …).
The agent speaks slots.

**Safe area** — The rectangle a scene renders into, given to the component as percentages
from each edge. It is how the compiler's resolution of competing slot occupations reaches
the frame. The component speaks safe areas, the agent speaks slots, and the two
vocabularies never cross.

**Slot conflict** — A scene's occupancy overlapping a persistent element's placement.
Resolved in favour of what was declared: a composition the scene supports, failing that
another slot the element already uses in the section, failing that the element is hidden
for the scene. The compiler never invents a position. The **scene** is the unit and it is
solved as a whole — one composition, every element crossing it resolved against that same
composition, held for the scene's duration. See ADR-0003.

**Transition** — How a scene *arrives*: an optional `transitionIn` on the scene instance,
naming an effect from a closed published vocabulary and a rhythm token for its length.
Absence is the hard cut, which is the default and not a degradation. Self-anchoring by
construction — it plays around the scene's own start and no anchor is written for it, so
the anchor grammar does not widen. The overlap is carved from the incoming scene's head,
so scene and composition durations stay pinned to the take. An anchored event must never
resolve inside the window: `TRANSITION_COVERS_EVENT`. The compiler plays only an effect
the incoming capability declared (`supportedTransitions` in its meta). See ADR-0013.
Avoid: "transition" as something a scene exits through — ownership lives with the arrival
only; and treating the cut as something declared — it is the absence of a declaration.

**Action** — A member of a capability's *closed* event vocabulary (`highlightBar`,
`annotate`). An action outside the vocabulary is a compilation error, never a silence.

**Deictic field** — A payload field of an action whose value is a word the narrator speaks
and which the event must therefore *land on*: `highlightBar` declares `deicticFields:
['label']`, because "this one" is only true while the narrator is saying the thing pointed
at. Declared on the action and published in the manifest, so the rule reaches every
capability rather than the ones a test remembered. `annotate` declares none — its label
names the same bar, but the note's timing follows the sentence that justifies it. The
anchor to write for a deictic field is a Word anchor, and a plan that anchors one elsewhere
is refused with `DEICTIC_ANCHOR_REQUIRED`. Enforced over a *plan*, never a bare instance: an
instance with no take cannot carry a word anchor, and every catalog example is one. A
multi-word value lands on any one of its tokens. Avoid: treating it as "the payload mentions
a word", which is what `annotate` also does.

**Teaching surface** — Everything an agent learns what to write from, taken together: the
manifest it reads before writing — grammar forms and their examples, action descriptions,
soft constraints, scene examples — and the compiler's refusals afterwards, each carrying
`means`, `repair`, and an `expected` list computed against that plan. Examples illustrate
the shape of a plan; they carry no obligation to exercise every action or to be a plan the
compiler would accept in every context, because a refusal names the exact repair. This is
why a Deictic field is never anchored correctly in a scene example and why that is not a
defect. See ADR-0012. Avoid: treating examples as the only teacher, and adding one to cover
a case a refusal already names.

**Hard constraint** — Expressed in the Zod schema. Violating it rejects the plan.

**Soft constraint** — Expressed in `constraints.ts` and published to the manifest.
Violating it degrades the render and emits a warning.

**AssetRef** — A discriminated union of `ready | placeholder | failed`. A missing
reference is an error; a resolved placeholder is not. `failed` is distinguished from
`placeholder` because one needs intervention and the other needs patience.

**Manifest / catalog** — `packages/video/src/catalog/catalog.json`. Generated from the
registry, committed, never hand-edited. It is everything the agent knows about the
scene library. If the manifest is insufficient, fix the manifest, not the prompt.

**Compiled document** — What the compiler emits and the Section runtime plays. Frames,
percentages and resolved assets; never an anchor, a slot or a millisecond. It is JSON,
which is what makes a video's composition assertable without rendering it. Avoid:
"timeline", and "compiled plan" — a plan is the input.

**Compile report** — A structured deliverable (`errors[]`, `warnings[]`), not a log.

**Measurement gate** — §13 step 9: a generalist model, given only the manifest and ten
briefs written by the user, authors plans that are scored on five measures. It measures the
**catalog**, never the agent, and anything under threshold is repaired by depth and never by
adding a capability. Specified in `docs/measurement-gate.md`. Avoid: "the eval", which
suggests the model is the subject.

**Brief** — One paragraph of editorial intent, written by the user, carrying no structure
and no vocabulary from the manifest. The gate's input. Two of the ten are deliberately
unservable. Avoid: "prompt" — a brief is not addressed to a model's instructions.

**Agent production interface** — The complete agent-visible boundary through which a
generalist agent authors a plan and requests the production operations that turn a Brief into
a narrated preview. It exposes generated contracts and public vocabulary, but no repository
source, sourcemaps, internal commentary or readable implementation. It holds whether
production executes locally and opaquely or outside the agent's environment entirely.
Minification alone does not establish code-blindness. Avoid: "catalog CLI", which names one
transport rather than the whole production boundary.

**Production service** — The trusted side of the Agent production interface, outside the
agent-readable environment. It owns production execution and discloses only public contracts,
artifacts and results. Avoid: "backend", which does not name the trust boundary, and "runtime
bundle", which suggests something delivered into the agent environment.

**Authoring knowledge frame** — The categorised, progressively discoverable public knowledge
through which an agent learns to author a valid VideoPlan and operate the Agent production
interface. Every fact has one canonical source and may appear elsewhere only as a derived
projection. Avoid: "prompt", "manual" or "documentation bundle", which imply a second,
hand-maintained source of truth.

**Run** — One persistent production attempt for one Brief and its operator-owned production
configuration. It advances through explicit stages, survives interruption and retains the
last successful stage when a command needs repair, pauses or fails. Avoid: "session", which
suggests state that disappears with the process.

**Run checkpoint** — The authenticated, agent-readable view of a Run's current artifact
bindings and freshness. It is inspectable and recoverable, but it is not the authority for
irreversible quota or authorisation state. Avoid: "run manifest", which suggests the file is
self-authorising.

**Run ledger** — The Production service's private monotonic authority for a Run's revision,
quota-bearing recording dispatches and consumed replacement authorisations. It anchors the
public checkpoint against rollback without hiding the Run's media. Avoid: "cache", which
suggests disposable derived state.

**Decline** — A terminal Run outcome stating that the Brief cannot be served by the current
catalogue and naming the unmet editorial need and catalogue gap. It produces no preview and
is never represented by a process exit code alone. Avoid: "failure", because refusing an
unservable Brief is correct production behaviour.

**Preflight** — A plan-only, non-authoritative assessment performed before recording. It
reports the risks estimable without a Take — duration above all, since a scene has no duration
until spoken milliseconds become frames and `BELOW_MIN_DURATION` is a hard error the compiler
alone can raise. It never claims that an estimated duration or word timing compiled. Avoid:
"dry compile", which promises the authority it is defined not to have.

**Duration calibration** — Configuration-scoped evidence that Preflight uses to estimate
narration length from authored Beat text before a Take exists. It is advisory and remains
usable only while later verified Takes stay inside its declared uncertainty. Avoid: "synthetic
timing", which would make an estimate indistinguishable from recorded evidence.

**Recording input** — The operator-authorised synthesis request derived from ordered beat text
and production voice settings. It determines whether spending quota is a first recording or a
replacement request; it does not identify the resulting recording. Identical recording inputs
can produce *different* Takes — synthesis is not reproducible even at a fixed seed — which is
why replaying one is a replacement attempt rather than a reproduction, and why `takeId`,
digested from the audio and the alignment, is what identifies and binds the Take that comes
out.

## The six rules

1. The schema is the single source of truth. Props, manifest, validation and docs are
   generated from one object.
2. The agent never sees the code. It sees the manifest.
3. The agent expresses semantic time; the compiler produces physical time.
4. The render is a pure function of `(props, frame)`. No `useState`, no unseeded
   randomness, no `Date.now()` — absolutely in `src/scenes/`, `src/primitives/` and
   `src/design/`, which is everything the agent can cause to be drawn, and
   `tests/render-purity.test.ts` holds them to it. A control under `src/runtime/` may keep
   render-*lifecycle* state that nothing drawn depends on: `StressControl`'s probe holds a
   `delayRender` handle in the package's one `useState`, argued where it is taken.
5. Hard constraint → loud failure. Soft constraint → silent degradation. The two regimes
   never overlap.
6. Consistency comes from the design system; richness comes from the scenes. Tokens stop
   a scene being ugly. They do not make it strong.

## Layout of the repo

```
packages/voice/           TTS: a recorded take → TimedBeat[]. Pure fold, impure shell
packages/video/           the scene library — everything Remotion renders
  src/assets/             minimal Asset Resolver: identity cache, repository library, placeholder
  src/core/               shared vocabulary: anchors and their grammar, words, slots, types
  src/design/             L0 tokens: theme, motion profiles, fonts
  src/primitives/         L1, not exposed to the agent
  src/scenes/             L2, the catalog; one folder per capability, plus _TemplateScene
  src/compile/            the compiler: plan + timed beats → the compiled document
  src/runtime/            scene rendering, example playback, the Section runtime
  src/catalog/            manifest generation, the four tools, validation
apps/component-studio/    internal evaluation harness (grid, filmstrip, matrix)
services/agents/          reserved for the Python ADK orchestration; not initialised
```

**Take** — One recording of a plan's script: its `TimedBeat[]`, its audio, and the
character alignment both were derived from. Synthesis is **not** reproducible, so a take is
recorded deliberately and committed, and its three artifacts are one thing — swap any of
them alone and the video is cut against words the audio does not say. See ADR-0004's last
amendment. Avoid: "the voice-over" for the timings, or "regenerate" for what produces one.

## Not yet built

The Asset Resolver beyond identity cache/local library/placeholder, the remaining
capabilities, entrance transitions (ADR-0013), the agents, and the product Studio UI. See the build order in
`vox-studio-architecture-figee.md` §13, ADR-0002 for the time pipeline, ADR-0003 for slot
conflicts and ADR-0004 for the voice. Step 9 of that build order is specified in
`docs/measurement-gate.md`, which tracks its entry conditions against today's six
capabilities.
