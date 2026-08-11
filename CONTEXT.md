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

**Timed beat** — A Beat plus its real start and end, in milliseconds, as spoken. The
agent produces Beats and never TimedBeats. Milliseconds are the audio domain and frames
are the Remotion domain; the compiler is the one place they meet.

**Frame beat** — A beat's window in frames, `{ id, from, to }`. The third and last domain
a beat travels through: `Beat` narrative → `TimedBeat` audio → `FrameBeat` Remotion. Only
the compiler crosses the second seam. Avoid: calling any of the three just "beat" in code.

**Anchor** — A symbolic point in time: `b4.start`, `b5.mid`, `scene.end-short`. The agent
writes anchors. The compiler writes frames. An agent that writes a frame is a bug.

**Motion profile** — A motion *role* chosen per scene from a closed set
(`editorialStatic`, `subtleDrift`, `pushIn`, `energetic`, `impact`, `cinematic`).
The agent picks a profile; it never picks an easing, a duration or a camera amount.

**Pace / hold** — Rhythm tokens (`quick|measured|slow`, `none|short|long`). They shape
the internal distribution of events, never the length of a scene.

**Slot** — A coarse region of the canvas an element occupies (`left`, `cornerBR`, …).
The agent speaks slots.

**Safe area** — Percentages of the canvas a scene must keep clear, computed by the
compiler from competing slot occupations. The component speaks safe areas. The two
vocabularies never cross.

**Action** — A member of a capability's *closed* event vocabulary (`highlightBar`,
`annotate`). An action outside the vocabulary is a compilation error, never a silence.

**Hard constraint** — Expressed in the Zod schema. Violating it rejects the plan.

**Soft constraint** — Expressed in `constraints.ts` and published to the manifest.
Violating it degrades the render and emits a warning.

**AssetRef** — A discriminated union of `ready | placeholder | failed`. A missing
reference is an error; a resolved placeholder is not. `failed` is distinguished from
`placeholder` because one needs intervention and the other needs patience.

**Manifest / catalog** — `packages/video/src/catalog/catalog.json`. Generated from the
registry, committed, never hand-edited. It is everything the agent knows about the
scene library. If the manifest is insufficient, fix the manifest, not the prompt.

**Compile report** — A structured deliverable (`errors[]`, `warnings[]`), not a log.

## The six rules

1. The schema is the single source of truth. Props, manifest, validation and docs are
   generated from one object.
2. The agent never sees the code. It sees the manifest.
3. The agent expresses semantic time; the compiler produces physical time.
4. The render is a pure function of `(props, frame)`. No `useState`, no unseeded
   randomness, no `Date.now()`.
5. Hard constraint → loud failure. Soft constraint → silent degradation. The two regimes
   never overlap.
6. Consistency comes from the design system; richness comes from the scenes. Tokens stop
   a scene being ugly. They do not make it strong.

## Layout of the repo

```
packages/video/           the scene library — everything Remotion renders
  src/design/             L0 tokens: theme, motion profiles, fonts
  src/primitives/         L1, not exposed to the agent
  src/scenes/             L2, the catalog; one folder per capability
  src/runtime/            scene rendering and example playback
  src/catalog/            manifest generation, the four tools, validation
apps/component-studio/    internal evaluation harness (grid, filmstrip, matrix)
services/agents/          reserved for the Python ADK orchestration; not initialised
```

## Not yet built

Beat compiler, `packages/voice` and its TTS timepoints, Section runtime, Asset Resolver,
the remaining capabilities, the agents, the product Studio UI. See the build order in
`vox-studio-architecture-figee.md` §13, and ADR-0002 for the time pipeline.
