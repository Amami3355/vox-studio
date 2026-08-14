# The render surface — zones of intervention

**Status:** map · 2026-08-14 · verified against `b5cc56e`
**Scope:** everything that decides what a viewer sees, from tokens to composed frame, named as
*zones you can intervene in* rather than as a file listing. Written to open the design work of
ticket 22 (`raise the design system to system-premium`).

A file listing says where code is. A zone says **what one edit there reaches**, and that is the
only question a design session actually asks. The zones below are ordered by blast radius: Z1
changes every frame in the catalog, Z6 changes one capability, Z7 is not the render at all but
decides the box the render is drawn into.

The premium bar these zones are being raised against is not in ticket 22. It is
`docs/measurement-gate.md` §Premium: **Bloomberg Originals / The Economist / FT for composition,
Vox and Johnny Harris for pace only.** Pace never becomes a capability.

## The zones at a glance

| # | zone | seam | reaches |
| --- | --- | --- | --- |
| Z1 | Tokens | the `Theme` object and `motionProfiles` | every frame, every capability |
| Z2 | Type & entrance | `AnimatedText` / `SceneTitle` / `Eyebrow` / `useEntrance` | every word drawn |
| Z3 | Frame physics | `SlotFrame`, `CameraRig`, `Backdrop` | margin, density, camera, ground |
| Z4 | Data marks | `BarGroup` | every chart |
| Z5 | Editorial marks | `Callout`, `EmptyState`, `Reveal` | annotation and degradation |
| Z6 | Capability composition | the two `Component.tsx` + `layouts.ts` pairs | one capability each |
| Z7 | Upstream deciders | `compile/`, `core/slots.ts` | which box a scene gets, and when |
| Z8 | The judging loop | `pnpm grid`, `.scratch/still-cost/`, `BackdropControl` | nothing — it is where you look |

---

## Z1 — Tokens

`design/theme.ts` (153) · `design/motion.ts` (119) · `design/fonts.ts` (40)

**Owns.** Every colour, size, spacing step, radius, spring, stagger and camera amount in the
system. `theme.ts` states the rule in its header: nothing anywhere may resolve to a value not
defined here.

**Interface.** One `Theme` object and six named `motionProfiles`. That is the whole surface a
component learns. It is the deepest zone in the package — three files behind which sits the
appearance of every frame.

**What is actually in it today.**

- **One theme: `editorial-cold`.** `themes` has a single entry. `ThemeId` is therefore a
  one-member union, and `defaultTheme` is the only theme any render has ever used.
- **A 7-step type scale** `[28, 36, 48, 64, 88, 120, 168]` and an 8-step space scale
  `[0, 8, 16, 24, 40, 64, 96, 144]`.
- **A 12-column grid with a 96px margin** — `grid.columns` is declared and, as of `b5cc56e`,
  **nothing reads it**. `grid.margin` is read by `SlotFrame`; `grid.gutter` and `grid.columns`
  are not read by anything in `src/`. The system has a grid on paper and flexbox in fact.
- **Six motion profiles**, each a `{camera, entrance, spring, stagger, intent}`. `intent` is
  prose for the agent, not behaviour.
- **A warm-to-cold `dataSeries` ramp**, sampled by `rampColor` rather than indexed, so item 7
  never repeats item 1.

**Cost of intervening.** Lowest in the package and highest leverage: a token edit is a few
numbers and re-renders the entire catalog. This is the zone to try first and the zone where a
wrong value is least visible in review, because nothing local looks wrong.

**What it cannot fix.** Nothing here decides *where* anything sits. Composition is Z6 and Z7.

## Z2 — Type and entrance

`primitives/AnimatedText.tsx` (132) · `primitives/useEntrance.ts` (33)

**Owns.** How type is set and how it arrives. `AnimatedText` is a clipped rise, never a bare
fade — the clip is what makes it read as typography being set. `SceneTitle` and `Eyebrow` are
the two named roles built on it.

**The composition rule hidden here.** `titleStep(length)` is a hard ladder: ≤40 chars → step 5,
≤70 → step 4, else step 3. It reads *string length only*. Its own comment concedes this is the
whole story on the full canvas and half of it in a composed frame, which is why `SceneTitle`
accepts a `step` override that `BarChartScene` passes. A typographic hierarchy decided by
`String.length` is a candidate the premium anchors would not recognise.

**Cost of intervening.** Cheap. Two files, no geometry, every scene picks it up.

## Z3 — Frame physics

`primitives/SlotFrame.tsx` (99) · `primitives/CameraRig.tsx` (128) · `primitives/Backdrop.tsx` (24)

**Owns.** The margin, the density scale, the camera, and the ground everything sits on. These
three are the *physics* of a frame and they are deliberately not negotiable by a scene.

- **`SlotFrame`** is the only place a scene touches its safe area. It converts safe-area
  percentages into padding, adds the grid margin and the camera allowance, and publishes two
  things downward: a `FrameBox` (the shape it got) and a `density` factor. A scene may decline
  the *design* margin (`gridMargin={false}` — only `image_context` does) but never the camera
  allowance.
- **`density`** is `sqrt(areaRatio)` clamped at `DENSITY_FLOOR = 0.72`. Type and spacing scale
  by it. That is the whole degradation story for a squeezed scene.
- **`CameraRig`** is the only component allowed to write a transform, and it publishes its
  worst-case bounds so `SlotFrame` can inflate padding to survive them. The usable area is
  constant for the whole shot — no reflow mid-scene.
- **`Backdrop`** is one flat fill plus one radial lift. It is the entire atmosphere of the
  system, and it is deterministic on purpose (the render tests measure against it).

**Cost of intervening.** Medium. The arithmetic here is load-bearing for the render contract
tests, and `Backdrop` is the control frame those tests compare to — change it and
`tests/render/safe-area.test.ts` must be re-baselined.

## Z4 — Data marks

`primitives/Bar.tsx` (267)

The largest single design object in the package, and the one a data-editorial reference judges
hardest. Not exposed to the agent; `BarChartScene` composes it.

**Owns.** Both orientations, the axis, the reveal spring per bar, the highlight, the recede,
the value labels and the category labels.

**The decisions living as constants here.**

| constant | value | what it decides |
| --- | --- | --- |
| `RECEDE` | `0.62` | how far a non-highlighted bar sinks toward the background |
| `HIGHLIGHT_FRAMES` | `14` | how long the desaturation takes (~0.47 s) |
| `AXIS_HEADROOM` | `0.14` | clearance the axis gives the extreme value label |
| `maxWidth` | `200` | hard cap on a vertical column's width |

**Two published behaviours worth knowing before editing.** With a highlight active, every other
bar collapses onto **one** cold neutral rather than a dimmed version of its own hue — five
differently-muted hues read as mud. And category labels are uppercase, `tracking.wide`, truncated
at 14 chars vertical / 22 horizontal.

**Cost of intervening.** Medium-high. One file, but it is half of what the human evaluator was
looking at, and the render contract tests measure its frames.

## Z5 — Editorial marks

`primitives/Callout.tsx` (75) · `primitives/EmptyState.tsx` (44) · `primitives/Reveal.tsx` (43)

**Owns.** The annotation, the honest empty frame, and the generic clipped wipe.

`Callout` draws a rule and not an arrow — at documentary scale an arrowhead reads as a diagram.
It is capped at `maxWidth: 520`. `EmptyState` degrades a no-data scene into a typographic frame,
never a black screen.

**Cost of intervening.** Cheap. Small, well-isolated, and `Callout` is currently the weakest-used
element in the system — see the finding below.

## Z6 — Capability composition

`scenes/BarChartScene/` (Component 218 + layouts 80) · `scenes/ImageContextScene/` (Component 190
+ layouts 51)

**Two capabilities. This is the load-bearing fact of any breadth judgement**, and
`docs/measurement-gate.md` already says so: with two, measure 3 has almost nothing to be wrong
about.

**Owns.** How the frame is divided. This is where composition actually happens, and it is the
zone the premium anchors speak to most directly.

| decision | where | value |
| --- | --- | --- |
| chart / annotation split | `BarChartScene/Component.tsx:143-153` | `flex 62` / `flex 34` |
| image / copy split | `ImageContextScene/layouts.ts:33-36` | `7fr / 5fr`, never 1:1 |
| portrait switch | both `layouts.ts` | aspect `< 1.2` |
| categories a composed box holds | `BarChartScene/layouts.ts:72` | `chartShare 0.55`, floor 3 |

**The layouts.** `bar_chart` publishes three (`standard`, `horizontal`, `withCallout`);
`image_context` publishes one (`splitLeft`), on purpose — its own header argues that a second
variant would be paid for out of the compiler.

**A composition is not a layout.** The agent picks a layout; the compiler picks a composition;
the scene is told only the *shape* of the box it got (`useFrameBox`), never the slot. ADR-0003
decision 4. Do not collapse these two lists.

**Cost of intervening.** Highest in the package. Each scene has `schema.ts`, `constraints.ts`,
`examples.ts`, `checks.ts` and catalog projections that must stay in step, and `pnpm catalog:check`
proves the committed projection has not drifted.

## Z7 — Upstream deciders (not the render)

`compile/` (index 327, timings 356, persistent 221, conflict 107, document 189) · `core/slots.ts`
(52) · `core/compiler-checks.ts` (218)

Not a zone you redesign for looks, but **a composition problem can originate here and be
uneditable from Z6**. `core/slots.ts` is the single table of slot rectangles; `compile/timings.ts`
decides at which frame every event lands. A scene cannot move an event, and it cannot decline the
box it was handed.

The trap to name early: if a frame looks wrong and the component is drawing exactly what it was
told, the defect is here.

## Z8 — Where a change is judged

- **`pnpm grid`** — Component Studio (`apps/component-studio`): every capability × layout ×
  motion profile side by side, plus a six-frame filmstrip. `docs/measurement-gate.md` names it as
  where measure 4 is judged. This is the design iteration loop.
- **`pnpm --filter @vox/video measure:stills`** — a fourteen-frame contact sheet of the real paid
  run in **11.1–11.4 s**, against 333.7 s for the video. Output in `.scratch/still-cost/`.
- **`pnpm studio`** — Remotion Studio; accepts a real Run's `document.json` via `--props`.
- **`runtime/BackdropControl.tsx`** — the control frame the render contract tests measure against.

**Not a judge:** an agent. Ticket 25's corrected objective binds here — a machine visual check is
for **coherence** (did the renderer execute what the document decided) and never for judging
design, which stays with the user.

---

## What the map found: the first named offending element

Ticket 22 has never had one. This is a candidate, verified against the shipped paid run
(`2026-08-14T012547-734Z-northbridge-night-bus`), not an impression.

**The `withCallout` layout reserves 34% of the canvas for the entire scene, and fills it in the
last 34 frames.**

`BarChartScene/Component.tsx:143-164` renders the annotation column unconditionally — `flex: 34`,
always mounted — and puts a `Callout` inside it only when an `annotate` event has already fired.
The compiled document places that event at the very end of both scenes that use the layout:

| scene | layout | scene length | `annotate` at | column empty for |
| --- | --- | --- | --- | --- |
| `weekday-boardings` | `withCallout` | 833 frames (27.8 s) | frame 799 | **96% of the scene** |
| `pilot-budget` | `withCallout` | 728 frames (24.3 s) | frame 694 | **95% of the scene** |

The chart is squeezed into 62% of the width for the full duration to make room for something that
appears for roughly one second, with a spring entrance that has barely resolved before the scene
cuts. Frames `01075` and `01436` in `.scratch/still-cost/` show it: at 1436, the frame the
annotation is scheduled on, the right third is still empty.

**Both zones are implicated, which is why the map was worth building first.** Z6 reserves the
column unconditionally; Z7 decides when the event lands. A fix in either alone is a partial fix,
and the choice between them is a design decision, not a repair:

- **Z6 reading** — the column should not be reserved before it is occupied, and the chart should
  reflow when it is. Cost: the reflow is motion the system currently never performs.
- **Z7 reading** — an annotation anchored 96% into a 28-second scene is a timing defect, and the
  layout is innocent. Cost: `compile/timings.ts` derives that frame from a word anchor in the
  narration, so the annotation would have to detach from the word it names.

Neither is chosen here.

## What this map deliberately does not do

It does not judge whether any of the above *looks* good. That is the user's call, made in
Component Studio, against the §Premium anchors. The map's job is to say where an intervention
would land and what it would reach.
