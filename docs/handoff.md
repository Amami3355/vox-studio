# Handoff — 2026-08-12 (ImageContextScene increment)

State of play at the end of the design session that followed the scaffolding session.
Replace this file when it goes stale; it describes a moment, not the project.

**The time pipeline is decided and written down in `docs/adr/0002-the-time-pipeline.md`.
Do not reopen it.** The remaining open questions are at the bottom, ranked. Read
`CONTEXT.md` first for the vocabulary.

---

## Where we are

Steps 1–5 of the build order in `vox-studio-architecture-figee.md` §13. The scene library
now has two materially different SceneCapabilities, the minimal offline Asset Resolver
path exists, the catalog generates, the four tools work, and the evaluation harness
builds. The next move is step 6: the generic Section runtime and minimal compiler.

ADR-0002 has since been **applied to the existing code**: `Beat`/`TimedBeat` exist,
`spansBeats` is required at both levels, the beat partition is checked over scenes and
over sections, and a scene may no longer end mid-sentence. What ADR-0002 decided but
nothing has yet built is the part that needs new packages — `packages/voice` and
`packages/video/src/compile/`.

Deadline: **7 September 2026, 14:00 PDT**. Roughly four weeks.

### Verified, not assumed

`pnpm typecheck` clean · 128 tests pass · Biome clean on 73 files · `catalog:check` in
sync · `apps/component-studio` builds · stills render through headless Remotion.
`ImageContextScene` key frames are hash-locked for ready, placeholder, failed, empty and
long-copy inputs; placeholder and failed deliberately share the same rendered hash.

```bash
pnpm install
pnpm catalog          # regenerate the manifest — required in any commit touching scenes
pnpm studio           # Remotion Studio, one composition per example
pnpm grid             # Component Studio, localhost:5273
pnpm typecheck && pnpm test && pnpm check && pnpm catalog:check
```

### Built

- **L0** `editorial-cold` (Ember on Slate), six motion profiles, Archivo/Inter/JetBrains.
- **L1** `SlotFrame`, `CameraRig`, `AnimatedText`, `Reveal`, `BarGroup`, `Callout`,
  `EmptyState`, `Backdrop`.
- **L2** `BarChartScene` — the pattern every other capability copies. Eight contract
  files, three layouts, five examples including the 20-entry, empty and negative cases.
- **L2** `ImageContextScene` — one `splitLeft` layout, three examples, strict semantic
  `AssetRequirement`, and deterministic ready/placeholder/failed rendering.
- **Minimal Asset Resolver** — explicit project-scoped identity cache, injectable and
  verified local library, deterministic placeholder fallback, and resolved assets keyed
  by SceneInstance id plus requirement field rather than written into semantic props.
- **Catalog** `catalog.json` generated and committed; `searchScenes`, `getSceneSpec`,
  `validateScene`, `validateVideoPlan`.
- **Component Studio** grid · six-frame filmstrip · layout × motion-profile matrix.
- **The beat contract** of ADR-0002: `Beat`/`TimedBeat`/`FrameBeat`, required
  `spansBeats`, the partition checked over scenes and sections, the sentence rule,
  and placement validation for persistent elements.

### Not built

Beat compiler · `packages/voice` · Section runtime · compiler · the Asset Resolver beyond
identity cache/local library/placeholder · the other 6–10 capabilities · the agents ·
the product Studio UI. `services/agents/` is a reserved empty directory.

---

## Do not redo these

Settled deliberately. Reopen only with a reason.

**Scaffold** (`docs/adr/0001-scaffold-decisions.md`): pnpm monorepo consumed as source,
no build step · Python/ADK boundary reserved, JSON interface only · Zod 4 with native
`toJSONSchema` targeting `openapi-3.0` · manifest committed, CI fails on drift ·
`searchScenes` returns the whole index, no filtering · events fold to value **plus change
frame** · one Remotion composition per example · Biome · MIT · Vitest on the
deterministic core only, no image snapshots yet.

**The time pipeline** (`docs/adr/0002-the-time-pipeline.md`): SSML marks, no forced
aligner · a beat carries its voice-over text verbatim, and there is no separate script ·
`Beat` and `TimedBeat` are distinct types, seam in milliseconds · sections are authored
and persistent elements declare placements · `spansBeats` required, contiguous, exclusive
and total at both levels · compiler in `packages/video/src/compile/`, TTS in
`packages/voice`, which returns the audio as well as the timings.

**Scope and sequencing**, decided in the same session but too reversible to earn an ADR:

- ImageContextScene's deliberately narrow increment is complete: one layout, one
  placeholder treatment, no event vocabulary. Build the Section runtime and minimal
  compiler now, then run the continuity test before adding another layout or capability.
- Vertical slice: §12's own example, housing/rent, **in English**.
- Asset Resolver ships with §5.4 links 1 and 3 only — identity cache and local library —
  plus the placeholder path. No Gemini generation, no licensed search, no cutout or
  duotone processing. `identityKey` is what the slice must demonstrate, and a local
  folder demonstrates it as well as a generator.
- Hosting: Cloud Run for the app, `@remotion/player` for the live demo, hero MP4
  pre-rendered offline. No server-side render, no Remotion Lambda, no second cloud.

Deviations from the frozen architecture live in
`docs/proposals/architecture-evolutions.md`. The frozen doc itself has not been edited.
The PRD **has** been edited: eight places where it modelled a separate `Script`, plus the
workflow step that named forced alignment.

---

## Known risks

**TTS is no longer the top risk.** ADR-0002 replaced forced alignment with SSML
timepoints, which removed the research problem. What remains is an API call and a fold —
but it is still unwritten and still unverified against the real API. The first thing to
confirm empirically: **does a trailing `<mark>` at the end of the SSML reliably return a
timepoint at the end of speech?** The whole `toMs` of the last beat rests on it, and the
fallback (decoding `audioContent` for a duration) is uglier.

**Polishing either isolated capability further is a trap.** The second capability now
exists. §9.3 says the remaining real problems appear only in sequence — slot collisions,
brutal transitions, a character that jumps, rhythmic uniformity. Reaching the continuity
test is now the largest single risk to the deadline.

**`@google/adk` on npm (1.6.0) is unverified.** The ADK Python path is the documented
one. Confirm before betting the orchestration on the JS package. Lower stakes than it
was: ADR-0002 keeps the compiler and the TTS in TypeScript, so ADK is only needed at
step 10.

**Remotion licence** — confirmed in the free tier (individual / under four people).

---

## Open questions, ranked

1. **Does the compiler snap arithmetic anchors to the nearest word onset?** `b4.mid` and
   `b4.start+short` resolve arithmetically and land on no particular word. A forced
   aligner would not fix this — `.mid` names a midpoint, not a word — so the only fix is
   a snapping rule in the compiler, fed by one mark per word. Marks make word timings
   cheap and exact, so the option is open; the rule is not written anywhere. Until it is
   decided, precision at the word is bought by **splitting beats**, not by moving anchors.
2. **Slot conflict resolution.** `SLOT_RELOCATED` and `PERSISTENT_ELEMENT_HIDDEN` are
   specified as behaviour, never as an algorithm. Now answerable, since ADR-0002 fixed
   placements as the input: when a persistent element sits in `cornerBR` and a scene
   occupies `cornerBR`, which one yields, and by what rule?
3. **The four beat texts of the slice.** ~75 words in English, four beats, housing/rent
   per §12. A content decision; the slice cannot be built without it. Note that beat
   granularity is now also a *timing* decision, per open question 1.
4. **Aggregation for rate units.** Summing percentages into "Others" is meaningless; the
   frozen doc's rule assumes counts. See the proposals file. Blocked on a fact, not a
   decision — render both variants and look.
5. **Second theme, and when.** The `Theme` type supports it; only one exists. Adding it
   before the second capability means arguing about colour instead of composition.
6. **Prop migration on `replaceComponent`.** Native to the architecture, real to
   implement. Not needed until the Studio UI exists.

## What this session got wrong, so it is not repeated

The grilling ran two rounds against the frozen architecture, the previous handoff,
ADR-0001 and the code — and never opened `Vox Studio — Product Requirements Document.md`,
which is 1978 lines and contradicted a decision the session had already recorded. A
review caught it. **The PRD and `AGENTS.md` are at the repository root, not under
`docs/`.** Glob the root before assuming you have read the design documents.
