# Crew creativity and visual explanation — 2026-09-08

Local implementation following the user's instruction: the crew owns the story, Beat count,
scene selection and artistic decisions. The upstream creative limits are a target duration in
seconds and an optional generated-image ceiling. The next preview may generate at most five
images. This record describes code and deterministic tests, not a new paid production or proof
that a live model already produces an artistically accepted film.

## Changes

- Removed the NarrativeAgent's four/five-Beat recipe, its word-count instruction, and the
  Structurer's four/five-moment preference and one-image/one-scene substitution. The agents
  choose granularity from the explanation. Sentence boundaries, grounding and source references
  remain contract requirements.
- Strengthened narrative, art-direction and Scene Author instructions around concrete visual
  explanation, progression, coherent assets and purposeful word anchors, with room for reading
  pauses and deliberate stillness. No universal title-duration, cut-frequency or coverage quota
  was introduced.
- Passed the Brief, ResearchDossier, VisualBible and canonical published anchor/visual vocabulary
  to the Scene Author. Capability specifications remain restricted to the selected capabilities.
- Added EditorialReviewer to the live crew. A technically valid draft can return to the
  Structurer and Author once, then receive a final review before media production. Continued
  rejection pauses and persists the observations; resuming the checkpoint does not purchase
  another loop. PlanRepair retains its restricted authority and shares its existing technical
  repair budget across both drafts. Narrative Beats cannot be rewritten by this loop.
- Added `image_detail`: a large initially uncropped image, semantic-region reframing, replaceable
  annotations and annotation clearing. Reframing interpolates continuously even if interrupted
  by another anchor. The prepared/accepted image must actually contain the intended region.
- Added `process_steps`: a schematic ordered path, moving stage indicator, and active-stage
  explanation driven by anchors. No invented dates or physical measurements. An empty process
  has an explicit readable fallback.
- Redirected Timeline's undated-process advice to the now-published `process_steps` capability.
- Added optional `brief.durationSeconds` and `brief.maxGeneratedImages` to the production request
  and crew Brief. Old requests retain their shape. Production checks the image ceiling before
  creating a new job, after checking for reusable work; failed/uncertain jobs count. Request-bound
  grants and the recording ledger remain authoritative. The duration is an estimate passed to
  creative roles, not a hard guarantee of the final recording length or fabricated timestamps.
- Prepared [a fresh preview request](../../../deploy/crew/editorial-preview/request.json) with a
  50-second estimate and a five-image ceiling. Its historical milestone-2 counterpart is preserved.

The responsibility change is recorded in [ADR-0023](../../../docs/adr/0023-editorial-review-returns-to-the-structurer-before-production.md).
The capability procedure now documents its existing hand-written composition coverage guard
and the required Python fixture refresh after catalog changes.

## Verification

- Python crew suite with refreshed public fixtures: **587 passed, 1 skipped**. Additional planner
  assertions preserve the frozen historical contract except for the explicitly named editorial
  additions; historical fixtures themselves were not rewritten.
- Complete TypeScript unit suite: **1,132 passed**, with one stale-fixture failure. After refreshing
  the three changed contract recordings, the affected contract/freshness/template suites passed
  **24 tests**. No second complete unit run was needed for the fixture-only correction.
- All four workspace packages passed type checking; video type checking also passed after the
  empty-state and composition-coverage fixes.
- `pnpm catalog:check` passed for both generated projections. The live catalog now publishes ten
  capabilities. Python contract recordings were refreshed through `record:crew-fixtures`.
- New word-anchor/compiler/state tests: **4 passed**. They check actual compiled onsets, stage
  changes, clearing, restored framing, interrupted motion and surplus/no-op refusal.
- Actual renderer tests: **2 passed**, producing six local stills. The focused frame differs from
  the whole view; clearing and returning to whole restores the original frame exactly. Three
  process stages render different frames. These are synthetic test visuals, not generated media.
- Stress sweep of the two new capabilities: **96 assertions covered**. Initial result was 90
  passed and six empty-process failures. The readable fallback fixed those; all 24 assertions of
  the affected floor cases passed on rerun. No schema limit was reduced to hide the failure.
- Safe-area sweep for both additions plus the complete-matrix guard: **13 passed**.
- Biome passed on the **33 changed/new TypeScript and JSON files** checked. The repository-wide
  invocation remains red on **22 existing errors and 22 warnings**, including historical proof
  JSON and deployment scripts outside this change. These files were not reformatted or waived
  as a globally green gate. `git diff --check` passed.

The Windows sandbox blocked some esbuild subprocesses and pytest temporary-directory access;
the affected commands were rerun with escalation. No provider was invoked by those tests.

## Visual inspection and remaining evidence

Inspected the whole/detail image frames and the active process frame in
`runtime/editorial-capabilities/`. The whole image preserves its subject; the detailed framing
enlarges the prepared lower region, with a legible annotation; the process has a visible advancing
path and readable stage explanation. Stress and safe-area tests exercise the fallback and ceilings.

The deterministic editorial tests exercise mechanisms, comparisons and historical-story Briefs
to verify that no scene or motion quota is imposed. Their reviewer responses are scripted. They
do **not** measure the artistic quality of live model outputs across those subjects.

No new research, narration, image generation, production render or deployment was launched.
The old delivered Run, Take, quotas, grants and MP4 are untouched. Before producing the new
preview, consolidate the deployed crew and Production contracts, use a fresh Run with bounded
grants, inspect the generated images and watch the resulting film with its voice. A semantic-plan
review cannot replace that audiovisual acceptance. The separate voice-provider work remains
deferred. This change adds crew behavior and rendering capabilities, not the future Studio app.
