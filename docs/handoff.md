# Handoff — 2026-08-11

State of play at the end of the scaffolding session. Replace this file when it goes
stale; it describes a moment, not the project.

**Next session opens with `/grill-with-docs`.** The open questions are at the bottom,
ranked. Read `CONTEXT.md` first for the vocabulary.

---

## Where we are

Commit `716f1c6` — steps 1–4 of the build order in `vox-studio-architecture-figee.md`
§13. The scene library renders, the catalog generates, the four tools work, and the
evaluation harness exists.

Deadline: **7 September 2026, 14:00 PDT**. Roughly four weeks.

### Verified, not assumed

`pnpm typecheck` clean · 60 tests pass · Biome clean on 58 files · `catalog:check` in
sync · `apps/component-studio` builds · five stills rendered through headless Remotion.

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
- **Catalog** `catalog.json` generated and committed; `searchScenes`, `getSceneSpec`,
  `validateScene`, `validateVideoPlan`.
- **Component Studio** grid · six-frame filmstrip · layout × motion-profile matrix.

### Not built

Beat compiler with forced alignment · Section runtime · Asset Resolver · the other 7–11
capabilities · the agents · the product Studio UI. `services/agents/` is a reserved
empty directory.

---

## Do not redo these

Settled deliberately, recorded in `docs/adr/0001-scaffold-decisions.md`. Reopen only
with a reason:

pnpm monorepo consumed as source, no build step · Python/ADK boundary reserved, JSON
interface only · Zod 4 with native `toJSONSchema` targeting `openapi-3.0` · manifest
committed, CI fails on drift · `searchScenes` returns the whole index, no filtering ·
events fold to value **plus change frame** · one Remotion composition per example ·
Biome · MIT · Vitest on the deterministic core only, no image snapshots yet.

Deviations from the frozen architecture live in
`docs/proposals/architecture-evolutions.md`. The frozen doc itself has not been edited.

---

## Known risks

**TTS with forced alignment is the biggest unknown in the whole chain.** §12 of the
frozen doc makes it an imperative constraint of the vertical slice, and nothing built so
far de-risks it. Google TTS does not return word-level timestamps in every configuration,
so a separate aligner is probably needed. This is the thing most likely to be discovered
too late.

**Polishing BarChartScene further is a trap.** §9.3 says most real problems only appear
at the second scene — slot collisions, brutal transitions, a character that jumps,
rhythmic uniformity. Reaching the continuity test matters more than a fourth chart
layout.

**`@google/adk` on npm (1.6.0) is unverified.** The ADK Python path is the documented
one. Confirm before betting the orchestration on the JS package.

**Remotion licence** — confirmed in the free tier (individual / under four people).

---

## Open questions for the next grilling, ranked

1. **TTS + forced alignment stack.** Which provider, which aligner, and does the beat
   compiler consume word timings or phrase timings? Everything about the compiler's
   input shape depends on this answer, and it is the riskiest brick.
2. **ImageContextScene, or the Section runtime first?** §13 orders capability then
   runtime; §9.3 argues for reaching two-scene continuity as early as possible. These
   pull in opposite directions and the doc does not resolve it.
3. **The beat plan contract.** Who produces beats, in what JSON shape, and how do they
   acquire timings? `VideoPlan` in `src/catalog/validate.ts` is currently a placeholder
   with just `beats[]` and `sections[]`.
4. **Persistent elements.** The `SectionTimeline` is a generated output — generated from
   what input, by what rule? Slot conflict resolution (`SLOT_RELOCATED`,
   `PERSISTENT_ELEMENT_HIDDEN`) is specified as behaviour but not as an algorithm.
5. **Asset Resolver minimum for the demo.** Placeholders unblock the preview; what is the
   smallest real resolution chain worth building before 7 September?
6. **The vertical slice script.** 20–30 seconds of actual content — which subject, which
   four beats, what does the voice-over say? This is a content decision, and the slice
   cannot be built without it.
7. **Aggregation for rate units.** Summing percentages into "Others" is meaningless; the
   frozen doc's rule assumes counts. See the proposals file.
8. **Second theme, and when.** The `Theme` type supports it; only one exists. Adding it
   before the second capability means arguing about colour instead of composition.
9. **Hosting.** The submission requires a public deployed URL. Cloud Run? Where does the
   render happen — Lambda, a worker, or client-side preview only?
10. **Prop migration on `replaceComponent`.** Native to the architecture, real to
    implement. Not needed until the Studio UI exists.
