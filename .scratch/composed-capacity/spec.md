# Spec — what the composed box does, said out loud

Type: spec · 2026-08-21 · branch `architecture/render-harness` (off `dev` @ `321bec2`, HEAD `a4dd8c5`)

One defect, found by rendering `section--vertical-slice` and watching it
(`%TEMP%\vox-studio-handoff-2026-08-21-slice-rendered.md`), has four causes. This spec
addresses all four, because fixing fewer leaves an agent that still cannot compose a
coherent video without a human reading the source.

**The thesis.** Every degradation in this system announces itself in the compile report —
`ASSET_PLACEHOLDER`, `SOFT_LIMIT_EXCEEDED`, `SLOT_RELOCATED`, `PERSISTENT_ELEMENT_HIDDEN`,
`TITLE_DENSITY`, `MOTION_PROFILE_REPETITION`, `SCENE_BELOW_RECOMMENDED_DURATION`. Seven
warning codes, and the map's own standing constraint — *"Degradation stays visible"* —
makes that a rule rather than a habit.
**Composed-capacity collapse is the one degradation that is silent.** It changes the data on
screen and says nothing, to nobody, ever. That is what this spec closes.

## What was verified, not assumed

Everything below was read in the tree at `a4dd8c5`. Line numbers are that commit's.

| Fact | Where |
| --- | --- |
| Capacity is computed at **render time** from the received box | `src/scenes/BarChartScene/Component.tsx:114-124` |
| …and floors at 3 in a composed box | `src/scenes/BarChartScene/layouts.ts:83-88` |
| `aggregateBeyond` **sums** what it collapses | `src/core/aggregate.ts:24` |
| The published rule says top **8**, unconditionally | `src/scenes/BarChartScene/constraints.ts:14` |
| 5 entries sit inside the recommended band 2–8, so there is **no data warning at all** | `constraints.ts:10-11` |
| The only warning the agent gets is `SLOT_RELOCATED`, severity **`info`** | `src/core/compiler-checks.ts:193-198` |
| …phrased about the *element*, naming the composition: `"narrator" contends with "chart", so the scene yields into "left".` | `src/compile/persistent.ts:105,152-158` |
| `capability.checks` runs inside `validateScene`, **before** any composition is resolved | `src/catalog/validate.ts:50` vs `src/compile/index.ts:155` |
| `checks` already validates label references — against **authored** data, not surviving data | `src/scenes/BarChartScene/checks.ts:29-50` |
| A prose-versus-screen check already exists as precedent | `DEICTIC_ANCHOR_REQUIRED`, `src/catalog/validate.ts:588-640` |
| Only `example-long-ranking` aggregates today, and its unit is `'k'` | `src/scenes/BarChartScene/examples.ts:89-101` |
| `unit` is a **free 8-character string**, not an enum | `src/scenes/BarChartScene/schema.ts` |

**And one thing the handoff got wrong, measured this session.** It warns that §4.2 must
"budget the regeneration and the line-ending fight". There is no fight. `catalog:check` is
red on Windows for exactly one reason: `core.autocrlf=true` with **no `.gitattributes` in
the repo**, so git checks the generated JSON out as CRLF while `build-catalog.ts` writes
LF, and `--check` compares bytes (`scripts/build-catalog.ts:44`). Proven by regenerating in
memory and comparing both ways:

```
catalog.json        | byte-equal: false | LF-normalised-equal: true
plan-contract.json  | byte-equal: false | LF-normalised-equal: true
```

The content is **identical**. The cost of §4.2 is a `.gitattributes` line, not a budget.

## Decisions that need approval before any file is written

`meta.ts`, `schema.ts`, `constraints.ts` and `compiler-checks.ts` strings are published to
the agent, so they are approved first, per `docs/adding-a-capability.md`. Recommended
answers are marked ←.

### D1 — how a capability declares what a composed box holds

- ← **`capacityByComposition` on `SceneMeta`, optional, declarative.**

  ```ts
  supportedCompositions: ['full', 'left', 'right'],
  capacityByComposition: { full: 8, left: 3, right: 3 },
  ```

  The same kind of object `recommendedMax: 8` already is — a capability number, simply
  indexed by composition. It gives the compiler no geometry and the agent no percentage,
  and therefore does **not** touch ADR-0003 decision 4 (*"`safeArea` is the translation,
  not a second layout system"*). The handoff's §5 objection — that warning about capacity
  forces the compiler to replay `chartShare`, `columnPitch` and the type tokens — is true
  of *computing* capacity and false of *declaring* it.

- Compute it in the compiler. Rejected: that is the probe redesign, it inverts decision 4,
  and it is explicitly parked.
- Say nothing and let the render decide. That is today.

**The declared number is a claim, and claims here get paid for.** `meta.ts:9-18` already
imposes exactly this discipline on `supportedCompositions` — *"Do not add an entry here
without drawing the frame and looking at it."* D1 inherits it, and V2 below pins it with a
test so the claim cannot drift from the arithmetic.

### D2 — how the compiler knows which prop is the series

The compiler is generic; `props.data` means nothing to it.

- ← **Declare the field alongside the capacity.** `seriesField: 'data'` on `SceneMeta`.
  The compiler then reuses `aggregateBeyond` — already a pure function over
  `{label, value}` in `src/core/aggregate.ts` — and learns not only *how many* rows are
  dropped but *which labels*. That second half is what D6 needs, and it is the reason to
  prefer this over a bare count.
- A second capability hook, `composedChecks(instance, composition)`, called from the
  compiler after resolution. More expressive, but it runs scene code inside the compiler
  and duplicates a mechanism (`checks`) that already exists at a different phase.
- Widen the existing `checks` signature. Rejected: `validateScene` is exported and used
  standalone, without a plan and without a composition; making composition a parameter of
  it erases a phase distinction the pipeline depends on.

### D3 — what the aggregation does with a share

`aggregateBeyond` sums. Summing is right for counts and amounts and false for shares:
27 % + 33 % = 60 % is a city that does not exist.

- ← **An explicit `valueKind: 'amount' | 'share'` prop, defaulting to `'amount'`** — plus a
  `checks` warning when `unit` is `'%'` and `valueKind` was left at its default. Explicit,
  with the exact mistake still caught loudly.
- Infer from `props.unit`, as the handoff proposes. Rejected as the *only* mechanism:
  `unit` is `z.string().max(8)`, free text. `'%'` infers correctly; `'pct'`, `'pts'`,
  `'percent'` and `'%%'` do not, and a hidden rule keyed on a free string is the same
  species of defect this whole spec exists to remove.
- A mode argument at the call site, with no prop. Rejected: it puts the semantics in the
  caller rather than in the data, so two callers can disagree about the same series.

`aggregateBeyond` gains the mode; it does not gain a policy. It stays a pure function and
the capability decides.

### D4 — the new check codes

Both are published vocabulary, so the names are a contract.

- ← `CAPACITY_REDUCED_BY_COMPOSITION` — *warning*, severity `['quality']`.
  **means:** A scene yielded into a composition that holds fewer values than its published
  recommendation, so the weakest were collapsed.
  **repair:** Free the region the scene occupies — move a contending persistent element to
  a slot the scene does not use — or reduce the series to the composed capacity yourself.
  **`expected`:** the surviving labels.

- ← `NARRATION_NAMES_COLLAPSED_VALUE` — *warning*, severity `['important']`. See D6.
  **means:** Narration or annotation text names a value this scene collapsed, so the words
  describe something the frame does not show.
  **repair:** Keep the value on screen — see `CAPACITY_REDUCED_BY_COMPOSITION` — or rewrite
  the beat so it does not name it.

Names considered and dropped: `COMPOSED_CAPACITY_REDUCED` (leads with an adjective);
reusing `SOFT_LIMIT_EXCEEDED` with a new severity (it conflates a plan the author
over-filled with a box the compiler shrank — different author, different repair).

### D5 — `SLOT_RELOCATED` severity

Today `severity: ['info']`. A relocation that costs the scene half its categories is not
information.

- ← Widen to `['info', 'quality']`, and situate `quality` when the yielded composition
  reduces capacity. `SOFT_LIMIT_EXCEEDED` already carries a two-value severity array, so
  the shape exists.
- Leave it at `info` and let `CAPACITY_REDUCED_BY_COMPOSITION` carry the weight. Defensible
  — the new code states the consequence outright — but it leaves the *cause* whispering.

### D6 — the coherence check (the point that matters most)

**This is what made the video wrong**, and neither D1 nor D3 fixes it. b3 says *"Berlin
sits twenty points lower"* and the annotation reads *"Twenty points above Berlin"*, over a
chart Berlin was collapsed out of. The plan supplies **both halves of its own
contradiction**, which is what makes this machine-decidable without a word of NLP.

Two sub-cases, one code:

- **(a) Structural.** An event's `payload.label` names a row that aggregation drops.
  `checks.ts:29-50` already runs exactly this test — against the **authored** data. It has
  the right shape and the wrong denominator. Re-run it against the surviving series.
- **(b) Prose.** A beat the scene spans, or an annotation's free `text`, contains a label
  the scene collapsed. Matched with the existing `tokenise` (`src/core/words.ts:28`) on
  word boundaries.

- ← **Scope it to labels the plan itself declared and the render dropped.** Never fire on a
  word that was never in `data`. That single restriction buys near-zero false positives:
  the plan wrote `Berlin` into `data` *and* into b3, and the compiler removed it. No
  judgement about English is required, only about the plan's own two statements.
- Widen to any capitalised token absent from `data`. Rejected: narration legitimately names
  things that are not chart rows — b1's *"Across Europe's biggest cities"* is correct as
  written. That version fires constantly and gets ignored, which is worse than silence.

**Warning, not error** — `important`, the severity `PERSISTENT_ELEMENT_HIDDEN` carries.
Rule 5 puts loud failure on hard constraints; this is a soft one, and the map's standing
constraint is explicit that warnings do not block a preview.

### D7 — the CRLF prerequisite

- ← Add a root `.gitattributes` pinning the generated projections to LF:

  ```
  packages/video/src/catalog/*.json                    text eol=lf
  packages/production/src/contracts/generated/*.json   text eol=lf
  ```

  then re-checkout those files. `catalog:check` goes green **before** any content change,
  so the next regeneration reports real drift instead of drowning in `\r`.
- `* text=auto eol=lf` repo-wide. Larger blast radius, touches every file, not this spec's
  business.

Do this **first**, alone, in its own commit. It is the only item here verifiable in
isolation in under a minute.

## Slices, in order

Each is independently committable and independently verifiable.

| # | What | Touches catalog? |
| --- | --- | --- |
| **0** | D7 — `.gitattributes`, re-checkout, `catalog:check` green | no (it fixes the check) |
| **1** | D3 — `aggregateBeyond` mode, `valueKind` prop, the `unit`/`valueKind` mismatch warning | yes |
| **2** | D1 + D2 — `capacityByComposition`, `seriesField`, `constraints.ts` prose made conditional | yes |
| **3** | D4 + D5 — the capacity warning; expose the chosen composition; emit after `safeAreaFor` | yes |
| **4** | D6 — `NARRATION_NAMES_COLLAPSED_VALUE`, both sub-cases | yes |
| **5** | Move `vertical-slice.plan.json`'s first placement `cornerBR` → `cornerTR` | no |

Slices 1–4 each end with one `pnpm catalog` and one `catalog:check`. After slice 0 that is
cheap; before it, it is unreadable.

**Slice 3 needs one structural change.** `resolvePersistentLayer` stores
`slotRect(resolution.composition)` and discards the slot (`persistent.ts:79`). Add
`compositionOf: Map<string, Slot | null>` to `PersistentLayer`, beside `safeAreaOf`. The
compiler already calls `safeAreaFor(layer, scene.id)` per scene at `index.ts:158`; the new
pass sits on the same line.

**Slice 5 is not a fix.** It is the acceptance demonstration: after slices 0–4, the compile
report alone should tell an agent to make that move. If a human still has to read
`meta.ts:39` to find it, this spec did not work.

## Verification

**V1 — the drop, both directions.** A share drops its collapsed entries; a count still sums
them. Pure function, table of inputs — `mattpocock-skills:tdd`, red-green.

**V2 — the declared capacity is the computed capacity.** A render test asserts, per
capability and per entry in `supportedCompositions`, that the number in
`capacityByComposition` equals what `Component.tsx` computes for that box. This is what
stops D1's declaration from becoming another `constraints.ts:14` — a rule the code stopped
obeying. **Without V2 this spec has moved the lie, not removed it.**

**V3 — the slice reports its own defect.** Compile `vertical-slice.plan.json` *before*
slice 5 and assert the report now contains `CAPACITY_REDUCED_BY_COMPOSITION` (chart, left,
5 → 3) and `NARRATION_NAMES_COLLAPSED_VALUE` (Berlin, in b3 and in the annotation text).
This is the regression test for the whole spec, and it is written against the plan that
failed.

**V4 — key frames do not move.** Slices 1–4 should leave every accepted md5 alone: only
`example-long-ranking` aggregates, and its unit is a count. The handoff says verify rather
than assume; slice 5 changes what the compiler composes, so it is the one that may legally
move them — and if it does, the new frames need a look, not a re-baseline.

**V5 — the render.** `occupies-regions.test.ts:29` states that the `cornerTR` declaration
*"predates any measurement"*, and the chart's header spans the full box width. On a full
frame that title is larger than anything the current stills show. Render frames 285 and 493
and look at the corner. `run` skill; roughly 4 minutes for the video, ~11 s for stills.

Gates after each of slices 1–4, one at a time (`ENOTEMPTY` under concurrency). Baseline at
`a4dd8c5`: typecheck green · unit 491/494 · render 112/113 · stress 291/291 · biome clean.
The four reds are ffprobe; ffmpeg is not installed and that is not a bug.

## Does not claim

**It does not make the video good.** It makes the video's incoherence *reportable*. Design
quality is upstream work the user owns — ticket 22's territory — and nothing here is an
input to it.

**It is not ticket 25.** That ticket checks the *artifact* by reading pixels, and it is
parked until after 7 September. Everything in this spec is decided from the plan and the
compiled document, costs no render, and touches no PNG. Slice 3 must not grow into a probe.

**It does not collapse less.** The floor of `minCategories: 3` stays exactly where it is.
Drawing five columns in that half box is the 592 px overflow `31c3bfc` repaired; the floor
is the protection, not the bug. This spec makes the floor *audible*, not lower.

**It does not close `verticalSliceReviewed`.** Ticket 09 says twice, at `:272` and `:499`,
that only a human watch-and-listen may. `harness.ts:409` stays untouched.

**D6 does not understand narration.** It compares two strings the plan wrote itself. A beat
that describes an absent value without naming it passes, and always will.

## Open

- **Do other capabilities need `capacityByComposition`?** `bar_chart` is the only one that
  degrades on count. `quote` is *"bounded only by its box"* per the predecessor handoff's
  §3 and may have the same shape of hole with a different symptom. Not surveyed here.
- **Does the measurement gate see these warnings?** `docs/measurement-gate.md` withholds
  render feedback during a cold pass. These are compile-time warnings and not renders, so
  on the face of it they are fine — but `CAPACITY_REDUCED_BY_COMPOSITION` is a statement
  about what the frame will look like, and ticket 25 records that this boundary is
  precisely the unsettled question. Decide before the next gate run, not in September.

## Comments

### Implemented 2026-08-21 — branch `capability/composed-capacity`

D1, D3 and D6 approved by the user; D2, D4, D5 and D7 taken at their `←`. Six commits,
`deb6113`..`f188e16`. Five things the implementation found that this spec had wrong.

**D7 was smaller than stated, and the repository was never at fault.** The spec says git
checks the generated JSON out as CRLF — true — but the committed blobs are already LF and
byte-identical to a fresh regeneration. Nothing had drifted; only the Windows checkout had
been converted. `.gitattributes` plus one `pnpm catalog` turned `catalog:check` green with
zero bytes of content changed.

**D1's table needed a second axis.** Capacity was measured across every composition, layout,
motion profile and theme before the number was declared, and composition alone is not
enough to name it: a half frame holds **3** vertical columns and **8** horizontal rows,
because a column is bounded by the width its label needs and a row by the height of the box.
Indexing on composition alone would have published one of those as though it were both —
this spec's own defect, one level down. `capacityByComposition` is therefore
`slot → layout → number`.

It is also a **floor** rather than a figure. The camera allowance belongs to the motion
profile, so the same half frame holds 4 columns under `impact` and 3 under `pushIn`. Only
the smallest value is true whatever the plan picks, and warning early is the safe direction
because the repair does not change.

**Warnings carry `suggestion`, not `expected`.** D4 specifies `expected: the surviving
labels`; only `CompilerError` has that field. The surviving and collapsed labels are named
in the `message` instead, and the repair goes in `suggestion`.

**V2 needed a refactor the spec did not budget.** Holding the declaration to the arithmetic
is impossible while the arithmetic lives inline in a React component behind three hooks. The
capacity expression moved beside its geometry in `BarChartScene/layouts.ts`, and SlotFrame's
box and density arithmetic became callable (`frameBoxFor`, `densityFor`) — unchanged,
re-addressed. A test
that recomputed the box itself would have agreed with itself and with nothing else.

**Slice 5 took a different repair than the one specified, on the evidence of a render.**
The spec proposed `cornerBR → cornerTR`, and V5 said to verify by rendering rather than by
reasoning. Rendered, the tallest bar's value label is **clipped by the character**: `47%`
has its ascenders cut by the narrator's shape. `occupies-regions.test.ts:29` declined to
answer that question and was right to. The repair taken instead is the one this spec's own
work made findable — the chart becomes a `horizontal` ranking, keeps `cornerBR`, yields
into `left`, and loses nothing, because that half holds eight rows.

### Open, found by the work

- **`bar_chart` overclaims `occupiesRegions`.** It declares `['bottom', 'left']`; the value
  label of the rightmost bar reaches into `cornerTR` on a full canvas. That suite's thesis
  says what an overclaim buys: *"a capability that overclaims frees a slot with ink in it:
  the character is kept, legally, on top of the scene's own words."* Fixing the declaration
  changes what the compiler composes for every plan that uses this scene, so it wants
  renders and a ticket, not a line changed in passing.
- **`biome check` is red across the whole tree, for D7's reason one scale up.** Every file
  is checked out CRLF and biome formats to LF, so the gate is red on Windows and green on
  CI — the same unreadable-signal defect `.gitattributes` just fixed for two directories.
  Every file this branch wrote or rewrote is clean when normalised; nothing else was
  touched. The repo-wide fix is `* text=auto eol=lf` plus a renormalising commit, which
  this spec deliberately declined in D7 as too large to hide inside it. It is now measured
  rather than suspected.
- **The slice's frame is sparse.** The horizontal ranking in a half leaves the right side
  of the frame carrying only the narrator, and `AMSTERDAM` is cut to `AMSTERD…`. Both are
  design questions, which are the user's and not an agent's — recorded here so the choice
  is made rather than inherited.
