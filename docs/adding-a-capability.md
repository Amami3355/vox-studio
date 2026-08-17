# Adding a capability

**Status:** procedure · 2026-08-16 · verified against `stat_counter`, the fourth capability
**Scope:** what it costs to add a scene capability to the catalog, and what it costs to change
one that already exists. Written because the knowledge lived only in session handoffs.

The short version: **one folder of up to ten files, one line in `src/scenes/registry.ts`, then
`pnpm catalog`.** Copy `packages/video/src/scenes/_TemplateScene/`, which is a compiling stub
of exactly that shape. It is deliberately not registered, so it publishes nothing.

Two of the ten are optional — see the table below. Delete one only when the capability
genuinely has nothing to put in it; a stub file teaches the agent a rule that is not true.

## What you do not have to do

Everything downstream is derived from the `registry` array. There is no second place to
register a **capability**, and no `switch` on a capability id anywhere in the render path.

One thing in `Root.tsx` is hand-registered rather than derived, and it is deliberate: a
**control**, a scene instance a render test needs and the agent must never see. It is not a
capability and it is not an example. See "Controls" below before you reach for one.

Paths in the table below are relative to `packages/video/` unless they start with `apps/`.

| derived thing | where | how |
| --- | --- | --- |
| the manifest the agent reads | `src/catalog/build.ts:104` | `registry.map(buildCatalogEntry)` |
| the production contracts | `pnpm catalog` | rebuilt from the same manifest |
| every Remotion composition | `src/Root.tsx:134` | one per example, from the registry |
| the scene renderer | `src/runtime/SceneRenderer.tsx:44` | `requireCapability(id)`, no branch |
| the component studio grid | `apps/component-studio/src/App.tsx:62` | flattens the registry |
| the catalog checklist tests | `tests/catalog-contract.test.ts:91` | `describe.each` over the registry |

Capability names are hard-coded in three places, and none of them is on the render path:

- `packages/video/src/catalog/structural-examples.ts:20,44` — the whole-plan examples the
  manifest publishes. A new capability does not have to appear here, but this is where you
  put it if you want to show it inside a plan. See the examples constraint below.
- `packages/production/src/proof/northbridge.ts:82,100` and `harness.ts:869`,
  `assertions.ts:227` — the paid Northbridge proof. It describes one specific demo video,
  not the general path, and a new capability does not touch it.

## Renaming the copy

Do this before you change anything else, or you will be renaming around your own edits.

Copy `packages/video/src/scenes/_TemplateScene/` to
`packages/video/src/scenes/<YourScene>/`, then replace these tokens across the ten files
with your editor's rename-in-folder. Case matters, and there are about 58 of them, 25 in
`index.ts` alone.

| token | becomes | note |
| --- | --- | --- |
| `TemplateScene` | `<YourScene>` | the component and every `templateScene*` export |
| `templateScene` | `<yourScene>` | the exported const prefix |
| `template_scene` | `<your_capability_id>` | the agent-facing id, in `meta.ts` and every example's `component` |
| `example-template-` | `example-<your-slug>-` | the four example ids |
| `centeredGeometry` | your geometry name | `layouts.ts`, and its importer in `Component.tsx` |
| `REVEAL_STATEMENT_ACTION` | your action constant | `state.ts`, and its importer in `checks.ts` |

Only `template_scene` and `TemplateScene` are caught downstream, by
`tests/template-scene.test.ts`. Everything else survives a partial rename silently, which is
why this is a list and not a sentence.

Then run `npx biome check --write packages/video/src/scenes/<YourScene>` and search the
folder for `TODO`. Every one of them is a decision you still have to make. Registering a
capability with placeholder prose still in it fails `catalog-contract.test.ts`.

## The ten files

The template carries all ten, and `tests/template-scene.test.ts` fails if it ever stops
carrying one. A **live** folder carries eight to ten: the two marked optional below go when
the capability has nothing true to put in them.

| file | records | |
| --- | --- | --- |
| `meta.ts` | how the agent **chooses** the scene, before it reads the schema | |
| `schema.ts` | HARD constraints; the one source of truth for props, manifest and validation | |
| `constraints.ts` | SOFT constraints; the band that actually shapes what the agent writes | |
| `layouts.ts` | at least one layout with typed slots, plus the geometry the layout owns | |
| `actions.ts` | the closed action vocabulary — an empty object is a legitimate answer | |
| `state.ts` | the event reducer | optional — drop it when the action vocabulary is empty |
| `checks.ts` | referential checks the generic validator cannot express | optional — drop it when nothing in the vocabulary needs one |
| `Component.tsx` | the render, built only from L0/L1 primitives | |
| `examples.ts` | at least three, and they are normative | |
| `index.ts` | the assembly point — the whole surface the capability has | |

What the live folders actually carry today: `BarChartScene/` and `ImageContextScene/` ten
each, `QuoteScene/` and `StatCounterScene/` nine — each has a single reveal verb and nothing
in its vocabulary references the gated element, so a `QuoteScene/checks.ts` would state a rule
that is not true.

## The order to write them in

Write `meta.ts` and `schema.ts` first and get the wording approved before writing anything
else. Action descriptions and error strings are published to the agent; changing them later
means regenerating and re-reading every diff that quotes them.

1. **`meta.ts`** — `avoidWhen` entries must contain `→`. The contract enforces the arrow.
2. **`schema.ts`** — `.strict()`, generous ceilings, a `.describe()` on every field.
3. **`constraints.ts`** — at least one entry, each naming the degradation it buys.
4. **`layouts.ts`** — start with one layout. A second arrangement with its own rhythm is a
   different scene, not a second layout.
5. **`actions.ts`** — write `{}` unless a beat has actually asked for a verb. A vocabulary the
   component does not read produces a plan that validates, renders, and animates nothing.
   If it is `{}`, set `supportsEvents: false` and skip steps 6 and 7.
6. **`state.ts`** — store entrance frames inside the state, not off `resolveEvents`' `since`.
   `since` reports 0 for a field no event reached, which is indistinguishable from a reveal
   anchored at the top of the scene.
7. **`checks.ts`** — judge **written order, not frames**. ADR-0011 binds a scene's event list
   to the order it plays, so reading indices lets the check fail at `validate`, before a take
   exists and before anyone has paid to record one.
   Write this one **after** `Component.tsx`, or verify it against `Component.tsx` afterwards.
   A refusal is a claim about how the component is built: "the stamp is drawn inside the
   statement" is only true while the stamp is mounted inside the statement's gate. Move it to
   a sibling and the same code rejects plans that render perfectly, which teaches the agent a
   rule that is not true — worse under rule 2 than having no check at all.
8. **`Component.tsx`** — `Backdrop` → `CameraRig` → `SlotFrame` → the layout. No colour, easing
   or duration of its own; all of it comes from `design/`.
9. **`examples.ts`** — three minimum, "edge" and "empty" appearing in an example's title or
   note, time expressed symbolically. See the constraint below.
10. **`index.ts`** — assemble, then add the capability to `src/scenes/registry.ts`.

Then run `pnpm catalog`. It is not optional, and **the unit suite will not tell you that.**

`packages/production/tests/contracts.test.ts` reads `catalog.json` off disk and compares it
against the committed projections, so it catches a stale `CONTEXT.md` and does not catch a
stale registry: register a capability, skip `pnpm catalog`, and all 400-odd unit tests stay
green while the manifest the agent reads knows nothing about it.

`pnpm catalog:check` is the only gate that goes red. Run it.

### The examples constraint that surprises people

A scene example has no take. `syntheticBeats` gives it `words: []`, and a word anchor resolved
against that throws by design. So **an action declaring `deicticFields` cannot be illustrated
in `examples.ts` at all.** ADR-0012 says that is legal: illustrate it in a structural plan
example, or leave it out. `bar_chart` illustrates `highlightBar` at a boundary anchor;
`image_context` omits `emphasize` entirely. Neither is a defect.

Do not invent an example elsewhere to compensate. One was, and it was removed.

### Controls: the instances the agent never sees

The paragraph above bans a *compensating example*. It does not ban rendering a shape the
examples leave out. A **control** is how you do that.

An example is normative. The agent copies examples far more faithfully than it reads a
description, so every shape published in `examples.ts` is a shape the agent is being taught to
author. That makes the example set the wrong place to keep a regression guard: some bugs live
in shapes the agent should never write, and pinning one down by publishing it teaches the
defect in order to test it.

A control is a `SceneInstance` in `src/runtime/SceneControl.tsx`, registered as its own
`<Composition>` in `Root.tsx` and rendered only by a test. It plays through the same pipeline
an example does — `syntheticBeats`, `resolveEventTimings`, `SceneRenderer`, the capability's
own schema — so it exercises the real code path. What it is not is a member of
`capability.examples`, so it never reaches the manifest, `pnpm catalog`, or the safe-area sweep
that walks the examples. Its composition id carries a `control--` prefix
(`src/runtime/compositionIds.ts`) so the reference renders sort together in the studio, away
from the examples a reader is browsing. `src/runtime/BackdropControl.tsx` is the same idea one
level down: a reference frame, not a frame the catalog offers.

**The bar is high, and deliberately so.** A shape worth rendering is usually a shape worth
teaching, and that one belongs in `examples.ts`. A control is for the remainder: a frame that
must not regress and must not be copied. The test is one sentence — if you can say why the
agent *should* write this plan, you are holding an example, not a control.

`pnpm catalog:check` is what proves one has not leaked. It should stay green with no
`pnpm catalog` run, because a control changes no projection.

**ADR-0012 is not amended, and this is the rule's only home.** 0012 governs what the catalog's
*examples* are obliged to cover. A control is not an example and lives outside that set, so it
sits in a gap 0012 leaves rather than contradicting it. `SceneControl.tsx` points here instead
of restating this, under rule 1.

## The enforced checklist

**`packages/video/tests/catalog-contract.test.ts` is the checklist.** It runs over every
registered capability and fails a build rather than waiting to be remembered. Read it there.

It is deliberately not restated here. The first draft of this doc did restate it, in eight
bullets, and one of them was already wrong the day it was written — it said "edge" and
"empty" had to be in the example *notes*, when the test matches against title and note
together. That is rule 1 arriving on schedule: a second home for a fact drifts from the
first, and a checklist that has drifted is worse than one you have to open.

## Changing a capability that already exists

This is the harder path, not the easy one.

Editing `schema.ts`, `actions.ts`, `constraints.ts`, `meta.ts`, `layouts.ts`, `examples.ts` or
`checks.ts` changes a **published contract**. So does editing `CONTEXT.md`. Each one means:

1. `pnpm catalog` — both projections, or `contracts.test.ts` goes red.
2. The render suite's accepted key frames may move. `tests/render/image-context.test.ts` holds
   literal hashes, and a moved hash is not a test failure to fix — it is a picture a human has
   to look at and accept.

To obtain a new hash, add the entry with `'0'.repeat(32)` and run the one file:

```
npx vitest run --config vitest.render.config.ts packages/video/tests/render/image-context.test.ts
```

Vitest's diff prints the real hash. Prefer this over a scratch render script: the hash then
comes from the exact code path the assertion measures rather than from a parallel one.

## Gates

Run all five. Compare numbers, not exit codes.

```
pnpm catalog:check                     # both projections up to date
pnpm -r typecheck                      # clean, 4 packages
pnpm vitest run --no-file-parallelism   # unit tests, ~95 s
pnpm test:render                       # render tests, ~110-280 s
npx biome check .                      # 9 errors is the pre-existing baseline, not zero
```

`pnpm grid` opens the component studio, which is where a new capability's examples are
actually looked at. `pnpm studio` opens Remotion Studio.

## Traps

- **PowerShell eats the `--`.** Use `pnpm vitest run --no-file-parallelism`, never
  `pnpm test -- --no-file-parallelism`.
- **A scratch render script must live inside `packages/video/scripts/`.** Node resolves
  `@remotion/bundler` from the script's own location upward, so a script outside the package
  cannot import it. Point its output at `.scratch/`, which is gitignored.
- **`renderStill` is ~30x cheaper than `renderMedia`** — see the measured baseline in the
  header of `packages/video/scripts/measure-still-cost.mjs`.
- **Biome's baseline is 9 errors**, all pre-existing formatting. A gate run exits 1 purely
  because of this.
