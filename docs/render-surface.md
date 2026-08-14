# The render surface — zones of intervention

**Status:** map · 2026-08-15 · verified against `229700c` and the value-axis work on top of it
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

- **Two themes as of `3d039df`: `editorial-paper` (default) and `editorial-cold`.** Until that
  commit there was one, which made the theme seam hypothetical — every call site took the
  default and nothing established that a second palette could reach a frame. It can: no
  primitive or scene changed, because there are no hardcoded colours outside `design/theme.ts`.
  A light ground costs contrast that a dark one gets free, so `editorial-paper` deepens the warm
  accent — `#FF5A1F` is 6.20:1 on slate and 2.60:1 on paper.
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

**The composition rule that lives here.** `titleStep(length)` is a hard ladder: ≤40 chars → step
5, ≤70 → step 4, else step 3, and it reads *string length only*. Since `f60a6e1` that ladder is a
**ceiling** rather than the answer: `useTitleStep` (`primitives/titleFit.ts`) measures the widest
word and steps down the scale until it fits. Length decides how loud a headline should be, the
box decides how loud it may be, and the box wins.

**Three degradations, in order, and nothing below them cuts.** Since `c328a6d` this is automatic
rather than wired per scene:

1. **Shrink** — display type steps down the scale until its widest word fits its column.
2. **Break** — `AnimatedText` sets `overflowWrap: break-word`, so anything still too wide breaks
   across lines. Body type has no fit and goes straight here, which is what a caption should do.
3. **Never clip** — the `overflow: hidden` that produces the clipped rise can no longer cut a
   string, because nothing reaches it.

**The seam that makes it automatic** is `ColumnProvider` / `useColumnWidth`
(`primitives/Column.tsx`), which publishes a column width down the tree exactly as `SlotFrame`
publishes the frame box and the density. A layout declares its columns once; `SceneTitle` fits
itself. The default is the frame box, so a header spanning the canvas declares nothing — this is
why `bar_chart` has no provider and `image_context` has one around its copy column. The `maxStep`
prop is a ceiling on top of the fit, never a replacement for it.

**Cost of intervening.** Cheap. Four files, no geometry, every scene picks it up.
`@remotion/layout-utils` entered the package here, for `measureText`; Z4 is now its second
caller, and `d3-scale` is the only other third-party dependency in the render surface.

**The trap worth knowing.** `overflowWrap` alone does not save a **flex item**: its minimum size
defaults to min-content, which for an unbreakable word is the whole word, so it overflows before
the wrap can act. `minWidth: 0` is the other half. The asset plate subject needed both.

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

`primitives/Bar.tsx` (264) · `primitives/Gridlines.tsx` (120) · `core/scale.ts` (90)

The largest single design object in the package, and the one a data-editorial reference judges
hardest. Not exposed to the agent; `BarChartScene` composes it.

**Owns.** Both orientations, the axis, the reveal spring per bar, the highlight, the recede,
the value labels and the category labels.

**`Bar.tsx` no longer decides what the top of the plot is.** `core/scale.ts` does, through one
function, `valueAxis(values)`, which returns the domain, where zero sits, and the round values
a gridline can use. It is arithmetic and testable without a browser (`tests/scale.test.ts`),
which is the same split `titleFit` made in Z2 for the same reason.

**The decisions living as constants here.**

| constant | where | value | what it decides |
| --- | --- | --- | --- |
| `RECEDE` | `Bar.tsx` | `0.62` | how far a non-highlighted bar sinks toward the background |
| `HIGHLIGHT_FRAMES` | `Bar.tsx` | `14` | how long the desaturation takes (~0.47 s) |
| `maxWidth` | `Bar.tsx` | `200` | hard cap on a vertical column's width |
| `AXIS_HEADROOM` | `core/scale.ts` | `0.14` | clearance the axis gives the extreme value label |
| `AXIS_TICKS` | `core/scale.ts` | `4` | how many gridlines a shot can carry |
| `AXIS_ROUNDING` | `core/scale.ts` | `10` | how finely the domain rounds — **not** the same number |
| `GRID_RECEDE` | `Gridlines.tsx` | `0.86` | how far a gridline sits behind the bars |

`AXIS_TICKS` and `AXIS_ROUNDING` are deliberately different, and that is the one thing to read
before touching either. Round the domain as coarsely as the gridlines and a series topping out
at 5 743 pushes the plot to 8 000, costing the tallest bar a quarter of its height; round it
finely and the top lands on 7 000 with the gridlines still sparse.

**Three published behaviours worth knowing before editing.** With a highlight active, every other
bar collapses onto **one** cold neutral rather than a dimmed version of its own hue — five
differently-muted hues read as mud. Category labels are uppercase, `tracking.wide`, truncated
at 14 chars vertical / 22 horizontal. And in the vertical orientation **only the highlighted bar
carries its number** — the axis states the rest, and printing both is the same fact twice.

**Gridlines are vertical-only, by decision.** A horizontal bar chart in this system is a ranking:
the value sits at the end of its own bar where the eye already is, and an axis underneath asks
the reader to travel for a number they were just handed. The losing alternative — both
orientations, for consistency — is argued in `Gridlines.tsx`'s header.

**Cost of intervening.** Medium-high. Three files, and it is half of what the human evaluator
was looking at, and the render contract tests measure its frames.

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
told, the defect is here — or one level further up, in the plan, which is not ours.

**Worked example, 2026-08-15.** `pilot-budget` draws only one of its two bars for the first half
of its scene. Nothing is broken: the plan writes `revealAll` at `b6.mid`, the compiler resolves
that to frame 364 of 728, and the renderer obeys. The agent chose it. Read the anchors in
`inputs/plans/*.json` before reading any timing as a defect — three of the five bar scenes in this
run reveal at `mid`.

## Z8 — Where a change is judged

- **`pnpm grid`** — Component Studio (`apps/component-studio`): every capability × layout ×
  motion profile side by side, plus a six-frame filmstrip. `docs/measurement-gate.md` names it as
  where measure 4 is judged. This is the design iteration loop. Since `3d039df` it also carries a
  **theme** picker, which drives the scenes and deliberately not the chrome — moving the surround
  while comparing two palettes is the one condition under which they cannot be compared.
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
  layout is innocent.

**Chosen 2026-08-14: the Z6 reading, in `9036a9a`.** The column is now a width and not a slot —
it grows from nothing on the annotation's own entrance, so the chart holds the whole row until
there is something to yield to. That repair stands on its own: a column reserved before it is
occupied is wrong whatever the timing does.

**Correction, 2026-08-15 — the reason recorded for rejecting the Z7 reading was false.** This map
and `BarChartScene/layouts.ts` both said the annotate frame came from a word anchor, so moving it
would detach the annotation from the word it names. It does not. Both plans write `annotate` at
`<beat>.end-long`, a *boundary* anchor: the end of the beat less `motion.duration.slow` — 34
frames, 1.13 s. 799 = 833 − 34 and 694 = 728 − 34 are that arithmetic and nothing else. Word
anchors do appear in the same scene, on `revealAll` (`b2.word:January`) and `highlightBar`
(`b2.word:March`), which is where the error came from.

**So the callout timing is reopenable, and the interesting half of it is upstream of Z7.** From
`end` the agent's whole vocabulary is `-short` (0.4 s) and `-long` (1.13 s):
`core/anchor-grammar.ts` offers no way to say *well* before the end of a beat. The agent took the
latest-but-one option it had. Widening that grammar changes what an agent is allowed to write and
wants an ADR, not a commit.

What this does **not** claim: that ticket 22's row now passes. One offending element is repaired.
The row is a human verdict on a whole preview, and no named evaluator has watched a rebuilt one.

## Second finding, fixed in `f60a6e1`: a headline was clipped in the opening scene

Seen 2026-08-14 while reviewing the paper render, at frame 420 of the shipped paid run
(`rainy-opener`, `image_context`, `splitLeft`). The headline **"Northbridge before dawn"**
rendered as **"Northbridg"** — the final `e` cut off mid-glyph.

**Mechanism, Z2.** `titleStep` read string length only: 23 characters → step 5 → 120px display
type. `SceneTitle` caps the block at 86% of the copy column, and `AnimatedText` wraps everything
in `overflow: hidden` so the clipped rise reads as typography being set. "Northbridge" is a
single unbreakable word wider than that box, so it was cut rather than wrapped. Z2's stated
weakness reaching a frame: a typographic hierarchy decided by `String.length` cannot know the
width of the box it landed in.

**Not caused by the theme.** `editorial-paper` overrides `color` only — `type` is spread from
`editorialCold`, so family, weight and size are byte-identical and the geometry cannot have
moved.

**Why no test caught it.** `safe-area.test.ts` asks whether ink reaches the *rectangle's* edge.
Here the text never gets there: it is clipped by its own `overflow: hidden` well inside the safe
area, so the quiet-border probe reads clean backdrop and passes. It is the same blind spot that
comment already names — "a caption lost its last word in `section--vertical-slice` while this
suite stayed green" — reached by a different route. The `image_context` examples do not exercise
it either: `example-long-context` has only short words, so it wraps correctly.

**Repaired by measuring** (`f60a6e1`), **then made automatic** (`c328a6d`). `titleStep` is
demoted to a ceiling and `useTitleStep` decides what actually fits, using `measureText` on the
real loaded font so nothing is estimated. Hyphenation was rejected — the anchors do not hyphenate
display headlines — and so was `fitText`, which fits exactly by returning an arbitrary size and
would have abandoned the type scale to do it. See Z2 for the three-step degradation and the
column seam that now applies it without a scene asking.

**The lesson for this map is about Z8, not Z2.** The render suite was green before the fix and
green after it, and the accepted key frames never moved: the three `image_context` examples all
happen to have short words, and a clip that happens *inside* a scene's own box is invisible to
every probe that measures against the safe area. A defect reached the flagship artifact and no
automated check could have told anyone. The guard is now a unit test over the decision
(`tests/title-fit.test.ts`), because the pixels were never going to give one.

## What this map deliberately does not do

It does not judge whether any of the above *looks* good. That is the user's call, made in
Component Studio, against the §Premium anchors. The map's job is to say where an intervention
would land and what it would reach.
