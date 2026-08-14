# Publish the duration-repair rule as it was decided

Type: task
Status: open
Blocked by: none

## Objective

`protocol.ts:188` publishes a compressed paraphrase of a decision ticket 06 already took and the
user confirmed. The compression loses the part that matters, and inverts it: the published string
recommends the one operation the decision excludes. Under rule 2 the contract is what a code-blind
agent learns from, so this teaches a rule that is not true.

Make the published string say what the decision says, and give the sentence one definition instead
of two.

## The decision, as taken

`.scratch/agent-production-interface/issues/06-bind-artifacts-retries-and-resume.md`, grilling
round 5 — recorded as user-confirmed on 2026-08-13:

> Every plan change stales validation, Preflight, compilation and rendering. A Take stays reusable
> exactly while ordered Beat texts, segmentation and voice settings remain identical. Visuals,
> assets, capability props, events, Sections, SceneInstances and their Beat spans may change; a
> Beat-id rename needs only a new fold. **The preferred duration repair reassigns existing Beats,
> extends a SceneInstance over an existing Beat, or merges adjacent SceneInstances without changing
> Beat records.** Text, whitespace, punctuation, Beat order, split/merge segmentation or voice
> changes create a new Recording input and stale the old Take for the active plan.

Three operations, all of which leave `plan.beats` untouched and therefore preserve the Take. The
compiler's own check registry says the same thing in the same vocabulary
(`packages/video/src/core/compiler-checks.ts:93`):

```ts
repair: 'Give the scene more narration time, usually by merging adjacent beats into its span.'
```

`into its span` — the beat moves into a scene's span. And `packages/video/src/compile/index.ts:309`:
`Give it another beat, or merge it with the scene beside it.` **It** is the scene.

## What is published instead

`packages/production/src/contracts/protocol.ts:188`:

```ts
preferredDurationRepair: 'reassign or merge existing Beats before changing narration text',
```

`merge existing Beats` reads naturally as *concatenate two Beat texts* — which is precisely what
the decision rules out (`without changing Beat records`), and which
`06:452` lists among the changes that "create a new Recording input and stale the old Take".

So an agent following the published string, in the situation the string is written for, performs
the one repair that costs it a paid dispatch. ADR-0002's amendment of 2026-08-13 named this exact
species of defect one level up: *"publishing a rule the compiler does not apply teaches a rule that
is not true."*

## Why the misreading is not hypothetical

It has already happened, with more information available than an agent will ever have.

On 2026-08-14 this ticket was filed under a different title, arguing at length that the rule
recommended an operation that forfeits the Take. That argument was wrong, and it was wrong in a way
worth recording: the misreading is **self-consistent**. Recording-input identity really is keyed on
the Beat text array (`run-store/identities.ts:9`), reuse really is gated on it
(`commands/service.ts:378`), and `verifyRunTake` really does fail with `'text or segmentation'`
(`packages/voice/src/run-take.ts:116`). Every check a careful reader performs on the wrong reading
confirms it, and yields a plausible cost analysis of a problem that does not exist.

An agent that has read only `contract show protocol` has strictly less to go on, cannot reach
ticket 06, and cannot reach `compiler-checks.ts`. Rule 2 is not a courtesy here — it is the reason
the published string has to carry its own meaning.

## The same sentence exists twice

`packages/production/src/preflight/preflight.ts:218` and `:221` carry the guidance again, worded
differently and derived from nothing shared:

```ts
'Risk: the point estimate is below the capability minimum. Reassign or merge existing Beats
 before recording; revise text only when editorial intent warrants it.'
```

Preflight's version is the better of the two — it says **before recording**, which places the
repair correctly, and it adds that revising text is an editorial decision rather than a fallback.
Neither site derives from the other. Rule 1 says the schema is the single source of truth and that
props, manifest, validation and docs are generated from one object; this sentence is a small,
live counter-example, and it is the mechanical cause of the drift above.

`ANCHOR_GRAMMAR` / `ANCHOR_EXPECTATION` in `packages/video/src/core/anchor-grammar.ts` is the shape
this repository already chose for exactly this problem: the grammar is data, and every audience's
sentence is generated from it.

## Scope

- Make the published string name the operations the decision names — reassigning a Beat, extending
  a SceneInstance over an existing Beat, merging adjacent SceneInstances — and say plainly that
  changing Beat text is a new Recording input.
- Give the sentence **one** definition, with `protocol.ts` and `preflight.ts` both derived from it.
- While there: `takeRemainsReusableWhen` says `segmentation`, which is the same word ticket 06 uses
  for `split/merge segmentation`. Decide whether it needs the same disambiguation, since an agent
  reading `segmentation` beside `merge existing Beats` has two chances to reach the wrong meaning.

## Acceptance

An agent that has read only `contract show protocol` — no repository, no ADR, no issue tracker —
can name which duration repairs preserve its Take and which spend a dispatch, and gets it right.
The sentence has one source, and `preflight.ts` no longer carries a second wording.

## Does not claim

No behaviour changes. No evidence bundle is affected, and no recorded run has ever performed either
reading of the repair.

It does **not** claim that Recording-input identity is wrong. Keying on the ordered Beat text array
is the decision of ticket 06, user-confirmed, and `'text or segmentation'` at `run-take.ts:116` is a
deliberate, correctly named check. This ticket is about what is published, not about what is
enforced.

## Comments

### Opened 2026-08-14

Filed first as `24-reconcile-beat-merging-with-take-identity`, arguing that
`preferredDurationRepair` was a post-payment rule recommending an operation that destroys the Take.
A review found both premises false: `preflight.ts:218` emits the guidance **before recording**, and
ticket 06 defines `merge` as merging adjacent SceneInstances without touching Beat records. The
larger ticket is withdrawn; what survives is this, and it is smaller and real.

Recorded because the failure mode is the ticket's own evidence: a reader with the whole repository
open still reached the wrong meaning from that string, and only ticket 06 settled it.
