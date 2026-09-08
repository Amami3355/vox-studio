# What is the smallest Studio that makes the result feel exceptional?

Parent: [Vox Studio: a visible result first, ready for the September 9 hackathon](../map.md)
Type: prototype
Label: wayfinder:prototype
Mode: HITL
Status: open
Assignee: none
Blocked by: 02, 04

## Question

Produce a cheap visual artifact for the user to react to, then choose a single end-user workspace for Brief entry, truthful production progress, readable sources, SceneInstance/storyboard inspection, video playback/download and actionable pause/failure states.

`apps/component-studio` is a developer SceneCapability gallery, not this application. Reuse the existing visual language and web stack where useful, but keep production implementation and credentials out of crew and browser bundles. Decide whether one image-approval moment or one tightly bounded SceneInstance edit earns its implementation cost; generic chat editing and a timeline editor are not assumed. Cover fresh, working, awaiting approval, rendered, declined and failed states. End with an approved interaction/layout, not a production frontend.

## Comments

2026-09-08: The user requested construction of the Studio and confirmed private workspace
access. Implementation now lives in `apps/studio`, with a durable Python API and separate worker.
Local interface, hosted private access, persistent sessions, worker connectivity and actual
historical-media playback are verified. A fresh authorized trial is waiting for human image
approval; complete production and the final rehearsal remain open. See
[implementation evidence](../proofs/studio-progress-2026-09-08.md).

2026-09-07: Prioritize the real output: a Brief, actual progress, sources, an image-approval card and a player are the first Studio proposal. Layout exploration can start before the durable API contract is final; final integration depends on it. A fixture-backed shell must be labelled as such and cannot replace the first real video proof. Voice migration is not a dependency. Deliver the actual product through the milestones in [The shortest route to a visible result](../route.md), rather than treating prototype approval as a completed Studio.
