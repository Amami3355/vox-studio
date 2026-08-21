# Measure what bar_chart occupies, and declare that

Type: decision
Status: open
Blocked by: none

## Objective

`bar_chart` declares `occupiesRegions: ['bottom', 'left']`
(`packages/video/src/scenes/BarChartScene/meta.ts:39`). That frees exactly one slot —
`cornerTR` — and on 2026-08-21 a render put ink in it.

`tests/render/occupies-regions.test.ts` states the whole cost of an overclaim in its own header:

> a capability that overclaims frees a slot with ink in it: the character is kept, legally, on top
> of the scene's own words.

That is now the observed behaviour, not the feared one. Decide what `bar_chart` actually occupies,
measure it the way that suite measures the other two, and declare the result.

## The evidence

Rendering `section--vertical-slice` with the narrator placed in `cornerTR` and the chart on the
full canvas draws the tallest bar's value label **under the character**, with its ascenders cut.
`packages/video/out/crop-cornerTR.png` is a 2× crop of that corner; `out/fixed-500-b3-annotation.png`
is the whole frame. Both are gitignored; regenerate with `pnpm exec tsx out/stills-fixed.mts` after
setting the first placement to `cornerTR` and the chart layout to `standard`.

**The compiler reported nothing.** That configuration compiles with a single `SLOT_RELOCATED` at
`info`, about the closing scene. Rung a fired — no element's slots overlap the scene's declared
occupancy — so the narrator was kept, exactly as designed, on top of a number.

## What the declaration frees today

Measured with `overlaps` from `core/slots.ts`, the same function the compiler uses:

| capability | `occupiesRegions` | frees |
| --- | --- | --- |
| `bar_chart` | `['bottom', 'left']` | **`['cornerTR']`** |
| `quote` | `['left', 'center']` | `['cornerTR', 'cornerBR']` |
| `stat_counter` | `['left', 'center']` | `['cornerTR', 'cornerBR']` |
| `image_context` | `['full']` | `[]` |

`quote` and `stat_counter` earned their two corners: `occupies-regions.test.ts`'s header carries the
worst-case ink sweep that bought them, per profile, per frame, at the schema ceiling. `bar_chart`
never had one. That suite says so in terms, and declines the work deliberately:

> `bar_chart` declares `['bottom', 'left']`, which frees `cornerTR`, and its header spans the full
> box width: whether a ceiling title puts ink there is a real question, and it is not this suite's
> to answer — that declaration predates any measurement and measuring it is its own work.

This ticket is that work.

## The decision, and why it is not only about a corner

**Every honest region set frees nothing.** Measured:

| added to `['bottom', 'left']` | frees |
| --- | --- |
| `top` | `[]` |
| `right` | `[]` |
| `cornerTR` | `[]` |
| `center` | `['cornerTR']` — does not cover the corner, so it fixes nothing |

The value label is the *first* leak found, not the only one to suspect. On a full canvas the header
spans the whole box width — the slice's title runs to roughly x = 80 % — so `top` and `right` both
carry ink that neither declared region covers. A scene that draws a titled chart edge to edge is
much closer to `image_context`'s `['full']` than to `quote`'s two clear corners.

So the question to settle is not *"which corner do we give back"* but:

**Does a persistent element ever stand over a bar chart?** Under any correct declaration the answer
becomes no: the scene yields into `left` or `right` (both of which it supports and now has a
published capacity for), or the element relocates, or it hides. Three candidate declarations, all
with identical compiler behaviour and different honesty:

- ← **`['full']`.** Says what is true — the scene draws edge to edge — and matches `image_context`,
  the other capability that does. Cheapest to defend, and impossible to overclaim again.
- `['top', 'bottom']`. Same free set, and preserves the shape of the current sentence. But it is a
  more elaborate way of saying `full`, and it invites the next reader to look for the gap between
  the two halves, of which there is none.
- `['bottom', 'left', 'top']`. Minimal edit. Reads as an accretion rather than a measurement, which
  is how the current declaration came to be wrong.

Recommended answer marked ←. Take it only after the sweep below agrees.

## Scope

**Build `control--bar-chart-ceiling`.** No such composition exists — `remotion compositions` lists
`backdrop`, `stress`, `stat-empty-driven`, `quote-ceiling`, `stat-ceiling` and nothing for
`bar_chart`. It is the missing piece: the other two capabilities are swept at their schema ceiling
(20 categories, 40-character labels, 120-character title) because ink extent is worst where copy is
longest, and the published examples never go there and must not.

**Add `bar_chart` to `SWEPT`.** The suite's machinery — `freeSlotsOf`, `regionOf`, the
backdrop control, the four frames, the six motion profiles — needs no change. It has been ready for
a third entry since it was written.

**Record the numbers in the header, as the other two are.** The existing table gives ink max x, the
ink y band, and the real margin for `quote` and `stat_counter`, and names which number is thin and
in which direction. A third row that says only "occupies everything" is worth less than one that
says how far the ink actually goes — that is what tells the next person whether a layout change has
spent the margin.

**Then change the declaration**, regenerate the catalog, and re-run the gates. `occupiesRegions` is
published (`catalog.json`), so this is a contract change.

## Blast radius, and why it is larger than one line

Changing what a capability occupies changes what the compiler composes for **every plan that uses
that capability**. Concretely, in the tree as it stands:

- `section--vertical-slice` is unaffected in outcome. Its narrator is in `cornerBR`, which is
  already contended, so the chart already yields into `left`. It will keep yielding.
- Any plan that put an element in `cornerTR` over a chart silently stops doing so and yields
  instead. There is no such plan in the repository today, which is why this is cheap to take now
  and will not stay cheap.
- The repair that this ticket forecloses is the one the composed-capacity spec originally proposed
  — `cornerBR → cornerTR` — and foreclosing it is the point. It was rejected on the pixels; after
  this ticket the compiler rejects it too, which is where the rejection belongs.

## Acceptance

`occupies-regions.test.ts` sweeps three capabilities instead of two, at their schema ceilings, under
every motion profile, and `bar_chart`'s declared free set matches the measured one. A plan that
places a persistent element over a full-canvas bar chart is composed or warned about rather than
kept.

## Does not claim

**It does not make ink measurable in general.** This is one capability's declaration held to one
suite's sweep. The fourth capability to ship will need the same work, and the header should keep
saying so.

**It is not ticket 25.** The sweep runs in the render suite over control compositions, as it already
does for two capabilities. Nothing here reads a Run, publishes a stage, or hands an agent a
predicate.

**It does not touch `supportedCompositions` or `capacityByComposition`.** Those say what the scene
can *become*; this says what it *covers*. The 2026-08-21 branch measured the first pair; this is the
third declaration of the same family and the last one still unmeasured.

## Comments

### Opened 2026-08-21

Found while verifying the composed-capacity spec's slice 5 by rendering, which is what that spec's
V5 asked for and the reason it asked. The reasoning path is in
`.scratch/composed-capacity/spec.md` → *Comments → Open, found by the work*; the branch is
`capability/composed-capacity`.

Checked before filing: no ticket 01–25 proposes measuring `occupiesRegions` for any capability, and
the two capabilities that are swept were swept by the commit that wrote the suite.
