# Vox Studio: a visible result first, ready for the September 9 hackathon

Label: wayfinder:map
Status: open

## Destination

Chart the shortest delivery route to a real narrated preview the user can watch, then a deployed Studio that takes a Brief through the hosted ADK crew to that result. The user's latest target is publication tonight, September 8 into September 9, Tunis time. The separately recorded event cutoff remains September 9; it is not the working publication target. Keep explicit evidence for each milestone.
The map records decisions and delivery priorities; it does not claim implementation, deployment or eligibility is complete.

## Notes

- September 9 follow-up: [full model capacity and section authoring](proofs/section-authoring-2026-09-09.md)
  are implemented locally. SceneAuthor/PlanRepair receive 65,536 tokens on the supported model
  pins; section checkpoints support bounded recovery, and Studio accepts targets through five
  minutes. Hosted deployment and a live completed-film proof remain separate outstanding work.

- September 9: the user's rocket trial exposed a truncated SceneAuthor response before PlanRepair.
  [Automatic bounded response recovery](proofs/model-response-recovery-2026-09-09.md) is implemented
  locally with replay tests and a tool to prepare the same Run under its existing authorization.
  Deployment and paid continuation remain outstanding; the live checkpoint and journal are unchanged.

- September 8 deployment: [limits and correction controls are now hosted](proofs/studio-limits-deployment-2026-09-08.md).
  Protocol 4, the dedicated worker/Production key, pinned images, signed connectivity, browser
  controls and preserved journals were verified without providers. The saved rocket Brief has
  **Authorize and start**. The user's live end-to-end trial remains next.

- Requested and updated 2026-09-07. The confirmed event, deadline, rules assessment and user-directed delivery order are recorded in [What result comes first for the September 9 hackathon?](issues/02-name-the-demo-and-release-envelope.md).
- Use wayfinder, grilling and domain-modeling; use research/find-docs for external facts. Keep the glossary in `CONTEXT.md` and the six architectural rules. The frozen architecture is background; later accepted ADRs and current code establish the actual boundary.
- This update records the user's instruction to prioritize a visible result. Remaining decisions stay open only for their actual unresolved scope; do not repeat the completed rules/deployment investigation or require a voice migration before the first video. Concrete delivery milestones and their exit evidence live in the route. Host and access recommendations are not silently accepted decisions.
- Proposed release envelope: authenticated, controlled hackathon access, real provider calls, durable work, bounded spending, browser refresh/restart recovery, and playable/downloadable output. Whether arbitrary public self-service is required is still a user question.
- Implementation commits on `feat/adk-production-crew`: prior work saved in `74dade4`, private Studio saved in `4679d88`. The [private hosted Studio](proofs/studio-progress-2026-09-08.md) generated the lightning/thunder preview, which the user can watch. Image decisions are complete. Its final review/correction is blocked; [the diagnosis](proofs/studio-final-block-diagnosis-2026-09-08.md) establishes a cropped-out observer and a subsequent invalid correction. The historical [September 8 hosted video](proofs/milestone-2-delivery-2026-09-08.md) and the later blocked Sky trial retain separate outcomes. Final reviewed delivery and rehearsal remain open.
- Latest cloud observation, session 11: Production and crew are running; signed contracts/status succeed before and after crew restart, and isolation checks pass. The first milestone is complete. Exact digests and the historical receipt compatibility issue are in [the implementation record](proofs/cloud-path-progress-2026-09-07.md).
- This is a new effort beyond the earlier cloud-phase scope cut: hosting the crew and adding a browser-facing Studio are now explicitly requested. The earlier operator-only tunnel architecture is not automatically sufficient.
- Open tickets are discovered under `issues/`, by `Status`, `Assignee` and `Blocked by`, per `docs/agents/issue-tracker.md`. Blocking references are local ticket numbers; narration uses titles.
- The delivery milestones and evidence pointers live in [The shortest route to a visible result](route.md). It is the delivery view, not a second decision ledger. Each accepted answer belongs only in its ticket; unchecked milestones are not completed work.

## Decisions so far

- September 8, correction session: the user chooses Production limits and can correct/reprise
  a blocked Studio Run. This supersedes operator-only ceiling selection. The local implementation
  spans the Studio form, durable decisions, worker continuation and signed Production grants;
  earlier consumption and reusable media remain intact. See the updated ADR-0025 and ticket 04.
  [Implementation and local validation](proofs/studio-user-corrections-2026-09-08.md) are recorded,
  including retirement of the hosted crash-test override. Hosted deployment/rehearsal of this
  change is still separate from local implementation.

- Private workspace access is confirmed. The authorized Studio trial is a 50-second English lightning/thunder explainer, bounded to 40 total counted dispatches, four searches, five image generations and one narration. Its [envelope](proofs/studio-progress-2026-09-08.md) preserves the earlier exhausted Sky authorization. The generated preview lasts 43.051 seconds; no human image decision remains pending. Watching that preview does not close the blocked final review.

- September 8, latest user direction: add one pre-publication milestone for [SceneCapabilities and catalog improvements](issues/09-improve-scene-capabilities-and-catalog.md), including possible new SceneCapabilities. Explicitly retain the `image_context` framing defect and return to it later, before tonight's publication. This supersedes the earlier blanket exclusion of catalog expansion; it does not start implementation or authorize another paid run.

- [How does the hosted crew reach Production and the browser safely?](issues/03-connect-the-hosted-crew-without-breaking-production-isolation.md): approved crew VM and 10 GB data disk deployed; signed contracts/status and persistence verified, restricted SSH and separate IAM/registry boundaries exercised. ADR-0022 accepted. Browser admission and audience stay in tickets 04/07.

- [Which supported ADK deployment path fits this crew by tomorrow?](issues/01-choose-the-supported-adk-deployment-path.md): verified deployment CLIs and their limits; project-specific hosting recommendation with evidence and a two-hour alternative proof.
- [What result comes first for the September 9 hackathon?](issues/02-name-the-demo-and-release-envelope.md): deadline and rules established; real video and Studio first, ElevenLabs retained for initial delivery and voice compliance work placed last.

## Remaining milestone order

Rehearsal session update: [new evidence](proofs/studio-rehearsal-2026-09-08.md) proves hosted
playback/download/reconnect, corrected lost-response admission, and live worker-crash recovery
without repeated calls. The user authorized one new paid run; submission
`b68869a4-e436-43b2-8985-a57ca8f7455f` passed its first human image approval, then blocked
after three rejected versions of its second image. The [diagnosis](proofs/studio-image-rejections-2026-09-08.md)
proves feedback transmission but conflicting bitmap/renderer instructions and incomplete corrections.
The real render-disconnect experiment and complete reviewed-film evidence remain open.

1. **Next: Product holds up in rehearsal.** Start with the existing Studio and artifacts: truthful progress/failure states, browser refresh, authenticated playback/download, duplicate admission and focused recovery checks. The terminal film is evidence of a failure state, not a job to restart blindly. Final complete-run proof remains open.
2. **Improve SceneCapabilities and the catalog.** Revisit later today: framing, visual quality, published capability guidance, and additions chosen for the release. Own the diagnosed crop and correction-routing problems here.
3. **Final voice work.** Resolve the deferred provider-compliance question while preserving actual-word synchronization. Remains the final engineering milestone.
4. **Publication tonight.** Verify the final revision and film after the visual/voice changes, capture the English demo and backup, and complete hosted access, public source/license/instructions and submission artifacts.

The initial video and Studio milestones have visible output but remain unchecked for final editorial/review/export evidence. Deferring their diagnosed visual correction to the new milestone does not waive those gates. Final rehearsal must be repeated on the release revision after relevant visual or voice changes.

## Not yet specified

- [Historical receipt compatibility](issues/08-diagnose-historical-run-receipt-compatibility.md): both September 5 Runs fail current receipt-schema validation. Preserve their data and diagnose before claiming their recovery; a fresh zero-quota Run passed the connectivity proof.

- Presentation refinements that emerge when the chosen hero Brief is watched with its real narration and visuals.
- Additional release risks exposed by the first full hosted run; turn each into a decision only when its concrete failure is known.

## Out of scope

- A general renderer rebuild remains outside the release plan. SceneCapability and catalog improvements, including new capabilities, are now explicitly in the new pre-publication milestone; select their concrete scope when returning to it.
- Broad cleanup, fresh whole-branch review, framework migrations and unrelated baseline lint failures.
- Billing, organizations, team collaboration, general timeline editing and arbitrary code generation for scenes are proposed post-hackathon scope; revisit only if eligibility or the user's product boundary makes one essential.
