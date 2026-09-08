# Vox Studio: a visible result first, ready for the September 9 hackathon

Label: wayfinder:map
Status: open

## Destination

Chart the shortest delivery route to a real narrated preview the user can watch, then a deployed Studio that takes a Brief through the hosted ADK crew to that result. Target a demonstrable product on September 8 and submission on September 9, with explicit evidence for each milestone.
The map records decisions and delivery priorities; it does not claim implementation, deployment or eligibility is complete.

## Notes

- Requested and updated 2026-09-07. The confirmed event, deadline, rules assessment and user-directed delivery order are recorded in [What result comes first for the September 9 hackathon?](issues/02-name-the-demo-and-release-envelope.md).
- Use wayfinder, grilling and domain-modeling; use research/find-docs for external facts. Keep the glossary in `CONTEXT.md` and the six architectural rules. The frozen architecture is background; later accepted ADRs and current code establish the actual boundary.
- This update records the user's instruction to prioritize a visible result. Remaining decisions stay open only for their actual unresolved scope; do not repeat the completed rules/deployment investigation or require a voice migration before the first video. Concrete delivery milestones and their exit evidence live in the route. Host and access recommendations are not silently accepted decisions.
- Proposed release envelope: authenticated, controlled hackathon access, real provider calls, durable work, bounded spending, browser refresh/restart recovery, and playable/downloadable output. Whether arbitrary public self-service is required is still a user question.
- Implementation commits on `feat/adk-production-crew`: prior work saved in `74dade4`, private Studio saved in `4679d88`. The [private hosted Studio](proofs/studio-progress-2026-09-08.md) is deployed; its newly authorized lightning/thunder trial awaits human image approval. The historical [September 8 hosted video](proofs/milestone-2-delivery-2026-09-08.md) and the later blocked Sky trial retain their separate outcomes. A fresh complete Studio film and rehearsal remain pending.
- Latest cloud observation, session 11: Production and crew are running; signed contracts/status succeed before and after crew restart, and isolation checks pass. The first milestone is complete. Exact digests and the historical receipt compatibility issue are in [the implementation record](proofs/cloud-path-progress-2026-09-07.md).
- This is a new effort beyond the earlier cloud-phase scope cut: hosting the crew and adding a browser-facing Studio are now explicitly requested. The earlier operator-only tunnel architecture is not automatically sufficient.
- Open tickets are discovered under `issues/`, by `Status`, `Assignee` and `Blocked by`, per `docs/agents/issue-tracker.md`. Blocking references are local ticket numbers; narration uses titles.
- The delivery milestones and evidence pointers live in [The shortest route to a visible result](route.md). It is the delivery view, not a second decision ledger. Each accepted answer belongs only in its ticket; unchecked milestones are not completed work.

## Decisions so far

- Private workspace access is confirmed. The newly authorized Studio trial is a 50-second English lightning/thunder explainer, bounded to 40 total counted dispatches, four searches, five image generations and one narration. Its [envelope and current evidence](proofs/studio-progress-2026-09-08.md) preserve the earlier exhausted Sky authorization. Human image acceptance is still pending.

- [How does the hosted crew reach Production and the browser safely?](issues/03-connect-the-hosted-crew-without-breaking-production-isolation.md): approved crew VM and 10 GB data disk deployed; signed contracts/status and persistence verified, restricted SSH and separate IAM/registry boundaries exercised. ADR-0022 accepted. Browser admission and audience stay in tickets 04/07.

- [Which supported ADK deployment path fits this crew by tomorrow?](issues/01-choose-the-supported-adk-deployment-path.md): verified deployment CLIs and their limits; project-specific hosting recommendation with evidence and a two-hour alternative proof.
- [What result comes first for the September 9 hackathon?](issues/02-name-the-demo-and-release-envelope.md): deadline and rules established; real video and Studio first, ElevenLabs retained for initial delivery and voice compliance work placed last.

## Not yet specified

- [Historical receipt compatibility](issues/08-diagnose-historical-run-receipt-compatibility.md): both September 5 Runs fail current receipt-schema validation. Preserve their data and diagnose before claiming their recovery; a fresh zero-quota Run passed the connectivity proof.

- Presentation refinements that emerge when the chosen hero Brief is watched with its real narration and visuals.
- Additional release risks exposed by the first full hosted run; turn each into a decision only when its concrete failure is known.

## Out of scope

- Rebuilding the renderer or expanding the SceneCapability catalog without a demonstrated blocker in the chosen demo.
- Broad cleanup, fresh whole-branch review, framework migrations and unrelated baseline lint failures.
- Billing, organizations, team collaboration, general timeline editing and arbitrary code generation for scenes are proposed post-hackathon scope; revisit only if eligibility or the user's product boundary makes one essential.
