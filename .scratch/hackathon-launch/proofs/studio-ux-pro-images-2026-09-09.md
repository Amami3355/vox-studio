# Guided Studio UX and Pro image editing — September 9, 2026

## Delivered behavior

- A blocked image presents the latest candidate, one suggested correction, optional user direction and a single submission action. Full reviews, previous image versions and all production counters remain accessible in details.
- Admission requirements are projected from the persisted checkpoint, per target and per image identity. Exhausted allowances are identified before a request; explicit Allow +N controls change the form only. The final action names the authorization change, and the saved request retains the exact payload and idempotency key through response loss and refresh.
- New-film setup starts compact with visible selected totals. Film progress reflects saved research, recorded narration, approved images and real rendered/reviewed artifacts. Consecutive duplicate events are collapsed. Internal historical error text is replaced with user-facing activity descriptions.
- The image adapter defaults to stable `gemini-3-pro-image`, 2K, through the existing global cloud identity. No fallback to a lower-quality image model was added. Output still requires exactly one PNG candidate and preserves uncertain-dispatch handling.
- Image corrections include a content-bound reference to the previous rejected candidate. `sourceCandidateSha256` is covered by the request digest; Production reads verified bytes from the same Run and identity before dispatch. Old requests without a source keep their original digest semantics. A source from outside that Run/identity is refused.
- Image intention and review instructions prioritize current requirements, reconcile contradictory historical reviews, separate actual renderer annotations and reserve rejection for material defects. Human approval remains required. Prompt improvements do not constitute a measured rejection-rate improvement.

## Root cause and regression evidence

Cloud job `b68869a4-e436-43b2-8985-a57ca8f7455f` had 23/40 calls and 4/5 image generations used but 2/2 corrections consumed for `propagation_light`. No continuation was pending. A local replay of the archived image checkpoint refused unchanged limits; changing only corrections per image from 2 to 3 passed validation. The historical user's network request was not captured.

Tests exercise API rejection before admission, exact guided extension, suggested correction without typing, retained narration/approved images/counters, source-bound editing, cross-source refusal before provider dispatch, idempotent dispatch and lost-response/refresh recovery. Eight browser scenarios pass. Targeted Python suites and Production adapter/lifecycle/authorization/payload/configuration suites pass; Studio and Production typechecks, generated contracts and targeted Biome checks pass. The new source-edit test initially needed its fixture clock pinned to its signed grant date; the tested production behavior was unchanged by that fixture correction.

The initial hosted browser check detected an old ContractViolation message in the activity history. A final API/frontend update replaces raw activity summaries with user-facing descriptions, and the model-response browser fixture now contains that historical event to prevent recurrence.

## Google references verified September 9

Context7 library resolution and documentation queries were used, with official cloud model documentation checked directly for the stable identifier and deployment region:

- [Google model selection](https://ai.google.dev/gemini-api/docs/image-generation): Pro is designed for professional assets and complex instructions; Nano Banana 2 balances quality/cost/latency; Lite prioritizes efficiency.
- [Gemini 3 Pro Image on Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-pro-image): stable ID `gemini-3-pro-image`, global region, 2K output and image editing.

## Hosted deployment and limits of proof

Runtime evidence is under `../runtime/studio-ux-20260909/`. The initial rollout updates Production, worker and API; the final polish updates only API/frontend and its boot configuration. Exact images are in `images.json` and the final API record. Previous boot metadata is archived; remote previous unit files are retained under `before-ux-20260909` on the existing operator disks. No keys were regenerated.

The initial update paused admissions and verified zero active jobs before stopping the worker. All four submissions retain their IDs, statuses, media, decisions, limits and usage. Checkpoint/provider-journal hashes match the before-update archive. Existing local section-authoring and bounded model-response recovery changes are included in the worker release.

No existing production was resumed and no generation provider was dispatched by these checks. Hosted inspection verifies the actual suggested correction, explicit allowance, enabled next action after that selection, responsive layout and preserved state after refresh. Local provider transports are simulated; a new accepted image or complete hosted film remains a separate live proof. No claim of a lower rejection rate or guaranteed five-minute delivery is made.

Final hosted verification passed: `browser-verification.json` records the guided allowance,
explicit changes, refresh, mobile overflow check and absence of private diagnostics, with no
browser errors. `source-verification.json` matches all 46 Python modules in both API and worker
images and the four changed Production implementation/contract files to this workspace.
Final immutable images are recorded in `images-final.json`; final crew boot metadata matches
`crew-final.yaml`. Rollback of the last frontend polish alone uses the preserved API/setup files
under `/mnt/disks/vox-crew/studio-operator/before-ux-final-20260909/`; the worker and Production
were not restarted for that final polish. No commit or Git push was performed.
