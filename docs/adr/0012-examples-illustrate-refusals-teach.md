# ADR-0012 — Examples illustrate, refusals teach

**Status:** accepted · 2026-08-15
**Scope:** what the catalog's examples are obliged to cover, and what may be left to the
compiler's refusals instead. No schema changes, no new checks, no anchor form changes, and
`manifestVersion` stays at **4** — nothing about the manifest's shape moves.

## Context

Rule 2 says the agent sees the manifest and never the code, and §6.3 says examples are
worth more than descriptions. Read together they suggest a stronger obligation than either
states: that anything the agent must write should be *demonstrable in an example*.

A catalog example cannot meet that obligation, and the reason is structural rather than
incidental. An example is a bare `SceneInstance` with no take. `ExampleScene` synthesises
its beat table with `syntheticBeats` (`packages/video/src/core/anchors.ts`), which returns
`words: []` on purpose — nothing about a duration says when a word was spoken, and a
fabricated onset would be a number indistinguishable from a measured one, cutting the
picture against the wrong syllable. A word anchor against that table therefore throws.

So a **deictic field** can never be illustrated correctly by a scene example. The two
capabilities show the two available shapes of the same gap:

- `bar_chart` illustrates the gesture with the wrong anchor. `example-rent-burden` and
  `example-annotated-comparison` (`scenes/BarChartScene/examples.ts`) both anchor
  `highlightBar` at `b3.start`, a boundary. Each renders; each would be refused by
  `DEICTIC_ANCHOR_REQUIRED` inside a real plan.
- `image_context` omits the gesture. Its examples drive `revealImage` and `revealCopy` and
  leave `emphasize` out, because the honest anchor for it cannot be written here.

**This reads as a hole in the catalog, and it was read as one.** On 2026-08-15 a structural
plan example, `image-context-emphasis-plan`, was written specifically to teach `emphasize`
where a beat with real text could carry the word anchor. It was removed the same session
once the existing channels were actually looked at. This ADR exists so the next reader does
not write it again.

## Decision

**The manifest and the compiler's refusals are one teaching surface, and examples are one
channel of it rather than the whole of it.** An example illustrates the shape of a plan. It
carries no obligation to be a plan the compiler would accept in every context, and no
obligation to exercise every action a capability publishes.

For the case that provoked this, three channels already teach the word anchor, and they
teach it more precisely than an example could:

1. **The grammar publishes the form and its own example.** `core/anchor-grammar.ts` ships
   the `<beatId>.word:<word>` form with `examples: ['b2.word:London']`, plus the rules an
   example cannot express — that the word must appear in the beat exactly once, that the
   form takes no offset, and that an event belonging slightly later should name the next
   word.
2. **The check registry publishes the repair.** `DEICTIC_ANCHOR_REQUIRED` in
   `core/compiler-checks.ts` carries `means` and `repair`, and the repair names where to
   look: *"Move the event to one of the word anchors listed in expected."*
3. **The refusal carries the answer.** `checkDeicticLanding` (`catalog/validate.ts`)
   computes `expected` against the plan's own beats and payload — the literal list of
   anchor strings that would satisfy the rule, for this scene, in this plan.

An agent that copies a boundary anchor out of a scene example is therefore told the exact
string to write instead, on its first compile, against its own text. That is rule 5's loud
half working as designed, and it costs one round trip.

### Considered and rejected

**A structural plan example per deictic action.** Built and removed, as above. Rejected on
rule 1: the word form, its constraints and its repair are already published in three
places, and a fourth copy is a fourth thing to keep in step. It also scales the wrong way —
the obligation would attach to every deictic action any future capability declares, which
is precisely the per-capability bookkeeping `deicticFields` was moved onto the action to
escape.

**Give catalog examples a synthetic word table so a word anchor resolves.** Rejected, and
the argument is already written where it belongs, in `syntheticBeats`. A synthetic onset
looks exactly like a measured one. Splitting a duration across beats produces a *plausible*
beat table, which is all an isolated example needs; there is no equivalent for words.

**Hold `validateScene` to the landing rule, so a wrong example cannot exist.** Rejected,
and `catalog/validate.ts` already records why: an instance with no take cannot carry a word
anchor, so enforcing landing at instance level would make a pointing action impossible to
*illustrate at all*, and the catalog could not teach the gesture it was enforcing. It would
also delete two working `bar_chart` examples to fix a problem the compiler already reports.

**Say nothing and let each reader work it out.** Rejected because one reader already did
not: the gap was read as a defect and duplicate teaching surface was written before it was
caught. A structural quirk that looks like a bug is exactly the thing an ADR is for.

## Consequences

- **`bar_chart`'s boundary anchors on `highlightBar` are deliberate and stay.** They are
  not a defect and not a migration waiting to happen. Anyone "fixing" them will break two
  rendering examples to no end.
- **A new deictic action creates no obligation to add a plan example.** It creates the
  obligations §15 already lists, and nothing more.
- **The round-trip cost is asserted, not measured.** The claim that one refusal is cheaper
  than a fourth copy of the rule assumes the agent reads `expected` and repairs on the
  first pass. "Actions inventées" is already one of the step 9 harness's four measures, and
  this is adjacent to it: if agents are found to copy a boundary anchor out of an example
  and then fail to act on the refusal, that is evidence against this decision and it should
  be reopened, not worked around.
- **This says nothing about capabilities the manifest describes badly.** The decision is
  that a *refusal* may carry a lesson an example cannot. It is not licence to leave an
  action description, a `.describe()` string or a soft constraint thin on the grounds that
  the compiler will catch it — those are the surface the agent reads *before* it writes,
  and rule 2 is unchanged.
