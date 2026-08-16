# Spec — the `quote` capability

Type: spec · 2026-08-16 · branch `quote-scene` (off `dev` @ `487babf`)

The third SceneCapability: a pull-quote scene. Typography-only, no assets, almost no new
L1. Chosen because the frozen doc's catalogue strategy (§14: 8–12 robust capabilities,
not 40 average ones) names exactly this kind of scene — `editorialStatic`'s own intent
string reads "Declaration, quote, isolated figure" — and because a third capability is
what `docs/measurement-gate.md` measure 3 needs to become closable.

The procedure is `docs/adding-a-capability.md`. Nothing in it is restated here except
where this capability forces a decision. "Premium" is treated as a property verified in
the visual loop (§11 below), not asserted in prose.

## Decisions that need approval before any file is written

`meta.ts` and `schema.ts` wording is published to the agent. Per the procedure, these two
files' strings are approved first, then the other eight are written. Recommended answers
are marked ←. Everything else in this spec follows from them.

### D1 — id, name, family

- ← `quote` / `QuoteScene` / family `typography`. Short, agent-readable, sits naturally in
  `avoidWhen` redirects elsewhere (`letting the speaker's words carry the frame → quote`).
- `pull_quote` / `PullQuoteScene` — more precise in print-jargon, less obvious to an agent
  that does not know the term.

### D2 — props

Four fields: `eyebrow`, `quote`, `attribution`, `role`. All but `quote` optional.

`layout` and `motionProfile` stay **out** of the schema — they live on the SceneInstance,
per the note in `BarChartScene/schema.ts`'s header.

← Include `eyebrow`. It is what the frame stands on while a plan holds the quote back
(see D3); without it the held beat renders an empty frame.

### D3 — action vocabulary

- ← **`revealQuote` only.** One verb a beat genuinely asks for ("hold the words back until
  the narration hands over to them"). Attribution arrival is designed choreography — it
  always enters one stagger after the quote — not a plan decision. `state.ts` keeps one
  field; `checks.ts` is deleted (D5).
- `revealQuote` + `revealAttribution`. More plan control, but a second verb whose held
  case (attribution before quote) no example can make read as deliberate, and no beat in
  the vertical slice has asked for.

No deictic verb. A word-stamp on a quote cannot be illustrated in `examples.ts` at all
(ADR-0012), and `image_context`'s `emphasize` already carries that open thread. Do not
inherit it here.

### D4 — durations

← `minDurationFrames: 90`, `recommendedDurationFrames: 180`. A quote demands reading time;
90 is the bar_chart floor, 180 is six seconds. Both numbers are provisional until §11's
stills say otherwise.

---

## The proposed wording (verbatim, for approval)

### `meta.ts`

```ts
export const quoteMeta: SceneMeta = {
  id: 'quote',
  name: 'QuoteScene',
  family: 'typography',
  summary: "A single quotation set large, with who said it. The words are the frame.",
  useWhen: [
    "letting a person's own words carry the frame",
    'handing the narration over to a testimony, verdict or declaration',
    'slowing the film down for one sentence that deserves to stand alone',
  ],
  avoidWhen: [
    'comparing quantities between categories → bar_chart',
    'pairing a claim with a photograph → image_context',
    'making one number the story → stat_counter',
  ],
  supportsEvents: true,
  requiresAssets: false,
  occupiesRegions: ['full'],
  supportedCompositions: ['full'],
  minDurationFrames: 90,
  recommendedDurationFrames: 180,
};
```

`stat_counter` does not exist yet; redirecting to an unbuilt capability is the house
style — `bar_chart`'s own `avoidWhen` already points at `line_chart`, `stat_donut`,
`stat_counter`, `timeline`.

`occupiesRegions: ['full']`, `supportedCompositions: ['full']`: honest opening. A
`left`/`right` composed form is a designed frame plus a safe-area render test, and is a
later decision, not a free declaration — `BarChartScene/meta.ts`'s header records what an
unpaid claim costs.

### `schema.ts`

```ts
export const quoteSchema = z
  .object({
    quote: z
      .string()
      .max(240)
      .describe(
        "The quoted words, without quotation marks — the scene draws its own mark. " +
          'Best under 110 characters; beyond that the type scale drops a step ' +
          'automatically. An empty string renders a typographic empty state.',
      ),
    attribution: z
      .string()
      .max(60)
      .default('')
      .describe(
        'Who said it, as a name or short identifier. Empty makes the quote anonymous — ' +
          'use that only when the narration itself names the speaker.',
      ),
    role: z
      .string()
      .max(60)
      .default('')
      .describe(
        "One line of context under the attribution, e.g. 'Housing minister, 2021–2024'. " +
          'Empty for none.',
      ),
    eyebrow: z
      .string()
      .max(40)
      .default('')
      .describe(
        "Optional small label above the mark, e.g. 'The testimony'. Carries section " +
          'context while the quote is held back.',
      ),
  })
  .strict();
```

`.strict()` per the template header: it stops an agent smuggling a field the resolver
owns into an authored prop.

---

## The ten files, in procedure order

Copy `_TemplateScene/` → `QuoteScene/`, rename first (~58 tokens; `centeredGeometry` keeps
its name — the layout *is* centred), then write in this order.

### 1–2. `meta.ts`, `schema.ts`

As above, word-for-word once approved.

### 3. `constraints.ts`

```ts
export const quoteConstraints: SoftConstraints = {
  quote: {
    recommendedMin: 1,
    recommendedMax: 110,
    onEmpty: 'Typographic empty state; the frame shows a "quote pending" label.',
    onExceed: 'The quote drops one step of the type scale.',
    onExceedCode: 'TITLE_DENSITY',
  },
  attribution: {
    recommendedMax: 40,
    onExceed: 'Shorten the attribution; it is a signature, not a bio.',
  },
  role: {
    recommendedMax: 40,
    onExceed: 'Shorten the role line; it is context, not a second quote.',
  },
  eyebrow: {
    recommendedMax: 24,
    onExceed: 'Shorten the eyebrow; it is a label, not copy.',
  },
};
```

### 4. `layouts.ts`

One layout. A second arrangement would be a different scene.

```ts
export const quoteLayouts = {
  centered: {
    slots: ['eyebrow', 'mark', 'quote', 'attribution'],
    description:
      'Eyebrow over an oversized quotation mark, the quote at display scale, and the ' +
      'attribution below — centred, nothing else on the frame.',
  },
} as const satisfies Record<string, LayoutDef>;

export const centeredGeometry = {
  columnRatio: 0.72,
  /** The mark's ceiling — always one louder than the quote, never louder than this. */
  markStep: 6,
} as const;
```

> **Implemented change vs this spec — no quote ceiling.** The first version
gave the quote `quoteCeilingStep: 6`, so a long quote wrapped to ~18 lines of 168px
and overflowed the canvas — the safe-area quiet border caught it. The length ladder in
`titleFit.ts` is what stops a paragraph from doing that, so `SceneTitle` gets no `maxStep`
and the fit is run length-first. The mark stays proportional off that step. A quote tops
out at step 5 (120px); a lone spoken figure can go a step louder and still holds.

### 5. `actions.ts`

One verb, no payload. Description, for approval:

```ts
export const quoteActions = {
  revealQuote: {
    description:
      'Bring the quote onto the frame, with its mark and attribution. Use it to hold ' +
      'the words back until the narration hands over to them; until then the eyebrow ' +
      'carries the frame.',
    payload: null,
  },
} as const satisfies Record<string, ActionDef>;
```

### 6. `state.ts`

One field. The auto-reveal pattern from the template: `null` only when the plan carries
the reveal event, so an eventless instance animates exactly as before.

```ts
export type QuoteSceneState = { quoteFrame: number | null };
export const REVEAL_QUOTE_ACTION = 'revealQuote';
```

No `readString` copy — the vocabulary has no payloads. This capability therefore does
**not** force the extraction question noted as an open thread in the handoff.

### 7. `checks.ts` — deleted, and that is the honest answer

The template's check exists because its stamp is mounted *inside* the statement's gate:
an emphasis written before the reveal renders nothing. Here the quote is the only gated
element and nothing references it — no payload names a field, no second element lives
inside its gate. A held-back quote followed by nothing is a quiet frame for one beat,
which is a legitimate editorial hold, not a false promise. An absent `checks.ts` is
honest; an invented one teaches the agent a rule that is not true (rule 2).

### 8. `Component.tsx` — where "premium" is earned

Shell per the template: `Backdrop` → `CameraRig` → `SlotFrame` → layout. Nothing visual
of its own; everything from L0/L1. The frame, top to bottom, in a `ColumnProvider` at
`0.72` of the frame box:

1. **Eyebrow** (optional) — `Eyebrow` primitive, unchanged. First entrance.
2. **The mark** — a single `“` glyph, display font, bold, `theme.color.accent`, one
   scale step louder than the quote's fitted step (capped at 6), set flush-left above the
   quote. This is the scene's device: it is what makes a viewer read *quotation* before
   reading a word. Drawn with `AnimatedText` so its entrance clips and rises like the
   rest. Size comes only from the type scale — no hand-picked px.
3. **The quote** — `SceneTitle` (display, bold, tight tracking) with **no `maxStep`**:
   the length ladder sizes it (short → 120px, long → 48px), the widest-word fit stops
   clipping, and `break-word` is the last resort. A ceiling was tried and removed — see
   the note above the geometry.
4. **Attribution** — name in body medium `ink`, role in body regular `inkMuted`, one
   `AnimatedText` block entering one stagger after the quote.

Choreography is entirely the motion profile's: `editorialStatic` (the quote's home
profile) enters eyebrow → mark → quote → attribution at `stagger.base`, spring `settle`,
camera `none`. `impact` collapses the four into `unison` — the composition landing as one
block is exactly what that profile is for.

Held back: `quoteFrame === null` renders the eyebrow and nothing else; the column keeps
its shape so nothing jumps when the quote lands (template pattern).

Empty: `quote === ''` renders `EmptyState` with message `Quote pending` — the bar-chart
precedent (a legitimate state degrades typographically, never to black).

Open question the stills answer, not prose: does the attribution want a short rule above
it? `EmptyState` already draws a 1px rule via `mix()`, so a token-clean precedent exists.
Decide from captures, not from a feeling.

### 9. `examples.ts` — four, normative

| id | point |
| --- | --- |
| `example-quote-canonical` | ~55-char quote, attribution + role, `editorialStatic`, no events |
| `example-quote-long` | **Edge case** — ~180-char quote; the fit drops the scale and the frame still holds |
| `example-quote-driven` | Same props as canonical + `spansBeats: ['b1','b2']`, one event `revealQuote @ b2.start`. Beat 1 stands on the eyebrow; the words land when the narration hands over. Differing from canonical only in events isolates the verb |
| `example-quote-empty` | **Empty case** — `quote: ''`, renders the empty state |

### 10. `index.ts` + `registry.ts`

Assemble; drop `checks`. Add `quoteCapability` to `src/scenes/registry.ts`. Then
`pnpm catalog` — not optional; only `catalog:check` catches skipping it.

---

## Not in scope

- `CONTEXT.md` — capability ids are not glossary terms; expected no edit. If one happens
  anyway: `pnpm catalog`, the glossary is a published contract.
- `structural-examples.ts` — a new capability does not have to appear in the whole-plan
  examples. Skipped.
- `image_context`'s `avoidWhen` gaining `→ quote` — a published-contract edit to a second
  capability; separate decision, deliberately not bundled into this change.
- A `left`/`right` composed form — see D-wording above.
- The `stat_counter` scene — the next capability, not this one.

## Gates (all five, numbers not exit codes)

```
pnpm catalog:check                     # both projections up to date
pnpm -r typecheck                      # clean, 4 packages
pnpm vitest run --no-file-parallelism   # 406 + the new describe.each rows
pnpm test:render                       # 45 pass; nothing accepted may move
npx biome check .                      # 9 errors is the baseline, not zero
```

## 11. The visual loop — how "premium" gets verified

`catalog-contract.test.ts` can prove the capability *works*. It cannot prove it is worth
watching; that claim is only ever paid by looking.

1. `pnpm grid` — the four examples appear in the component studio automatically
   (registry-derived). Check port: stale dev servers on 5273/5274 mimicked a missing
   example last session; suspect the tab before the code.
2. Throwaway `renderStill` script in `packages/video/scripts/` (must live there —
   `@remotion/bundler` resolves from the script's own location), output to `.scratch/`,
   deleted after. Capture the canonical and long examples at 0/20/40/60/80/100%, in
   **both** themes (`editorial-paper` is the default; `editorial-cold`'s accent still has
   to carry the mark).
3. Score against the frozen doc's §9.2 grid: one dominant element in 200 ms · generous
   margins, nothing touching edges · staggered timing, nothing frozen · display:body
   contrast ≥ 3:1 · no colour outside tokens. Iterate on geometry/steps until it passes.
4. Only then, key frames: extend `tests/render/` with a quote test on the
   `image-context.test.ts` pattern, placeholder hashes `'0'.repeat(32)`, read the real
   hashes out of vitest's diff — and the user looks at the frames and says "accepted". A
   moved hash is a picture a human accepts, not a test to fix.

## Follow-up once green

- Re-check measure 3 in `docs/measurement-gate.md`: selection relevance needs briefs
  where two capabilities are plausible. With three registered, state whether it closes.
- Run the `code-review` skill against `HEAD` before committing, per the handoff — it
  found a real bug the gates did not, last session.
- Commit with `git commit -F <file>` (here-strings inject a stray `@`). Never commit
  `vox_remotion_component_list_example.md`.
