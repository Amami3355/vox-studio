# Editorial preview deployment — September 8, 2026

Production and crew are redeployed and the new illustrated preview is delivered locally.
The film is 41.62 seconds, 1920 × 1080, 30 fps, with three accepted generated illustrations
and one new narration Take. Run: `304aac1e-c04c-466b-b786-30ac725b8f9d`.
[Watch locally](http://127.0.0.1:8766/) or open
[`editorial-preview.mp4`](../runtime/editorial-delivery/editorial-preview.mp4).

Work follows the session-16 handoff and the user's explicit deployment request. Research and
image-prompt interventions are documented below; this is not evidence of a fully autonomous
primary-source research success. Audio was technically checked, but not listened to by this agent.

## Consolidated deployment

The initial consolidated Production deployment on `vox-service` used
`europe-west1-docker.pkg.dev/studio-prod-7f3a/vox/production@sha256:ac1991086c241429ffecc2d8d24b1b63650863099430c5c628d03ef00e62c238`.
Its Gemini image adapter runs with Production's cloud identity at `global`, using its explicit
`gemini-2.5-flash-image` default. The new request schema and ten-capability catalog are included.
SHA-256 checks inside the running container match the local generated catalog, protocol, and
image adapter. The image leak scan passed over 383 files in three existing roots.

The first crew deployment was
`europe-west1-docker.pkg.dev/studio-prod-7f3a/vox-crew/crew@sha256:0f648f25c0599bf4926eca5fd28dbfbb2a0f6367cd4bc05500ca8093cae2099d`.
The diagnostic systemd override was retired. The normal hosted entry point now serializes
creative model turns with a lock owned by their persistent ProviderJournal; an uncertain
dispatch still blocks further calls. Sixteen focused hosted/role/concurrency tests passed.
ADK remains 2.7.1 and Google Gen AI Python remains 2.19.0. Live research and creative models
remain explicitly `gemini-3.5-flash` at `global`; repository model defaults are not deployment evidence.

The signed hosted probe passed at 02:12:04 UTC with zero provider calls. The historical delivered
Run `28364527-1061-4a27-9010-c317865747c9` remains readable and its persistence marker survived.
Both VM boot metadata were updated as well as their running systemd configuration.

## First invocation: preserved, no media spending

Brief `editorial-preview-reusable-rocket-2026-09-08` created Production Run
`9c4feb37-04d2-428a-81e7-5de54cafee33`. It used ten completed model dispatches including one
Parallel-grounded research dispatch. There are no pending dispatches. The only Production
commands were `run.init` and `run.validate`; the Run remains `initialized`, with no Take and
no image jobs. This attempt is preserved and must not be restarted.

Its research returned one compound claim about burn durations, sourced to Wikipedia and
Space Exploration Stack Exchange. Its four-Beat narration consequently catalogued durations
instead of explaining the requested mechanism. This fails the requested primary-source focus.
The model EditorialReviewer accepted its semantic plan; that acceptance was not sufficient
evidence of factual/editorial quality.

Production refused two `EVENT_CONTENT_MISMATCH` errors: the two `image_detail` scenes each
requested `focus whole` as their first event despite whole being the initial framing. The exact
plan reproduced both errors locally with `validateVideoPlan`; there was also a nonblocking
consecutive-motion-profile warning. Crew JSON-schema validation does not implement these
semantic checks. The operator did not remove events or replace the storyboard manually.

Production was briefly stopped while the operator established whether narration had started,
then restarted after signed status and command records confirmed the already-known pause.
No pending provider call was interrupted and no allowance was reset.

## Explicit creative revision

The research planner prompt now prioritizes the central causal question and primary evidence,
rather than defaulting to figures/dates. Grounded research is instructed to cover that mechanism
and qualifications without unnecessary precise quantities. Scene Author now explicitly checks
initial/current state and avoids redundant events. Twenty-four focused role, grounding and
concurrency tests passed after these changes. These are behavioral instructions, not proof of
live editorial success or a replacement for Production semantic validation.

`request-revision-1.json` opens a new creative invocation before any recording. It gives the
crew useful [NASA mechanics](https://science.nasa.gov/learn/basics-of-space-flight/chapter3-2/),
[NASA-hosted Falcon flight sequence](https://www.nasa.gov/wp-content/uploads/2020/08/falcon9_launch_and_landing.pdf),
and SpaceX starting URLs to investigate. They are research leads, not operator-authored dossier
claims or a storyboard. The operator read the two NASA sources while diagnosing research focus;
SpaceX's newer vehicle-page fetch returned HTTP 502. Crew research provenance must be evaluated
from its own resulting dossier.

The new Brief is `editorial-preview-reusable-rocket-2026-09-08-revision-1`. Its journal was
exclusively created with the exact ten already-consumed dispatches and their completed outcomes.
A separate provenance record binds the preceding Run, journal digest and zero media usage.
The ceilings remain 40 model calls and two grounded calls **including the preceding invocation**.
The old checkpoint, journal, Beats and Run were not changed. The media allowance remains at most
one new Take and five images for this preview.

The trusted editorial image signer has a persistent allowance bound to one Run and at most five
exact request digests. Reuse returns the same signed grant. It refuses a different Run and a sixth
request, including after restart. A disposable container test checked signatures, reuse, cross-Run
refusal and the ceiling with a synthetic key, without any provider or production volume.
It does not use the historical one-off image recovery script.

## Second research result and operator supplement

The revised image is
`europe-west1-docker.pkg.dev/studio-prod-7f3a/vox-crew/crew@sha256:03931a78a6adc1903c75e4a7b7a3850a5ca5fb0acc270c798f6d652d75b68421`.
Revision 1 still produced only one forum-based claim. The prompt changes did not demonstrate
adequate primary research. Its new narration still lacked a direct propulsion explanation.
The operator suspended Production before this invocation could initialize a Run, allowing
outstanding model responses to finish. It reached `PRODUCTION_FAILED` with no Run ID and no
media dispatch. Its twenty cumulative model calls, including both grounded calls, all have
known responses. The first editorial review rejected the plan and its bounded second review
accepted a revision; neither substitutes for research adequacy.

No third grounded call was made. The operator read NASA's mechanics chapter and the NASA-hosted
Falcon flight infographic directly, then prepared the explicitly attributed
[primary supplement](../../../deploy/crew/editorial-preview/operator-primary-supplement.json).
It contains six supported claims, including one labelled synthesis of thrust mechanics and
powered landing. The forum claim is retained as uncertain, not promoted to primary evidence.
This is operator research, not a claim that Parallel obtained these sources.

Brief `editorial-preview-reusable-rocket-2026-09-08-revision-2` is a new creative preparation with
that supplemented research and no inherited narration, scene plan or media identity. It inherits
the exact twenty-dispatch journal, so the total ceilings remain 40 models/two grounded calls.
Original attempts and their immutable Beats are preserved. The deployed crew owns the new
narration, structure, authored plan and visual review. This preparation is not an extra iteration
inside an exhausted editorial loop. Production was restored before the new invocation.

The boot metadata was read directly through the Compute REST API (without gcloud's Windows
stdout encoding) and matched the prepared bytes for both VMs before the second creative
revision. Final metadata verification must reflect the final request path as well.

## Recorded Run and image review

The final creative preparation created Run `304aac1e-c04c-466b-b786-30ac725b8f9d`.
Its four Beats were authored by the crew; Production validation, Preflight, recording and
compilation succeeded without a plan repair. The narration MP3 is 41.563719 seconds; the
50-second request was an estimate. Audio SHA-256 is
`15ee505262a60e1a0d42e78fa4840fc546d2a521649f837a3c135637f180e38d`.
The crew selected two `image_detail` scenes, one `process_steps` scene and one `image_context`
scene, with three image requirements. The initial render contains placeholders and is not
the intended final delivery. No additional Take is authorized or needed for image corrections.

The first generated candidate, `aad791c8c7b2843ec4397bf4bb962d9e2483701120e3e673a4c8f6edc289c58b`,
was inspected and explicitly rejected: it included unwanted labels and curved gravity/drag
arrows that suggested rotation rather than opposite linear forces. The second candidate,
`0c22927d5053d7676b9dad26992214f10228c01627d2841afa863cdf6e2110d6`, was also rejected: both arrows
pointed downward, including the one labelled drag. Neither is acceptable explanatory evidence.

The operator authored narrowly scoped composition corrections to the image-generation request,
retaining the Run, image identity, authored Beats, scene selection and symbolic events. After the
second failure, the requested illustration omits baked arrows and words; explanatory annotations
remain in the authored renderer. This intervention must be reported as operator prompt correction,
not as autonomous ImageCreator prompt writing (that role currently only decides whether an image
is needed).

## Explicit image correction support

The existing API reused the first job for an identity even after rejection. Production now permits
a different exact request with a fresh signed grant **only after explicit rejection**. Without that
combination it returns the latest job. Old candidates, rejected statuses, consumed grants and image
counts remain in the same Run. Failed or uncertain work is not retried. The image ceiling applies
to every job, including the rejected candidates. This avoids inventing a new image identity or Run
to evade reuse/accounting. The updated public protocol describes the behavior.

Twenty image-lifecycle/Google-adapter tests and Production type checking passed. The regression
checks no replacement without a grant, invalid-grant refusal, retention of the rejected job,
latest-job reuse, accepted replacement compilation, and refusal when the job ceiling is exhausted.
Production contracts and crew fixtures were regenerated; `contracts:check` and `git diff --check`
passed. The final Production image passed a leak scan over 385 files and was deployed at:
`europe-west1-docker.pkg.dev/studio-prod-7f3a/vox/production@sha256:020d591c2cc57b263a687294bab4be7963887da0f27e1eca9710fe956b916cc6`.
The crew's signed probe passed after the update. Runtime code overrides were not introduced.

## Final deployment and delivery

Final pinned images:

- Production: `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox/production@sha256:020d591c2cc57b263a687294bab4be7963887da0f27e1eca9710fe956b916cc6`.
- Crew: `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox-crew/crew@sha256:03931a78a6adc1903c75e4a7b7a3850a5ca5fb0acc270c798f6d652d75b68421`.

Both running units and boot metadata use these digests. The crew request path is
`/var/lib/vox-crew/editorial-preview-request-revision-2.json`. Metadata was verified byte-for-byte
through Compute REST: Production user-data SHA-256
`4a3cc88a95a88679709344f350ef611d3cb2384f914ee4345abfeabba7a02c87` (22,383 bytes),
crew `75e2e007a4850cb0be3a8688ae8de3935fe65674db1a7d27bede5e247613cba5` (14,055 bytes).
The completed crew unit is no longer running; there is no pending provider dispatch or automatic
paid restart. Production remains available. The historical Run and milestone-2 MP4 are preserved.

Exactly five image jobs were created, retaining both rejected candidates. The three accepted
images are bound by digest:

| Use | Job | Accepted candidate SHA-256 |
| --- | --- | --- |
| Descending generic rocket | `image-job-4bb3eecc627ccace100d` | `0b6e57fd06566db2c38fc672b26e6c35d1d1c82bccda9c085cf37df35458b358` |
| Combustion chamber and nozzle | `image-job-0769bf15094b0bd5b3b7` | `f21fd10923c9135a930190fa54699e962a1186a6c13f4115f1095d5227a32324` |
| Powered landing | `image-job-ddd8db74dab88be3e4dc` | `020aa654894431a2aebb23caa456bba738b77bf9d93043b98e00e729f11d3873` |

The operator inspected all five candidates and submitted explicit decisions. Accepted illustrations
have a consistent paper-cut appearance, recognizable chamber/nozzle/exhaust and landing composition,
and no baked labels or misleading force arrows. They are generic educational illustrations, not
faithful Falcon 9 technical drawings. The authored renderer supplies the labels. Removing generated
force arrows avoids the two observed errors, but also leaves force direction explained mostly by
narration and text. No further image calls were made.

Final attempt `4863bad5-cc37-4c28-8863-75977b1744fe` reached `rendered`, sequence 24, after recompiling
the accepted asset set. Its verified MP4 is 9,703,881 bytes, SHA-256
`2ecc251c5d30ea1645d7fc48ce26edbc557968467b8370e166eb20406c4afdcb`.
The compiled document SHA-256 is `bad53f97f0ee2abf7bc289a186c7d7c9113a3708c6473b9f7f331a680a1b5336`.
The same Take/audio digests recorded above remain in the final export. The image pauses and resumes
did not record extra narration. Crew telemetry counts three current accepted requirements;
Production status preserves all five historical image jobs for cost accounting.

The cumulative provider journal contains 34 completed model calls, including both grounded research
calls and the twenty calls from previous preparations. It has no pending calls. Reported usage totals:
173,325 prompt tokens, 13,650 candidate tokens, 63,381 thought tokens, 250,356 total tokens. These are
reported model usage, not monetary cost, and do not include image-generation or ElevenLabs billing.

## Verification and practical limits

- Signed Production status and all sixteen exported artifact descriptors passed SHA-256 verification;
  the downloaded archive and delivered MP4 were independently checked locally.
- Full FFmpeg audio/video decoding passed. The video has 1,247 frames (41.566667 seconds), H.264;
  AAC audio is 48 kHz stereo. Container duration is 41.621333 seconds.
- A contact sheet sampled every three seconds and the full-size final frame were visually inspected.
  All four scenes, three accepted images, focus changes, annotations and process-step progression
  are present. Sampled text is readable and the final frame has no clipped content. The unused black
  contact-sheet cell is tile padding, not a frame in the film.
- Audio signal analysis measured mean -27.3 dBFS and peak -8.1 dBFS; there was one silence over
  0.8 seconds (0.857 seconds near the transition to the final Beat). This is not listening validation.
  Agent audio input is unavailable, so pronunciation, voice quality and perceived balance await
  human listening in the delivered player.
- The loopback player passed UTF-8/HTTP 200, full served-MP4 digest verification, and HTTP 206 byte-range
  seeking. It serves the new delivery directory on port 8766, separately from the historical preview.

Public receipts are in [`editorial-preview-delivery-2026-09-08/`](editorial-preview-delivery-2026-09-08/):
final request, authored narration and plan, research provenance, reviewer results, provider journal,
image decisions, Production status/export index, Take metadata, compilation, boot metadata checks
and media/player verification. A narrow `.gitignore` exception makes these JSON receipts reviewable;
media, private runtime state and signed image grants remain ignored. No commit or push was performed.
