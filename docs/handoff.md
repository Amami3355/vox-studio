# Handoff — 2026-08-12 (ImageContextScene increment)

State of play at the end of the design session that followed the scaffolding session.
Replace this file when it goes stale; it describes a moment, not the project.

**The time pipeline is decided and written down in `docs/adr/0002-the-time-pipeline.md`.
Do not reopen it.** The remaining open questions are at the bottom, ranked. Read
`CONTEXT.md` first for the vocabulary.

---

## Where we are

Steps 1–6 of the build order in `vox-studio-architecture-figee.md` §13. The scene library
has two materially different SceneCapabilities, the minimal offline Asset Resolver path
exists, the catalog generates, the four tools work, the evaluation harness builds — and
a plan now **compiles and plays**.

ADR-0002 is applied to the code: `Beat`/`TimedBeat` exist, `spansBeats` is required at
both levels, the beat partition is checked over scenes and over sections, and a scene may
not end mid-sentence. ADR-0003 is applied too — the slot conflict ladder is in
`src/compile/conflict.ts` and its outcomes are visible in the render suite.

What ADR-0002 decided and nothing has built is **`packages/voice`**. Beat timings come
from a fixture, so the compiler has never met a real timepoint. That is the next move.

Deadline: **7 September 2026, 14:00 PDT**.

### Verified, not assumed

`pnpm typecheck` clean · 155 tests pass in ~1s · Biome clean on 85 files · `catalog:check`
in sync · `apps/component-studio` builds · 6 render tests pass through headless Remotion.
The compiled section was rendered to stills and looked at, not only hashed.

**There are two suites now.** `pnpm test` is the deterministic core and must stay fast
enough to run on every save; `pnpm test:render` bundles the project and drives headless
Chrome. What the render suite asserts as a *relation* — three asset states render,
placeholder and failed degrade identically — holds on any machine. The literal key-frame
hashes are a separate test, and that one is supposed to fail when the design changes on
purpose.

```bash
pnpm install
pnpm catalog          # regenerate the manifest — required in any commit touching scenes
pnpm studio           # Remotion Studio, one composition per example
pnpm grid             # Component Studio, localhost:5273
pnpm typecheck && pnpm test && pnpm check && pnpm catalog:check
pnpm test:render      # separately: minutes, and a browser
```

### Built

- **L0** `editorial-cold` (Ember on Slate), six motion profiles, Archivo/Inter/JetBrains.
- **L1** `SlotFrame`, `CameraRig`, `AnimatedText`, `Reveal`, `BarGroup`, `Callout`,
  `EmptyState`, `Backdrop`.
- **L2** `BarChartScene` — the pattern every other capability copies. Eight contract
  files, three layouts, five examples including the 20-entry, empty and negative cases.
- **L2** `ImageContextScene` — one `splitLeft` layout, three examples, strict semantic
  `AssetRequirement`, and deterministic ready/placeholder/failed rendering.
- **Minimal Asset Resolver** — explicit project-scoped identity cache, a
  repository-controlled and verified local library, deterministic placeholder fallback,
  and resolved assets travelling on a runtime channel rather than written into semantic
  props. Resolution is **identity first**: a requirement carrying an `identityKey` is
  answered by that key alone, which is what makes the result independent of the order
  requirements arrive in. Subject matching is the keyless path.
- **Catalog** `catalog.json` generated and committed; `searchScenes`, `getSceneSpec`,
  `validateScene`, `validateVideoPlan`.
- **Component Studio** grid · six-frame filmstrip · layout × motion-profile matrix.
- **The beat contract** of ADR-0002: `Beat`/`TimedBeat`/`FrameBeat`, required
  `spansBeats`, the partition checked over scenes and sections, the sentence rule,
  and placement validation for persistent elements.
- **The minimal compiler** (`src/compile/`) — `compile({ plan, beats })` returns a
  compiled document or a report, never both. Milliseconds to frames by converting
  *boundaries*; anchors to frames; ADR-0003's ladder; assets resolved onto the runtime
  channel; layout and motion profile decided. `document` is `null` exactly when `ok` is
  false, so a plan that failed cannot be rendered.
- **The Section runtime** (`runtime/CompiledVideo.tsx`) — plays a whole document,
  persistent elements included, and decides nothing. The `compiled-document` composition
  takes a document as input props, so a section can be watched in Studio.

### Not built

`packages/voice` and real TTS timepoints · the Asset Resolver beyond identity
cache/local library/placeholder · the other 6–10 capabilities · the agents · the product
Studio UI. `services/agents/` is a reserved empty directory.

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

**Slot conflicts** (`docs/adr/0003-slot-conflict-resolution.md`): the compiler resolves an
overlap only among declared alternatives — a composition the scene supports, else a slot
the element already uses in that section — and otherwise hides the element and warns · the
scene yields before the element moves, because a relocated character is §9.3's "character
that jumps" · the **scene**, not the frame, is the unit of resolution · `safeArea` is how a
chosen composition reaches the component · slot geometry is one table in
`core/slots.ts`. `ImageContextScene` hides, by the rule and not by exception.

**Scope and sequencing**, decided in the same session but too reversible to earn an ADR:

- ImageContextScene's deliberately narrow increment is complete: one layout, one
  placeholder treatment, no event vocabulary. The Section runtime and minimal compiler
  are built; run the continuity test on real voice-over before adding another layout or
  capability.
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

**TTS is the top risk again, and now it is the only thing between here and a video.**
ADR-0002 removed the research problem; what remains is an API call and a fold, unwritten
and unverified against the real API. The compiler consumes `TimedBeat[]` and does not
care where they come from, so the seam is clean — but every timing it has ever seen came
from a fixture. The first thing to confirm empirically: **does a trailing `<mark>` at the
end of the SSML reliably return a timepoint at the end of speech?** The whole `toMs` of
the last beat rests on it, and the fallback (decoding `audioContent` for a duration) is
uglier.

**Polishing either isolated capability further is a trap.** §9.3's real problems appear
only in sequence — slot collisions, brutal transitions, a character that jumps, rhythmic
uniformity. Slot collisions are now answered (ADR-0003) and one section demonstrably
plays; the rest of that list is still unmet, and reaching the continuity test on real
voice-over is the largest single risk to the deadline.

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
2. **The four beat texts of the slice.** ~75 words in English, four beats, housing/rent
   per §12. A content decision; the slice cannot be built without it. Note that beat
   granularity is now also a *timing* decision, per open question 1.
3. **Aggregation for rate units.** Summing percentages into "Others" is meaningless; the
   frozen doc's rule assumes counts. See the proposals file. Blocked on a fact, not a
   decision — render both variants and look.
4. **Second theme, and when.** The `Theme` type supports it; only one exists. Adding it
   before the second capability means arguing about colour instead of composition.
5. **Prop migration on `replaceComponent`.** Native to the architecture, real to
   implement. Not needed until the Studio UI exists.

**Closed:** slot conflict resolution, formerly ranked 2, is decided in
`docs/adr/0003-slot-conflict-resolution.md`.

## What this session got wrong, so it is not repeated

The grilling ran two rounds against the frozen architecture, the previous handoff,
ADR-0001 and the code — and never opened `Vox Studio — Product Requirements Document.md`,
which is 1978 lines and contradicted a decision the session had already recorded. A
review caught it. **The PRD and `AGENTS.md` are at the repository root, not under
`docs/`.** Glob the root before assuming you have read the design documents.
