# Spec — the `typographic_statement` capability

Type: spec
Status: built — see “What the build changed” at the foot
Blocked by: none

Branch `capability/typographic-statement`, off `dev` @ `8a7e54f`.

The sixth SceneCapability, and the first that is not a chart or a quotation: a chapter card.
Named as next by every document that has an opinion — `docs/measurement-gate.md`'s order line
and its never-cut list, §13 step 8's own row, and the roadmap entry in
`docs/proposals/architecture-evolutions.md` — and named there as the cheapest: pure type, no
assets, no resolver.

The procedure is `docs/adding-a-capability.md`. Nothing in it is restated here except where
this capability forces a decision.

The visual direction was settled on a design canvas before this spec was written. Four
directions were drawn against the live tokens; direction **D — Coupe** was chosen, and the
three word-anchor treatments were narrowed to **W3 — balayage**. The canvas carries the
rejected directions and the argument for each.

---

## Problem Statement

A code-blind agent can today emit a sequence of individually correct frames that is not a
film. Five capabilities exist and three of them are charts; the catalogue can compare, trend
and count, and it has no way to say *what this chapter is*. Every compiler check decides
whether a shot is legible and honest, and not one of them decides whether the sequence has a
structure. A viewer watching the output cannot tell where one movement ends and the next
begins, because nothing on screen ever says so.

Separately, the film's finest instrument is unused at the scene level. Beats carry word-level
onsets from a recorded take, and the anchor grammar can already name a single spoken word
(`b7.word:absorb`). Today that precision reaches only boundary decisions. No capability lets
the picture move *with the sentence being spoken*.

## Solution

A capability whose whole job is to divide the film: one sentence, set large, on a ground that
fills the frame. The ground is the theme's emphasis colour promoted from a 96×4 rule to the
whole canvas, so the card reads as a cut rather than as another slide — the brightness change
is the edit.

The card can be driven word by word. A plan holding a real take anchors one `advanceWord`
event per spoken word; the sentence is legible from the first frame in a recessive tone, the
words already spoken stand in ink, and the word the voice is on takes the accent. Without word
timings the same card renders as a still card and nothing is lost — the degradation is the
design, not a fallback.

---

## User Stories

1. As a narrative agent, I want a capability that names what a chapter is about, so that the
   sequence I emit reads as a film with movements rather than as a reel of correct shots.
2. As a narrative agent, I want the card's ground to be a semantic role and not a colour, so
   that I cannot break the film's palette from inside one scene.
3. As a narrative agent, I want three grounds that mean something — neutral, positive,
   negative — so that an act opening on a gain looks different from one opening on a loss
   before a single word is read.
4. As a narrative agent, I want the card to accept an ordinal, so that a viewer can tell how
   far through the film they are.
5. As a narrative agent, I want an eyebrow above the statement, so that the card carries a
   label while the statement itself is still held back.
6. As a narrative agent, I want a `revealStatement` verb, so that I can hold the sentence
   until the narration hands over to it.
7. As a narrative agent, I want an `advanceWord` verb with no payload, so that I express
   pacing by where I anchor the event and never by an index I could get wrong.
8. As a narrative agent, I want `advanceWord` to work when anchored to a beat boundary as
   well as to a word, so that I can pace a card without a recorded take.
9. As a narrative agent, I want the examples to show the beat-paced form, so that I can copy
   a shape that actually validates in the absence of a take.
10. As a narrative agent, I want the word-anchored form shown somewhere I can read it, so
    that I know the seven-anchor shape exists even though no scene example can carry it.
11. As a narrative agent, I want to be refused loudly when I anchor to a word the beat does
    not speak, so that the picture never cuts on a syllable I did not choose.
12. As a narrative agent, I want to be refused when I name a word the beat speaks twice, so
    that no silent first-match decides my edit for me.
13. As a narrative agent, I want to be refused when I write more `advanceWord` events than
    the statement has words, so that the error arrives at validation rather than as a card
    that stops moving halfway.
14. As a narrative agent, I want to be refused when my word anchors are written out of spoken
    order, so that the plan's written order stays the order the card plays.
15. As a narrative agent, I want the capability's `avoidWhen` to redirect me to `quote` when
    I am setting a person's words, so that I do not use a chapter card as a pull-quote.
16. As a narrative agent, I want a statement length band with a named degradation, so that I
    can decide whether a longer sentence is worth the type scale it costs.
17. As a viewer, I want the film to visibly change register at an act break, so that I can
    feel the structure without being told it.
18. As a viewer, I want the sentence readable from the frame it appears on, so that I can
    read ahead of the narrator rather than being fed one word at a time.
19. As a viewer, I want the emphasis to follow the voice, so that the word being spoken is
    the word I am looking at.
20. As a viewer, I want no persistent narrator figure crossing a chapter card, so that the
    cut stays a cut.
21. As a viewer on a poor display, I want the knocked-out type to hold contrast in every
    ground role and both themes, so that the card is legible wherever it is watched.
22. As a maintainer, I want the card to render correctly with an empty statement, so that a
    plan that has not filled the card in yet does not produce a broken frame.
23. As a maintainer, I want the serif to live in the theme rather than in the component, so
    that a second theme inherits it and no scene invents a font family.
24. As a maintainer, I want the capability tested at seams that already exist, so that adding
    it does not add a testing surface to keep alive.
25. As a maintainer, I want the accepted key frames to fail loudly when the design moves, so
    that a deliberate change is reviewed by a human and an accidental one is caught.

---

## Implementation Decisions

### D1 — Identity

`typographic_statement` / `TypographicStatementScene` / family `typography`. The id is not
open: three documents already name it, and the manifest the agent reads is the only place it
has ever appeared.

### D2 — Props

Four fields. `statement` required; the rest optional.

- **`statement`** — the sentence. The scene.
- **`eyebrow`** — the label above it ("Chapter two"). Optional, and it is what the frame
  stands on while `revealStatement` holds the sentence back, exactly as `quote`'s eyebrow does.
- **`ordinal`** — a free short string ("02 / 05"), set small in mono at the foot of the frame.
- **`emphasis`** — `'neutral' | 'positive' | 'negative'`, default `neutral`. Selects the
  **ground** role from the theme through `emphasisColor()`.

`layout` and `motionProfile` stay out of the schema; they live on the SceneInstance.

There is no subtitle field. The chosen direction does not draw one, and a field the layout
ignores is a rule the agent would learn wrongly.

### D3 — The ground is a role, never a colour

This is the decision the whole card turns on. `theme.color.accent` is already spent on the
eyebrow and on the 96×4 `AccentRule`; the card promotes that same token to the full canvas.
It adds no colour to the system.

`BarChartScene/schema.ts` and `StatCounterScene/schema.ts` already publish this exact enum
with the sentence *"Selects the accent role from the theme; never a raw colour."* This
capability spends the same vocabulary rather than inventing a parallel one.

A fourth `ink` ground — a quiet, unlit act break — was considered and **declined for this
increment**. It is not an emphasis role, so it would need a second field; three roles prove
the seam and a fourth ground can be added later without breaking anything.

All six combinations (three roles × two themes) clear 4.5:1 for the knocked-out type. The
tightest is `positive` on `editorial-paper` at 4.50:1, which is display-only — it is a reason
never to put body copy on this ground, and the layout does not.

### D4 — Action vocabulary

Two verbs, both with `payload: null`. `supportsEvents: true`.

- **`revealStatement`** — bring the sentence onto the frame. Until it lands, the eyebrow and
  the ground carry the card.
- **`advanceWord`** — move the voice on by one word. **No payload, and that is the decision.**
  ADR-0011 binds a scene's events to the order they are written, so the *n*-th `advanceWord`
  is the *n*-th word by construction. A payload naming the word would write it twice — once
  in the anchor, once in the payload — and two sources that can diverge is the failure this
  vocabulary exists to avoid. It would also make the verb deictic, which under ADR-0012 means
  no scene example could illustrate it at all.

The word-anchored form a plan writes with a real take:

```ts
events: [
  { at: 'b7.start',           action: 'revealStatement' },
  { at: 'b7.word:Nobody',     action: 'advanceWord' },
  { at: 'b7.word:is',         action: 'advanceWord' },
  { at: 'b7.word:left',       action: 'advanceWord' },
  { at: 'b7.word:to',         action: 'advanceWord' },
  { at: 'b7.word:absorb',     action: 'advanceWord' },
  { at: 'b7.word:the',        action: 'advanceWord' },
  { at: 'b7.word:difference', action: 'advanceWord' },
]
```

The same verb anchored at beat boundaries paces the card at beat granularity, which is what a
plan without a take writes and what the examples illustrate.

### D5 — State

Three fields. `null` is load-bearing in the first two.

```ts
export type TypographicStatementSceneState = {
  /** Frame the statement begins its entrance; `null` while the plan holds it back. */
  statementFrame: number | null;
  /** Words the voice has reached; `null` when no event drives the sweep — all words read. */
  spoken: number | null;
  /** Frame the most recent word landed on, so its colour change can ease rather than jump. */
  spokenFrame: number;
};
```

`statementFrame` follows `QuoteScene/state.ts` verbatim, including its argument: the frame is
stored in the state rather than read off `resolveEvents`' `since`, because `since` reports 0
for a field no event reached and that is indistinguishable from a reveal anchored at the top
of the scene.

`spoken: null` is the same idea one field over, and it is what makes the degradation the
design. An instance carrying no `advanceWord` renders every word in ink — a still card — so a
plan with no take loses the sweep and loses nothing else.

The component clamps `spoken` to the statement's word count. The reducer does not, because
the reducer does not know the props.

### D6 — Checks

`checks.ts` **exists** here, where `QuoteScene` deletes it. One referential rule the generic
validator cannot express: more `advanceWord` events than the statement has words.

The word count comes from `tokenise()` in `core/words.ts` — the one module that decides what
a word is, and the same one the anchor grammar consults. A second definition of "word" inside
this capability would be a rule the agent could satisfy in the anchor and violate in the
check.

It judges **counts and written order, never frames**, so it fails at `validate` — before a
take exists and before anyone has paid to record one.

Per the procedure, this file is written after `Component.tsx` and verified against it: a
refusal is a claim about how the component is built.

### D7 — Layout and geometry

One layout, `cut`. Slots: `eyebrow`, `statement`, `ordinal`.

Layout-owned geometry, authored nowhere the agent can reach: the statement column as a share
of the frame box, the statement's ceiling step, the eyebrow gap, and the ordinal's corner.
A second arrangement would be a different scene.

### D8 — The one design-system change

The chosen direction sets the statement in a serif, which the theme does not carry. This is
the only cross-cutting change in the spec:

- `Theme.type` gains a **`displayAlt`** role, with a fallback stack, defined once and
  inherited by both existing themes.
- `design/fonts.ts` loads it. `@remotion/google-fonts/InstrumentSerif` is present in the
  installed package — verified, not assumed.

The component adds no family of its own; every value it draws still resolves to `design/`.

The serif is not a departure from the system's references. `theme.ts` anchors `editorial-paper`
explicitly on The Economist and the FT, and both title in serif.

### D9 — Composition and regions

- `occupiesRegions: ['full']` — a ground that fills the frame leaves no quadrant free, by
  `image_context`'s own reasoning.
- `supportedCompositions: ['full']` — **deliberate, and different in kind from `line_chart`'s.**
  `line_chart` is full-only because no composed form has been designed yet; that is a
  first-increment non-goal. A chapter card is full-only because *an act break must not share
  the frame*. A narrator crossing the cut defeats the cut.

The consequence is the same in the machinery and should be recorded as such: because
`conflict.ts` searches `supportedCompositions` for a slot that clears the contending element,
this becomes the **second capability that can never reach ADR-0003 rung b**. A persistent
element crossing it always relocates or hides. Here that outcome is the intent.

### D10 — Durations

`minDurationFrames: 60`, `recommendedDurationFrames: 120` — two and four seconds. Shorter than
`quote`'s 90/180 because a card is seven words, not a paragraph. Both provisional until the
stills say otherwise.

### D11 — Examples, and the one that cannot exist

Four examples. `canonical`, `driven`, an `edge` case past the statement band, and an `empty`
statement. `driven` carries the same props as `canonical` and differs only in its events, so
an agent comparing the two sees one variable.

**No example can carry a word anchor.** A scene example has no take — `syntheticBeats` gives
it `words: []`, and a word anchor against that throws by design. The `driven` example
therefore anchors `advanceWord` at beat boundaries.

The seven-anchor form is published to the agent through a **structural plan example** in
`catalog/structural-examples.ts`, which is a plan rather than a render and can carry the
anchors as illustration. This is the route ADR-0012 names. No compensating scene example is
invented to make up for it; one was, elsewhere, and it was removed.

### D12 — Soft constraints

Each entry names the degradation it buys. The statement band is tight on purpose — a chapter
card that needs a long sentence is a `quote`. Exceeding it drops a step of the type scale and
raises `TITLE_DENSITY`, the code `quote` already uses for the same failure.

---

## Testing Decisions

A good test here states external behaviour: what a plan is refused for, what reaches the
frame, and what two renders of the same plan have to say about each other. It never reaches
into the reducer's shape or a geometry constant. Both seams below **already exist**; this
capability adds no new testing surface.

### Seam 1 — `compile({ plan, beats })`, in `tests/compile.test.ts`

Everything about word anchors is decided before a pixel exists, so it is asserted as data. The
suite already builds `TimedBeat`s carrying words through its `spoken()` and `at()` helpers;
these cases join that file rather than starting a new one.

- Seven `advanceWord` events on word anchors resolve to the seven measured onsets, in order.
- A word the beat does not speak is refused, and the message names the words it does speak.
- A word the beat speaks twice is refused rather than resolved to the first match.
- A word anchor against a synthetic take is refused and says it has no take.
- Anchors written out of spoken order are refused with `EVENTS_OUT_OF_ORDER` (ADR-0011).
- More `advanceWord` events than the statement has words is refused at `validate` (D6).

No browser, no font, no hash, and nothing that depends on this machine.

### Seam 2 — `renderHarness()`, in `tests/render/typographic-statement.test.ts`

Built on the `render/quote.test.ts` shape, which keeps two different questions apart:

- **The verbs, as relations.** `driven` and `canonical` differ only in events. Inside the
  hold the two frames must differ; once everything has settled they must be identical — equal
  inside the hold would mean the events never reached the frame, unequal after it would mean
  the plan left something permanently behind.
- **The ground, as a relation.** The same example at `emphasis: neutral` and
  `emphasis: negative` must differ, which is what proves the role reaches the canvas.
- **The accepted key frames.** Literal hashes, accepted after looking at the still — the
  suite that is *expected* to go red when the design changes on purpose. Stills come from
  `scripts/still.mts`, and each hash carries a sentence saying what changed in the picture.
- **One compiled-plan render carrying real word timings**, on the
  `render/compiled-video.test.ts` pattern — the only place the sweep is proven on pixels
  rather than on frame numbers. The frame before `b7.word:absorb` and the frame after it
  settles must differ.

### Stress

Adding a capability touches a schema, a layout and `supportedCompositions`, so `pnpm test:stress`
is obligatory rather than optional. No `stress.ts` is needed: every field is an independent
scalar the generic schema-driven filler can size, which is the bar the procedure sets for the
exceptional eleventh file.

### Prior art

`render/quote.test.ts` (relation and key-frame split), `render/compiled-video.test.ts`
(a compiled plan through the harness), `compile.test.ts` (word-timing fixtures),
`tests/catalog-contract.test.ts` (the enforced checklist, which runs over the registry and
needs nothing written for it).

---

## Out of Scope

- **The `ink` ground.** Declined for this increment (D3). It can be added later without
  breaking the three roles.
- **Directions A, B and C** from the design canvas. Drawn, argued and rejected; the canvas is
  their record. Direction B in particular proposes a step above 168px in the type scale, which
  is a design-system change nothing here needs.
- **The other two word-anchor treatments.** W1 (each word arrives on its own frame) and W2 (one
  marked word) are drawn and not built. W3 subsumes W2's effect.
- **Deriving the ordinal from the plan.** There is no act in `videoPlanSchema` to derive it
  from; see Further Notes.
- **Transitions.** Deferred by ADR-0013, which says a transition will not cut in line ahead of
  the gate. A chapter card is strictly upstream of one: a transition has nothing to mark until
  there are chapters.
- **The `quote` full-bleed asset work** from the roadmap. It shares this card's visual register
  and none of its machinery — it needs an `AssetRequirement` that can ask for negative space,
  a scrim primitive and a contrast probe.
- **Running the measurement gate.** Ten briefs block it, and they are user work.

---

## Further Notes

**The ordinal can lie, and nothing catches it.** `ordinal` is a free string the agent writes
by hand; a card saying "02 / 05" in a film with six acts validates and renders. It is not
derivable today because `videoPlanSchema` is `.strict()` with exactly two keys and a section
carries no statement of what it is for — the dramaturgy gap recorded in
`docs/proposals/architecture-evolutions.md`. That entry already anticipates this: it says the
card built alone "produces title cards that decorate rather than divide", and that it is worth
considerably more once there is something for it to be the boundary of. Deriving the ordinal
is the first thing an act model would buy.

**Record two deviations in the proposals file**, not in the frozen doc: the plan of record's
`Comparison` was passed over for `timeline` on the grounds that it overlaps `bar_chart`; and
this capability becomes the second that can never reach ADR-0003 rung b, by design rather than
by non-goal (D9).

**`pnpm catalog` is not optional and the unit suite will not tell you.** Registering the
capability and skipping it leaves 400-odd tests green while the manifest the agent reads knows
nothing about the card. `pnpm catalog:check` is the only gate that goes red.

**Baseline failures to expect**, so they are not mistaken for regressions: three `proof-harness`
failures need an external agent run, one `stdio-contract` failure is a 5 s timeout under
parallelism only, one `service-render` failure is a missing `ffprobe`, and biome's baseline is
9 pre-existing errors rather than zero.

**Another session shares this worktree.** Stage explicit paths; never `git add -A`.

---

## What the build changed

Written after the fact, against the decisions above. Everything not listed here was built as
specified.

### One decision reversed: D5's `spokenFrame`

D5 gave the state a third field, `spokenFrame`, "so its colour change can ease rather than
jump". **It is not there, and the ease is gone with it.**

A word anchor exists so the picture moves on the frame the word was *measured* at. `useEntrance`
under `editorialStatic` takes roughly ten frames to settle, and at this granularity ten frames
is a whole word — so the sprung version showed a word brightening well after the narrator had
moved on, which is the arithmetic-instead-of-a-word that `anchor-grammar.ts` refuses when it
declines to give `word:` an offset. The tone now changes on the frame. The field that would
have softened it would have had no reader, so it was removed rather than left as dead state.

### One behaviour added that the spec did not name: the mark retires

When the sweep reaches the end of the sentence, the mark lifts and every word stands. The spec
implied it without saying so — its Seam 2 requires that `driven` and `canonical` be *identical*
once settled — and that requirement is only satisfiable if the card comes to rest in the
undriven state. It is also the better picture: a cursor parked under the last word for the
length of the hold reads as a voice that stopped mid-sentence.

### Cross-cutting changes beyond D8

D8 named one: `Theme.type.displayAlt` plus the font load. Five more were needed and each is
argued in the file it lives in.

- **`titleFit.ts` takes the face it is measuring.** The fit's own header says it is *measured
  rather than estimated*, and that stopped being true the moment a second display face existed —
  a serif at regular weight and normal tracking is not the width of a grotesque at 800 and
  tracking tight. `TypeFace` is an input now, defaulted to the face every existing caller uses.
- **`Backdrop` takes a `ground`.** A colour, not a flag; the caller still resolves a semantic
  role through `emphasisColor`. Given one it draws flat, because the radial lift that makes an
  ordinary scene read as a lit set makes a saturated full-canvas ground read as a gradient,
  which is a decoration rather than a cut.
- **`EmptyState` takes a tone and a ground.** `inkMuted` on a hot ground is not a degraded
  frame, it is an illegible one. Both default to the theme's own.
- **`StressControl`'s display-type probe learned the second face**, and learned to measure a
  statement that colours its own words. It filtered on one family and on "exactly one text
  child"; a sentence split into a span per word passes neither, so the one capability whose
  entire frame is display type would have been the one the fourth ADR-0003 question never
  reached — a question nobody asks reporting as a pass.
- **The quiet-border question is asked two ways now, from one place.** Both `safe-area.test.ts`
  and `stress/content-stress.test.ts` compared the band inside the reserved rectangle against a
  render of `Backdrop` — the wrong control for a scene standing on its own ground: it fails a
  correct frame, and any frame it passes has passed for no reason. `SceneMeta` gained
  `paintsOwnGround`, and for a scene that declares it the same question is asked absolutely
  instead: the band must be one flat colour, which is what "no ink here" means when the ground
  belongs to the scene. Both readings live in `quietBorderReading` in `tests/render/png.ts`,
  because the two suites had been carrying the same one-branch rule and a rule with two branches
  copied into two files is the copy that goes stale. The declaration is published, so an agent
  reading the manifest also learns why this capability cannot share a frame.

### One compiler check added

D6 said `checks.ts` refuses more `advanceWord` events than the statement has words, and named no
code for it. No existing code says that: `INVALID_PAYLOAD` is about a payload this vocabulary
does not have, and `EVENT_BEFORE_ELEMENT_REVEALED` is about an element that is merely not on the
frame *yet*. `EVENT_EXCEEDS_CONTENT` was added to `COMPILER_CHECKS.errors` and is published with
the rest.

`checks.ts` also carries a second rule the spec did not list, on the `line_chart` precedent: an
`advanceWord` written before `revealStatement` moves the voice through a sentence that is still
held back. It is true of the component because the words are mounted inside the statement's
gate — and it stops being true if that gate ever moves, which its header says out loud.

### Examples

D11's four examples exist. The `driven` one spans three beats rather than two: it holds the
statement until `b1.start+short` so the eyebrow-alone frame is a picture the catalogue actually
contains, and its seven `advanceWord` events then run `.start`, `.start+short`, `.start+long`
across the remaining beats, which is a shape an agent can copy. Two beats could not carry both
the hold and seven ascending boundary anchors.

### Gates, as run

- `pnpm catalog:check` — both projections up to date, 6 capabilities.
- `pnpm -r typecheck` — clean, 4 packages.
- `pnpm vitest run --no-file-parallelism` — 664 passed, 3 failed, all three the documented
  `proof-harness` failures that need an external agent run.
- `pnpm test:render` — 163 passed, 1 failed: `service-render`, missing `ffprobe`. Documented.
- `pnpm test:stress` — **1035 passed, 0 failed.** Obligatory here, and it earned its keep: the
  first run went red 12 times, every one of them the quiet-border rule reading this scene's
  ground as ink. Nothing was wrong with the frames. No `stress.ts` was needed — the generic
  filler sizes all four fields, and the ceiling case draws inside its box under all six
  profiles.
- `npx biome check .` — **clean, exit 0.** The spec's note that the baseline is 9 pre-existing
  errors is stale; there are none.
