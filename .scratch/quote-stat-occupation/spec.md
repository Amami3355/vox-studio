# Spec — let `quote` and `stat_counter` host a persistent element

Type: spec · 2026-08-17 · branch `quote-stat-occupation` (off `dev` @ `a59713b`)

The source of truth for this work is the investigation handoff:
`handoff-quote-stat-occupation.md` (2026-08-17). The user has decided; both A and B below
are approved. This spec records the decision, the measured evidence it stands on, and the
order of work. Nothing here is a proposal.

## The problem

`QuoteScene` and `StatCounterScene` both declare `occupiesRegions: ['full']` and
`supportedCompositions: ['full']`. Under ADR-0003 that means **every** persistent element
crossing either scene falls to the last rung and is hidden. Two of the four capabilities
in the catalog cannot host a character at all.

## The evidence (measured 2026-08-17, default theme)

**Sweep 1 — are the right-hand corners genuinely empty?** 48 stills: both capabilities ×
all six motion profiles × frames 1/20/60/150, props at the schema hard ceiling (240-char
quote, 60-char attribution and role, 40-char eyebrow; 7-digit signed value, 12-char unit,
long label and sublabel):

```
cornerTL  2394 px worst      cornerTR  FREE in every still
cornerBL  4326 px worst      cornerBR  FREE in every still
```

`centered` is not centred: it is a left-aligned column, vertically centred as a block, and
`SceneTitle` caps at 86% of the column — ink never passed **x = 71.9%**.

**Sweep 2 — does the scene survive a half?** Composed into `left`, both reflow with no
design work — same type step, more lines, nothing overflows or crops — and the `right`
half is free. Confirmed by eye on the squeeze stills. That is the designed frame
`QuoteScene/meta.ts` said a composition claim requires; it already exists.

## Decision A — `occupiesRegions: ['left', 'center']` (both capabilities)

Checked against the overlap maths in `core/slots.ts`: `top`, `bottom`, `right`, `cornerTL`
and `cornerBL` stay correctly taken; `cornerTR` and `cornerBR` become free. `left` alone
is **not** enough — ink crosses 50%, so `center` is what keeps `right` correctly occupied.

**What it buys:** a character in `cornerTR`/`cornerBR` hits rung a (`keep`). It never
contends, so the scene is not shrunk for it. Without A, B alone would shrink the whole
scene to half a frame to clear one corner.

**Zero pixels change** on any existing frame.

**A has no guard anywhere today.** `occupiesRegions` is read only by
`compile/persistent.ts` and appears in tests solely as an *input*. No test asserts the
claim is true of the pixels. So A lands test-first (below).

## Decision B — `supportedCompositions: ['full', 'left', 'right']` (both capabilities)

The guard generates itself: `safe-area.test.ts` builds its cases from
`meta.supportedCompositions`, so this creates 8 new render cases (each capability × `left`
and `right` × `cinematic` and `pushIn`, over every published example). The explicit
expected-label list gains 8 entries, in registry × declaration × profile order:

```
'quote composed into left under cinematic',
'quote composed into left under pushIn',
'quote composed into right under cinematic',
'quote composed into right under pushIn',
'stat_counter composed into left under cinematic',
'stat_counter composed into left under pushIn',
'stat_counter composed into right under cinematic',
'stat_counter composed into right under pushIn',
```

## The new render test (A's guard) — `tests/render/occupies-regions.test.ts`

The seam, agreed with the shape of sweep 1: **the composition boundary**, rendered through
the same bundle as every other render test, measured against the `Backdrop` control.

- **Two new controls** in `src/runtime/SceneControl.tsx` — `quote-ceiling` and
  `stat-ceiling` — carrying props at the schema hard ceiling, in multi-word deterministic
  strings (a one-token ceiling string exercises no wrapping, and wrapping is the whole
  question). Controls rather than examples: ceiling copy is a shape the agent is steered
  away from, not one it should imitate — `docs/adding-a-capability.md` §Controls.
- **`ControlScene` gains a `motionProfile` override** input prop, mirroring
  `ExampleScene`'s existing override, so the six profiles sweep through two registered
  compositions rather than twelve.
- **The assertion is generated from the declaration.** For each swept capability, the
  free slots are computed from `meta.occupiesRegions` via `overlaps` in `core/slots.ts` —
  the same function the compiler uses — and every free slot's rectangle must equal the
  backdrop control, at frames 1, 20, 60 and the last frame, under all six profiles.
  A pinned expectation fixes the free-slot set at exactly `['cornerTR', 'cornerBR']`,
  which is the red half of the red→green: it fails while the declaration reads `['full']`.
- **Scope is `quote` and `stat_counter` only.** `image_context` declares `['full']` (no
  free slot — vacuous), and `bar_chart`'s `['bottom', 'left']` predates any measurement —
  its header spans the full box width, so a ceiling title may well put ink in `cornerTR`.
  Measuring that is its own work, not this branch's.

## What B actually cost (addendum, written after the gate ran)

The handoff's premise — "the frames reflow correctly with no design work" — was measured
with the throwaway probe, which renders `editorialStatic` only. `editorialStatic` has no
camera. The safe-area gate, run before declaring as this spec orders, falsified the
premise the first time it rendered a half under one: `example-quote-long` composed into
`left`/`right` under `pushIn` put the column taller than its box, and the 1.12 scale at
the last frame spent the whole margin — ink 10px from the canvas edge at both ends, the
attribution clipped mid-glyph. Squeezed, silently and legally; the probe just could not
see it.

So B was paid the way `bar_chart` paid its own (ADR-0003, 2026-08-12 amendment — drawing
was chosen over withdrawing then, and the reasoning transfers verbatim): a **composed
form**, drawn for both capabilities. In a portrait box (`width/height < 1.2`, the same
gap the other capabilities use) the column takes the box's full width — `columnRatio` is
a measure for a 1920 canvas and applying it inside a half narrows the column twice — and
the quote (or the stat's label) sets one rung below the length ladder. The stat's value
keeps `valueStep`: a figure does not wrap, and the width fit already answers the narrower
column. The full frame is untouched and every accepted key frame held byte-identical.

Measured after, at the schema ceiling under `pushIn`: quote's ink band y 0.3%..99.9% →
9.0%..90.7%; stat's 8.4%..91.9% → 25.9%..74.1%. Stills reviewed:
`.scratch/stills/probe-half-*.png`, `look-example-*.png`.

## Order of work

1. **B first** — its guard already exists. It was not nearly free: the gate falsified
   the "no design work" premise and the composed form had to be drawn — see the addendum
   above. Run the safe-area file; look at the composed frames
   (`BarChartScene/meta.ts`'s house rule: only a person can say whether the result is
   worth watching).
2. **A second, red-first** — controls + override + the new suite watched red against the
   `['full']` declaration, then the declaration flips and it goes green.
3. **Rewrite both `meta.ts` headers.** They currently argue *against* these declarations;
   leaving them would be worse than not changing the code. Record the measurement, not
   just the verdict.
4. **Repair what A makes false:** `safe-area.test.ts`'s header says
   `supportedCompositions` is "the only lever a capability has to keep a persistent
   element" — after A, an honest `occupiesRegions` is also a lever.
5. **`pnpm catalog`, then `pnpm catalog:check`.**
6. **Delete the scaffolding:** `packages/video/out/` (the probe) and the two throwaway
   `.scratch/*.mts` sweep scripts — the suite they prototyped now exists for real.

## Known limits, stated rather than discovered

- **Only the default theme was measured.** Both sweeps ran on it.
- **The corner margin is thin:** ink reaches 71.9%, corners start at 70% — two points, a
  consequence of `columnRatio: 0.72` plus `SceneTitle`'s 86% cap, not a designed margin.
  That is precisely why A needs its own test, and why the test sweeps all six profiles at
  the ceiling rather than one profile at the examples.
- ADR-0003's consequences section also calls `supportedCompositions` "the only lever".
  That sentence predates this work; the repair lands in the test header and the meta
  headers, and the ADR echo is flagged in the final report rather than amended here.
- The two known `stat_counter` gaps from the previous handoff (empty label eats a real
  value; width fit ignores the unit) stay open and stay deliberate.
- `docs/measurement-gate.md` is the plan of record and neither A nor B is on it. This work
  jumps the queue; the user chose that knowingly.

## Rejected, with the reason

**Moving the column permanently left.** Strictly worse: the narrower frame is paid on
every render, including the majority of scenes with no persistent element — the trade
ADR-0003 exists to avoid. Yielding belongs in `supportedCompositions`, where it is
conditional.

## Verification

```
npx vitest run --config vitest.render.config.ts packages/video/tests/render/safe-area.test.ts
npx vitest run --config vitest.render.config.ts packages/video/tests/render/occupies-regions.test.ts
pnpm -r typecheck
pnpm vitest run --no-file-parallelism
pnpm test:render
pnpm catalog:check
```

Commit with `git commit -F <file>` (a here-string injects a stray `@` on this machine).
`npx biome check .` is already red on `dev` for pre-existing reasons; check only changed
files. A red `test:render` is real, not flake.
