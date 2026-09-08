# Autonomous robustness diagnosis — 2026-09-08

The user authorized diagnosis, robustness fixes, and a new attempt to produce one of the two
original videos end to end. They also explicitly requested one direct image call with the local
Google API key to investigate possible exhausted credits. Historical trial counters are preserved.

## Evidence and confirmed causes

- One local `gemini-2.5-flash-image` call returned a valid 820,347-byte PNG in about 11 seconds.
  The decoded image is a blue cup as requested. SHA-256:
  `ee129ef72372d0228e2b6a3d21432a3cb6c99226fc133ac941ee503dce7b9664`.
  The result is in `../runtime/google-image-credit-probe-2026-09-08T06-16-14-934Z/result.json`.
  This proves the local Gemini Developer API key could generate an image then; it does not
  establish a remaining balance or the separate Vertex AI project's quota.
- Historical Production logs did not retain the Rocket image provider cause. It remains unknown.
  Reproduction through the real Google adapter and Production image-job lifecycle confirmed
  that HTTP failures and no-image responses lost their diagnostics, while transport exceptions
  were incorrectly classified as confirmed failures. Three regression cases failed before the fix.
- Production now persists normalized HTTP status or image response count/MIME/finish/block codes.
  It excludes raw provider messages, credentials, text responses and thought parts. Transport
  failures without a confirmed HTTP response become `uncertain`. Observation/repeated commands
  reuse the same job and consumed grant; no SDK retry or replacement is introduced.

## New authorized Sky trial

Submission `autonomous-robustness-20260908-sky`, original prompt `Explain why the sky is blue.`,
50-second target, English, 40 total dispatches, four searches, five images and one Take maximum.
Request binding `4fcc9feddabab05ca9edf5e60efa43f6e968a01fbb953b4e9e637396746956ce`.
Run `cf997776-fc67-4bc5-9fcb-12221872ecdf`.

The first phase reached Production with 11 responded calls, one search, one PlanRepair,
no image generation and no recording. The cloud model worked; no quota error was observed.
PlanRepair shortened four overlong image subjects. Production then refused an emphasis naming
"longer path" but anchored to "travel". Its shared one-call repair allowance was already spent.

The captured original plan reproduces `DEICTIC_ANCHOR_REQUIRED` in the actual Production
validator. Of its published alternatives, `longer` precedes the previous event at `path`, so
only `path` preserves event order. The new generic V2 repair applies only a unique published
Word anchor that preserves the whole SceneInstance's event order. It changes no other field,
retains the refusal and both plan hashes, and returns through all Production gates. Ambiguous
choices, repeated words, multiple errors and uncertain timing are refused. This is an automated
system correction, not an operator-authored storyboard or another model repair allowance.
The captured plan has zero validation errors after this correction; its existing motion warning
is preserved. The boundary is recorded in ADR-0024.

`reconcile_anchor.py` has a read-only default and six tested cases. Application archives the
checkpoint and journal and clears only this diagnosed pre-recording exhausted-repair block,
after checking the exact call count, all responses, unchanged signed Production state, and
applicability of the unique correction. It does not edit the plan, reset counters, or dispatch a
provider. The worker performs the correction after resumption.

Initial blocked evidence archive SHA-256:
`423b0d361342aaecb09282fe0b5a6c800fd14782ac3a91efb9630c8d649402fd`.

## Verification and deployment

- Production: 25 targeted tests pass, including the three previously failing lifecycle cases;
  Production TypeScript checking and formatting pass.
- Python: 621 passed, one skipped in 142.05 seconds; the six subsequently added reconciliation
  cases also pass. The full-suite log is in `../runtime/robustness-20260908/python-tests-final.log`.
- Actual captured before/after plans were evaluated by `validateVideoPlan`; failure before,
  no validation errors after. Reproduction scripts are under the same runtime directory.
- Production image scan: 407 files, passed. Registry and VM both report
  `sha256:a17809417295ae26c18b1b831e5d4fc641e0007e35e2861add0e5d662485576f`.
  The ext4 Run volume remains mounted. Signed zero-provider connectivity probe passed at
  06:24:24 UTC with the previous persistence marker retained.
- Original and intermediate boot metadata and pinned references are preserved in
  `../runtime/robustness-20260908/` and its `anchor-deploy/` directory.

End-to-end video delivery remains unproven until the resumed trial produces a reviewed MP4,
signed export, verified hashes and full audiovisual decoding. No completed-video claim is made
from the tests or the successful local image probe.

## Confirmed HTTP 429 and authorized recovery

After the anchor correction, the same Run recorded its one Take. Its third image call failed
with normalized `HTTP_429` for `rayleigh-scattering-diagram`, proving the new diagnostic path in
cloud. All 20 dispatched calls had responses. Archive before recovery:
`../runtime/robustness-20260908/robustness-after-anchor.tar.gz`, SHA-256
`8b244f5fd545ef2ee34194dcae12186e102a42746f0791546f4d6934a95c9a3f`.

The user explicitly approved eight total image calls, including those three. A separate policy
binds this Run and original request digest; the original five-image request and envelope remain
unchanged. The policy permits HTTP 429 retries only, a minimum 60-second interval, exponential
backoff for consecutive 429s, and eight total jobs/grants. Global 40, searches four and Take one
remain. A retry names its exact predecessor and unchanged request; replay reuses that retry job.
Uncertain outcomes and other failures cannot retry. The SDK itself still uses one attempt.

The archived reconciliation at 07:15 UTC verified the unchanged signed snapshot apart from the
approved policy, all 20 responses and three image dispatches. It retained plans, Take, counters,
steps and journals. Boot configuration and predecessor digests are in `recovery-deploy/`.
Production digest `6294db76b59e5a4af0ad9ff1370de9c805c3bc66bf88ad6d0ac67b162847b2b9`,
worker `e417814698af28a1d86c674c546c67fead43630d51d55b74d16385151cdde219`.
Both image scans passed; the zero-provider signed probe passed at 07:14:17 UTC.

Recovery verification: 21 image/authority tests and 36 contract/configuration/compile/render tests
passed, contracts and TypeScript checks passed. Full Python suite: 636 passed, one skipped,
one failure in the old protocol character-count assertion. The new contract measures 41,884;
updating that assertion made all 22 census tests pass. No functional failure was hidden.

The live resume exposed two further defects, both reproduced by failing tests before fixes:
Production intentionally omits failed resources from its placeholder worklist, so a resumed crew
could skip the failed image; and the resource resolver selected an old failed job before an
accepted retry. V2 now checks every authored image requirement using cached intents/commands.
Production resolves only the latest job per identity, preserving historical jobs and spend.
Both regression tests now pass; 27 autonomous and 24 image/compilation tests pass, as does tsc.
Delivery publication also refuses an image history that is empty or remains rejected.

## First MP4, reviewer context, and exact restart requests

The intermediate film rendered to H.264/AAC, 1920×1080, 56.576 seconds, 9,503,857 bytes.
SHA-256 `c25a99e795aa9fc41bcb204800bc0695bbeded703feff73c4ed9670d7888b948`.
It still lacked the failed Rayleigh image and is not a validated delivery.
Signed first-render export archive SHA-256
`824d84c963893f6ef79e1cc7a9f0ac2206511a1165583745d9c1582262b5c5e9`.

The reviewer raised `google.genai.errors.ClientError` before any verdict. Its exact code/message
was not retained, and cloud logging yielded no matching error entry. The installed SDK's
`APIError.raise_error` and async counterpart raise ClientError only for HTTP 400–499, so this is
a confirmed HTTP rejection with unknown exact status, not proof of a transport timeout or quota.
The request also carried 3,569,265 text characters, including three redundant data-URI images.
Projection retains timing, semantics and asset URI hashes while reducing this text to 63,733
characters; the actual 1,280,879-byte audiovisual inspection MP4 remains attached unchanged.
Excess text is refused before dispatch. Confirmed future HTTP errors record safe status and
hashes; raw messages are excluded and transport uncertainty remains outstanding. Three new
regressions failed before these fixes. The first rejected request's precise cause is not asserted.

At 33 consumed calls, a narrowly scoped reconciliation archived the checkpoint/journal and
appended the SDK-proven 4xx failure classification, explicitly recording the unknown exact code.
It cleared only the pre-verdict review and block; no response, verdict or token usage was invented.
The current workflow completes missing authored images before rendering/reviewing new bytes.

The next internal image command was refused with `IMAGE_REQUIREMENT_NOT_PENDING` before reaching
Google. Production still had seven jobs and grants. A reproduced regression now permits exact
previously published work after recompilation while retaining all scope/authorization checks.
Checkpoint JSON sorting also changed the serialized intention embedded in an image prompt.
New intentions serialize canonically; historical semantically identical intentions retain their
exact recorded request bytes and seed. A disk-reload regression reproduces this difference and
passes after correction. The refused command remains globally counted; separate appended evidence
identifies that it never dispatched to the provider. No paid image counter is reset.

Final full Python run before these last narrow reconciliation cases: 647 passed, one skipped in
140.48 seconds (`python-final-tests.log`). The subsequent five precondition reconciliation cases,
35 autonomous/reconciliation cases and historical-request regression pass. Production's 19 image
lifecycle tests (including failed/recompiled/retried/accepted resolution) and tsc pass.

## Final outcome at the authorized image limit

The eighth Google attempt returned a PNG, then image review rejected the Rayleigh illustration.
It depicts the red/blue waves misleadingly (relative wavelengths and red appearing only after
the scattering point). Direct local visual inspection confirms the problematic diagram. The
review also incorrectly demanded annotations reserved for the renderer; the instruction now
separates bitmap checks from final-film annotations. That prompt refinement has fixture coverage
only, no additional paid validation, and does not alter the historical rejection.

Final state: **blocked, not delivered as a validated film**. Eight actual Google image attempts,
seven PNG candidates (three accepted, four rejected), one HTTP 429 with no PNG. Nine internal
image command attempts include one verified pre-dispatch refusal. All 37 globally counted
dispatch attempts have a response/classification; one search and one Take. No pending provider
or action remains. The ninth Google image attempt was prevented. The worker now stops before
buying an image intention when no generation budget or unreviewed candidate remains; 32 autonomous
tests pass. No saved plan, narration or verdict was manually changed and no counter was reset.

Final signed evidence archive:
`../runtime/robustness-20260908/final-evidence.tar.gz`, SHA-256
`8e29d4db0842c3361077eebc49b5a5e878079adff2922fae81c8fe0b604cbaf3`.
Reader: http://127.0.0.1:8768/ — image candidate gallery and an explicitly incomplete intermediate
MP4, not a validated delivery. Eighteen artifact downloads and their byte ranges/digests verified.
The Take audio and both video/audio tracks of the draft fully decode over HTTP, including seeking.
Browser playback and human audiovisual appreciation were not tested. At 23 seconds the draft has
the expected missing-image fallback, confirmed in `first-render-frame-23.png`.

Reader runtime: `../runtime/robustness-delivery-20260908/`; PID/logs and HTTP verification are in
`../runtime/robustness-20260908/`. Historical readers on 8766/8767 and original trials remain.
The trial's final executing worker digest is `63a2bde8761ca65096b41516a8f9843b689d74fe9af34bcbf3dac1c99ea1accb`;
its Production digest is `fee2112f16553a28e0d7c7c980142697b2fad3b67d78bf9e5d2616157057148e`.
The final budget/annotation improvements are deployed separately afterward, without restarting
the paid trial. All boot metadata backups and immutable rollback references are retained.

Next work is a scientifically correct Rayleigh image and a successful final audiovisual review.
The corrected next image intention is already cached in the checkpoint. Any additional Google
generation needs a newly explicit budget authorization; the approved eight have been consumed.
Successful image calls establish API availability, not an account's remaining credit balance.

Final installed worker:
`europe-west1-docker.pkg.dev/studio-prod-7f3a/vox-crew/crew@sha256:a469ee2b690c0459659d6a61180e7df5294effbccfcee431cd12ad118499579e`.
Production remains at `fee2112f16553a28e0d7c7c980142697b2fad3b67d78bf9e5d2616157057148e`.
Registry digests, scans and VM boot metadata were verified; the final signed probe at 08:05:56 UTC
made zero provider calls and retained the persistence marker. No paid trial was restarted after
exhaustion. Exact final metadata/rollback records are in `../runtime/robustness-20260908/final-deploy/`.
The reader's deployment manifest records the image that actually ran the trial, rather than
attributing its output to the afterward-installed instruction improvements. A complete public
delivery/evidence snapshot is preserved at `autonomous-robustness-delivery-2026-09-08/` beside this
report; the cached proposed correction is `sky/next-image-intention.json` inside that snapshot.
