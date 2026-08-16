# Spec — the `stat_counter` capability

Type: spec · 2026-08-16 · branch `stat-counter` (off `dev` @ `aec8f00`)

The fourth SceneCapability: a single big number, set large, with what it counts. Data
family, no assets, almost no new L1. Chosen because the catalog already promises it:
`BarChartScene/meta.ts` publishes an `avoidWhen` redirect `a single value → stat_counter`
and `QuoteScene/meta.ts` publishes `making one number the story → stat_counter`. The
manifest promises a capability that does not exist; building it pays that promise.

The procedure is `docs/adding-a-capability.md`. Nothing in it is restated here except
where this capability forces a decision.

## Decisions that need approval before any file is written

`meta.ts` and `schema.ts` wording is published to the agent. Per the procedure, these two
files' strings are approved first, then the other eight are written. Recommended answers
are marked ←. Everything else in this spec follows from them.

### D1 — id, name, family

- ← `stat_counter` / `StatCounterScene` / family `data`. The id is already published in
  two `avoidWhen` redirects, so it is not a free choice — it is the name the manifest has
  been pointing at.
- `big_number` / `BigNumberScene` — more descriptive, but the published redirects would
  have to move, and "counter" is the term both siblings already use.

### D2 — props

Five fields: `value`, `label`, `unit`, `sublabel`, `emphasis`. Only `value` and `label`
are required.

`layout` and `motionProfile` stay **out** of the schema — they live on the SceneInstance,
per the note in `BarChartScene/schema.ts`'s header.

- ← `value: z.number()` — a real number, not a string. The scene formats it; an agent
  writing `"1 in 3"` would be choosing typography the design system owns.
- ← `label: z.string()` — what the number counts, always present. A bare number is a
  number without a referent, which is the failure this capability exists to avoid.
- ← `unit: z.string().default('')` — `%`, `k`, `°C`. Sits beside the value at a smaller
  step. Empty for a bare count.
- ← `sublabel: z.string().default('')` — one supporting line under the label, e.g. a
  period or a comparison ("up from 19% in 2005"). Empty for none.
- ← `emphasis` — the shared `EmphasisRole` (`neutral` | `positive` | `negative`), same as
  `bar_chart`. The value reads in the role's colour.

### D3 — action vocabulary

- ← **`revealStat` only.** One verb a beat genuinely asks for ("hold the number back
  until the narration says it"). `state.ts` keeps one field. `checks.ts` is deleted — see
  D5.

No deictic verb. There is nothing to point *at*: a single value is the whole frame, so a
`highlight`/`emphasize` would target the only thing already there. `image_context`'s
`emphasize` and `bar_chart`'s `highlightBar` carry the pointing weight for the catalog;
a third capability does not need to inherit it (ADR-0012's open thread stays open).

### D4 — durations

← `minDurationFrames: 60`, `recommendedDurationFrames: 150`. A single number needs no
reading time beyond its own landing; these are the template's placeholders, adopted
deliberately as the measured answer for one element rather than carried across by
default. Both are provisional until the visual loop's stills say otherwise.

### D5 — `checks.ts`: deleted, and that is the honest answer

The template's check exists because its stamp is mounted *inside* the statement's gate.
Here the stat is the only gated element and nothing references it — no payload names a
field, no second element lives inside its gate. A held-back stat followed by nothing is a
quiet frame for one beat, a legitimate editorial hold, not a false promise. Same
reasoning as `quote` (its `checks.ts` is deleted for the same shape). An absent
`checks.ts` is honest; an invented one teaches the agent a rule that is not true.

---

## The proposed wording (verbatim, for approval)

### `meta.ts`

```ts
export const statCounterMeta: SceneMeta = {
  id: 'stat_counter',
  name: 'StatCounterScene',
  family: 'data',
  summary: 'A single number set large, with what it counts. The figure is the frame.',
  useWhen: [
    'making one number the story',
    'letting a single figure land on its own',
    'stating a statistic the narration has just said aloud',
  ],
  avoidWhen: [
    'comparing quantities between categories → bar_chart',
    'pairing a claim with a photograph → image_context',
    "letting a person's own words carry the frame → quote",
  ],
  supportsEvents: true,
  requiresAssets: false,
  occupiesRegions: ['full'],
  supportedCompositions: ['full'],
  minDurationFrames: 60,
  recommendedDurationFrames: 150,
};
```

`occupiesRegions: ['full']`, `supportedCompositions: ['full']`: honest opening, same
argument as `quote`. A `left`/`right` composed form is a designed frame plus a safe-area
render test, not a free declaration — `BarChartScene/meta.ts`'s header records what an
unpaid claim costs.

### `schema.ts`

```ts
export const statCounterSchema = z
  .object({
    value: z
      .number()
      .describe(
        'The number the frame carries, as a number — the scene formats it. An agent ' +
          'writing "1 in 3" is choosing typography the design system owns.',
      ),
    label: z
      .string()
      .max(80)
      .describe(
        'What the number counts, in one line. Always present — a number without a ' +
          'referent is the failure this scene exists to avoid.',
      ),
    unit: z
      .string()
      .max(12)
      .default('')
      .describe(
        "The unit set beside the value at a smaller step, e.g. '%', 'k', '°C'. Empty " +
          'for a bare count.',
      ),
    sublabel: z
      .string()
      .max(120)
      .default('')
      .describe(
        "One supporting line under the label, e.g. 'up from 19% in 2005'. Empty for none.",
      ),
    emphasis: z
      .enum(['neutral', 'positive', 'negative'])
      .default('neutral')
      .describe(
        'The semantic role the value reads in — its colour. Neutral for a plain figure.',
      ),
  })
  .strict();

export type StatCounterSceneProps = z.infer<typeof statCounterSchema>;
```

`.strict()` per the template header: it stops an agent smuggling a field the resolver
owns into an authored prop. `value` is a real number and required; the empty state is not
reachable through `value` (a number cannot be empty), so this capability's "empty" case
is an empty `label` — see examples.

---

## The ten files, in procedure order

Copy `_TemplateScene/` → `StatCounterScene/`, rename first (~58 tokens), then write in
this order.

### 1–2. `meta.ts`, `schema.ts`

As above, word-for-word once approved.

### 3. `constraints.ts`

```ts
export const statCounterConstraints: SoftConstraints = {
  label: {
    recommendedMin: 1,
    recommendedMax: 60,
    onEmpty: 'Typographic empty state; the frame shows a "stat pending" label.',
    onExceed: 'The label drops one step of the type scale.',
    onExceedCode: 'TITLE_DENSITY',
  },
  sublabel: {
    recommendedMax: 60,
    onExceed: 'Shorten the sublabel; it is support, not a second claim.',
  },
  unit: {
    recommendedMax: 6,
    onExceed: 'Shorten the unit; it is a suffix, not a word.',
  },
};
```

### 4. `layouts.ts`

One layout. A second arrangement with its own rhythm would be a different scene.

```ts
export const statCounterLayouts = {
  centered: {
    slots: ['eyebrow', 'value', 'label', 'sublabel'],
    description:
      'The value at display scale, its unit beside it, and what it counts beneath — ' +
      'centred, nothing else on the frame.',
  },
} as const satisfies Record<string, LayoutDef>;

export const statGeometry = {
  /** Share of the frame box the stat column gets. */
  columnRatio: 0.72,
  /** The value's ceiling on the type scale — a lone figure may go this loud. */
  valueStep: 6,
  /** The unit sits this many steps below the value. */
  unitStepDrop: 3,
} as const;
```

The value is one big number, so it does not use the length ladder in `titleFit.ts` (that
ladder is for prose that wraps). It is set at a fixed display step and the widest-*value*
fit is what guards it; the geometry above is the open question the stills answer.

### 5. `actions.ts`

One verb, no payload. Description, for approval:

```ts
export const statCounterActions = {
  revealStat: {
    description:
      'Bring the stat onto the frame. Use it to hold the number back until the ' +
      'narration says it; until then the label carries the frame.',
    payload: null,
  },
} as const satisfies Record<string, ActionDef>;
```

### 6. `state.ts`

One field, the auto-reveal pattern from the template: `null` only when the plan carries
the reveal event, so an eventless instance animates exactly as before.

```ts
export type StatCounterSceneState = { statFrame: number | null };
export const REVEAL_STAT_ACTION = 'revealStat';
```

No `readString` copy — the vocabulary has no payloads.

### 7. `checks.ts` — deleted

Per D5. The reason is written into `index.ts`'s header, the `quote` precedent.

### 8. `Component.tsx`

Shell per the template: `Backdrop` → `CameraRig` → `SlotFrame` → layout. Nothing visual
of its own; everything from L0/L1. A `ColumnProvider` at `statGeometry.columnRatio` of
the frame box, centred, top to bottom:

1. **Label** — set first, as the frame's standing element (analogous to `quote`'s
   eyebrow). It is what the held beat stands on while the plan keeps the number back.
2. **Value + unit** — `AnimatedText` at display scale, `tabular-nums`, `emphasisColor`,
   with the unit appended at `valueStep - unitStepDrop`. Enters one stagger after the
   label in the undriven case; gated on `revealStat` in the driven case.
3. **Sublabel** — body regular `inkMuted`, one stagger after the value.

Held back: `statFrame === null` renders the label and nothing else; the column keeps its
shape so nothing jumps when the stat lands.

Empty: `label === ''` renders `EmptyState` with message `Stat pending` — the bar-chart /
quote precedent.

Open question the stills answer, not prose: does the value want a short accent rule above
or below it, the way `BarChartScene`'s `Header` anchors its title? `EmptyState` already
draws a 1px rule via `mix()`, so a token-clean precedent exists. Decide from captures.

### 9. `examples.ts` — four, normative

| id | point |
| --- | --- |
| `example-stat-canonical` | A single rate, unit `%`, `editorialStatic`, no events |
| `example-stat-negative` | **Edge case** — a negative `emphasis` swing; the value reads in the negative colour |
| `example-stat-driven` | Same props as canonical + `spansBeats: ['b1','b2']`, one event `revealStat @ b2.start`. Beat 1 stands on the label; the number lands when the narration says it |
| `example-stat-empty` | **Empty case** — `label: ''`, renders the empty state |

### 10. `index.ts` + `registry.ts`

Assemble; drop `checks`. Add `statCounterCapability` to `src/scenes/registry.ts`. Then
`pnpm catalog` — not optional; only `catalog:check` catches skipping it.

---

## The ripple a fourth capability forces

Adding a capability makes five documents' hard-coded counts false. Per the handoff these
must be updated in the same change, and nothing fails when they rot:

- `AGENTS.md` — the "folder of N files" sentence (if it names a count)
- `CONTEXT.md` — "today's N capabilities"
- `docs/adding-a-capability.md` — the count sentence, its file table, its header
- `docs/measurement-gate.md` — measure 3's entry conditions (three places)
- `docs/render-surface.md` — Z6, "the load-bearing fact of any breadth judgement"

And `tests/render/safe-area.test.ts` needs the new `stat_counter composed into full under
{cinematic,pushIn}` rows added to its expected case list, or the suite fails with a diff
that looks unrelated.

## Not in scope

- `CONTEXT.md` — capability ids are not glossary terms; expected no edit beyond the count.
- `structural-examples.ts` — a new capability does not have to appear in the whole-plan
  examples. Skipped.
- `image_context`'s `avoidWhen` gaining `→ quote` or `→ stat_counter` — a published-
  contract edit to a second capability; separate decision, deliberately not bundled.
- A `left`/`right` composed form — see D-wording above.
- A count-up animation (the number climbing from 0 to its value). Tempting, and not a
  verb a beat has asked for; `revealStat` is the held-entrance the narration actually
  needs. If the stills argue for it, it is a later increment, not this one.

## Gates (all five, numbers not exit codes)

```
pnpm catalog:check                     # both projections up to date
pnpm -r typecheck                      # clean, 4 packages
pnpm vitest run --no-file-parallelism   # 431 + the new describe.each rows
pnpm test:render                       # 53 + the new safe-area rows; nothing accepted may move
npx biome check .                      # 9 errors is the baseline, not zero
```

## The visual loop — how "premium" gets verified

`catalog-contract.test.ts` proves the capability *works*. It cannot prove it is worth
watching; that claim is only paid by looking.

1. `pnpm grid` — the four examples appear in the component studio automatically.
2. Throwaway `renderStill` script in `packages/video/scripts/` (must live there), output
   to `.scratch/`, deleted after. Capture canonical and edge examples at 0/20/40/60/80/
   100%, in both themes.
3. Score against the frozen doc's §9.2 grid. Iterate on geometry/steps until it passes.
4. Only then, key frames: extend `tests/render/` with a stat-counter test on the
   `quote.test.ts` pattern — baseline **inside the hold**, plan's effect stated as a
   relation between hashes in both directions. Placeholder hashes `'0'.repeat(32)`, read
   the real hashes out of vitest's diff — and the user looks at the frames and says
   "accepted". A moved hash is a picture a human accepts, not a test to fix.

## Follow-up once green

- Run the `code-review` skill against the capability commit *before* committing, per the
  handoff — it found real defects the gates did not, last session.
- Commit with `git commit -F <file>` (here-strings inject a stray `@`). Never commit
  `vox_remotion_component_list_example.md`.
