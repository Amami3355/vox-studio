# ADR-0005 — The asset generation loop

**Status:** accepted · 2026-08-12
**Scope:** where the pictures come from, who writes the prompt, what gets committed, and
which of the two asset types a plan is allowed to carry. Nothing about how a scene *uses*
an asset once it has one — that is `core/assets.ts` and it is unchanged.

Closes ADR-0004's last consequence, which left the PRD's stale *"Google image-generation
capabilities lorsque nécessaire"* line to "whatever documents the asset generation loop".
This is that document.

## Context

Two things forced this.

**The decisions existed and the repository did not have them.** The loop below was settled
in a grilling session on 2026-08-11 and recorded nowhere but a handoff file in the OS
temp directory, carried forward by hand through three sessions on the understanding that
one temp cleanup would lose it. Everything in *Decisions* is that conversation written
down, not a new position.

**A review found the hole the missing document was hiding.** An adversarial review of the
vertical slice pointed at `plans/vertical-slice.plan.json`, where the narrator carries

```json
"asset": { "status": "ready", "uri": "data:image/svg+xml,…" }
```

`core/assets.ts` states the boundary in its own words — an `AssetRequirement` is *semantic*
and agent-authored, an `AssetRef` is *runtime* and resolver-produced, and **"the agent
writes the first and may never write the second"**. The plan writes the second. It is not
an oversight in that one file: `PersistentElement.asset` is typed `AssetRef`, so the plan
schema *offers* the channel, and `catalog/validate.ts` contains no validation of `asset` at
all — `checkPlacements` checks anchors and slots and stops there. `scripts/render-demo.mts`
does the same thing for its narrator, so the pattern predates the plan and is a standing
hole rather than something the slice introduced.

The two are the same problem seen from either end. A persistent element has no way to say
*what picture it needs*, so the only way to give it one is to hand it a location — and a
loop that generates pictures from semantics has nothing to read for characters.

## Decisions

**1. Assets are AI-generated, with a human in the loop, and the generated files are
committed.** Not fetched at render time, not resolved from a CDN. `assets/library.ts`
already promises that "a clone renders the same frames as CI with no credentials, no
network and no fixture wiring", and committing the output is the only thing that keeps that
true once the vector stand-ins are replaced. The human in the loop is not ceremony: an
editorial picture that is merely plausible is worse than a placeholder, because a
placeholder is honest about being one.

**2. The prompt is derived deterministically; the agent supplies only the subject.** A
prompt is built from the `AssetRequirement`'s own semantics — `type`, `treatment`,
`orientation` — plus the aspect ratio of the slot the asset will occupy, plus the
`editorial-cold` palette. The agent contributes `subject` and nothing else.

This is rule 1 applied to pictures. If the agent wrote whole prompts, the look of the film
would live in whatever sentence an LLM produced that afternoon, and the design system would
be a suggestion. Deriving the rest means two requirements with the same subject in the same
slot produce the same prompt, which is what makes a regenerated asset a *replacement* and
not a new creative act.

**3. One image per `identityKey`, never per scene.** The resolver's identity cache already
makes this true at render time; this is the same rule pushed back into generation, so the
loop never produces two pictures of a thing that is meant to be one thing. A requirement
with no `identityKey` is a one-off, and that is a legitimate state — but a *character* that
recurs without one is a bug in the plan, not in the loop.

**4. The `ASSET_PLACEHOLDER` warnings are the worklist.** There is no second inventory of
what needs drawing. Compile the plan, read the warnings, generate exactly those, commit
them, compile again; the warnings go quiet when the work is done. A separate manifest would
be a second source of truth for a question the compiler already answers, and would drift
the first time somebody edited a plan without updating it.

**5. A plan carries requirements, never references — for persistent elements exactly as
for scenes.** `PersistentElement.asset?: AssetRef` becomes an `AssetRequirement`, resolved
by the same resolver that serves scene props, and the resolved `AssetRef` travels beside
the plan in the compiled document rather than inside it.

This is `core/assets.ts`'s boundary applied where it had simply never been carried out. The
asymmetry was silent because it type-checked: a scene had to go through the resolver to
get a picture and an element could be handed one, so the element was. Three things follow
and all three are the point — a character becomes eligible for decision 3's identity
sharing, it appears in decision 4's worklist like everything else, and a plan stops being
able to smuggle a `data:` URI past a schema that never looked.

**6. The PRD's Visual assets line is updated by this document**, per ADR-0004's deferral.
The provider is not named here. Which model draws the picture is a decision with none of
rule 1's weight — the loop's shape, the determinism of the prompt and the committing of
the output are what the film depends on, and all three survive a change of provider.

## Considered options

**Validate `AssetRef` in the plan schema instead of removing the channel.** Rejected. It
closes the review's literal complaint — an unvalidated runtime reference — while keeping
the thing that made it possible: a plan that can name a location at all. A validated
`data:` URI in a plan is still the agent writing the second type.

**Leave persistent elements as they are and document the exception.** Rejected. The
exception has no argument behind it. It exists because `PersistentElementLayer` was built
before the resolver and nobody revisited the type, which is a reason for how it happened
and not a reason to keep it.

**Generate on demand at render time, cache locally.** Rejected. It trades the offline
guarantee for disk space, and it makes the first render on a fresh clone depend on a
credential, a network and a provider's uptime — three ways for a demo to fail at the
moment it is being watched.

## Consequences

- **`PersistentElement` changes shape, and so does the vertical slice's JSON.** The
  narrator's inline `data:` URI becomes a requirement with an `identityKey`, and the SVG
  moves into `assets/library.ts` beside the housing stand-in. Until that lands, the plan
  carries a reference the boundary forbids, and this document is ahead of the code.
- **The resolver's scope widens from a `SceneInstance` to anything carrying requirements.**
  `resolveSceneAssets` takes a scene today; a section's persistent elements need the same
  service from the same identity cache, or two narrators in one section could resolve
  differently — which is the exact bug the identity-first rule exists to prevent.
- **`SceneRenderer`'s `MISSING_ASSET_REFERENCE` guard has no counterpart for elements.**
  `CompiledVideo` draws nothing for an element with no asset and says so is deliberate
  ("inventing a stand-in here would be the runtime deciding"). Once elements carry
  requirements, an unresolved one is a warning at compile time rather than a silent
  absence at render time.
- **A character still fills its whole slot.** `PersistentElementLayer` fits the asset to
  the slot rect, so an element at `left` occupies half the canvas. Nothing here changes
  that, and it is the wrong thing to judge against a placeholder — but the generated art
  arrives through this loop, and it is the first time real character art will be looked at.
- **The hackathon's Google Cloud requirement is not addressed here.** PRD §2/§17 require
  agent orchestration on Gemini and Google Cloud Agent Builder/ADK, which is a separate
  commitment from where a picture comes from. Naming an image provider in this document
  would blur two decisions that have different deadlines and different risks.
