# 06 — What `occupiesRegions: ['full']` hands to the compiler

Status: ready-for-agent

Blocked by: nothing here. This ticket exists to hand a fact forward, not to change this
capability.

`ImageContextScene` declares `occupiesRegions: ['full']` and
`supportedCompositions: ['full']`. A review flagged this as under-specified, on the
grounds that `splitLeft` is really a 7/5 division and `BarChartScene` declares
`['bottom','left']` / `['full','left','right']`.

**It is not a defect, and the metadata should not be changed.** `splitLeft` divides the
*whole frame*: image left, copy right, no quadrant left empty. Declaring `left` would
tell the compiler a corner is free while a headline sits in it — which is the failure the
declaration exists to prevent. Coexistence with a persistent element is bought through
`safeArea`, which this scene already consumes: the compiler shrinks the frame and the
layout reflows.

What follows is therefore a *compiler* decision, and it is the same one the spec listed
as out of scope and the handoff ranks as open question 2:

> when a persistent element sits in `cornerBR` and a scene occupies `cornerBR`, which one
> yields, and by what rule?

For this capability the answer cannot be `SLOT_RELOCATED` — there is nowhere to relocate
to. Either the compiler emits `PERSISTENT_ELEMENT_HIDDEN` for the duration of a `full`
scene, or it carves a safe area out of the scene and accepts a tighter composition. Decide
it immediately before the Section runtime, not inside it.

## Comments

Rationale recorded in `meta.ts` so the next reader does not re-litigate it from the
layout geometry alone.
