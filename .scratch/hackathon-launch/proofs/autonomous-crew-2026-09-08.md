# Autonomous crew implementation and cloud trials — 2026-09-08

The requested original prompts are submitted without operator research, narration, storyboard,
image composition text or editorial verdicts. Operator defaults supply English, 50 seconds,
40 total dispatch attempts, up to four grounded searches, five image generations and one Take.
Rejected work consumes the same allowances. Historical work is preserved.

## Local verification

- Final Python suite: 609 passed, one skipped (159.22 seconds), including V2 coverage, narrative corrections,
  image rejection/replacement under the same identity, one-Take film corrections, blocked speech
  changes, interrupted actions, replay accounting, SDK media-byte transport and real FFmpeg decode.
- Production targeted lifecycle, authority, configuration and fixture checks: 35 passed.
  Additional Google image adapter checks: eight passed; fixture contract checks: ten passed.
- Rendering: 115 passed across safe areas, image context and editorial capabilities (417.76 seconds).
- Workspace typing, generated catalog/contracts and `git diff --check` passed.
- These fixture tests verify behavior and transport, not autonomous editorial quality.

## Deployment evidence

Previous pinned references retained for rollback:

- Production `sha256:020d591c2cc57b263a687294bab4be7963887da0f27e1eca9710fe956b916cc6`.
- Crew `sha256:03931a78a6adc1903c75e4a7b7a3850a5ca5fb0acc270c798f6d652d75b68421`.

Previous boot metadata was fetched directly through Compute REST and saved without overwriting
earlier deployment evidence. Its hashes are `4a3cc88a95a88679709344f350ef611d3cb2384f914ee4345abfeabba7a02c87`
(Production) and `75e2e007a4850cb0be3a8688ae8de3935fe65674db1a7d27bede5e247613cba5` (crew).

New Production registry and runtime reference:
`europe-west1-docker.pkg.dev/studio-prod-7f3a/vox/production@sha256:1f380f9dcbd64d6abd72cd7dfd722b20c0d6372929dd8fb4f4fbd57659bbc7a2`.
The image leak scan passed over 390 files. Runtime inspection confirmed the digest and the original
`/mnt/disks/vox-runs` ext4 volume. The crew signer key remains solely on Production.

Exact request bindings:

- Rocket: `493d0a35daf6fbfa7b65f38c313d6e9d49aeabd0f7e4d92d3fb8f028b33e999d`.
- Sky: `0cb9633fb87e6cb27d2879cb06765aa40a1283e8ad76245d86b8f4c0d689b257`.

## Trial and delivery status

Current crew image:
`europe-west1-docker.pkg.dev/studio-prod-7f3a/vox-crew/crew@sha256:95c4a7ba4679ad2704029f17a3a0a66003ec7bd94fe9d2fcf50f4a5f0074c33a`.
Its scan passed over 82 files, with Production implementation absent. The latest targeted
composition, autonomous and historical editorial suite passed 76 tests.
Publishing the multi-platform index stalled; publishing the existing `linux/amd64` manifest
succeeded. Attestations from that index are not claimed as part of the deployed reference.

The current crew image was pulled onto the worker before probing. The signed probe passed at
05:55:46 UTC with zero provider calls and the historical persistence marker retained.
Final boot metadata was verified byte-for-byte through Compute REST:
Production `3602e07c835526df77f48aaa89e6be917bb287332077ced4915fc711fd302aa4`;
crew `b6f9dbb7ffe1ff378187927d75a8976be41980dc412571677280b693a93aeef9`.

The rocket trial stopped first after three responded calls when its coverage judgement failed
the response contract. The original failed response was not retained by that image. After adding
structured output and declared-field diagnostics, an explicit reconciliation archived checkpoint
`7e9168355dbec34e6bf0d86fc4567217479a3784e29a80e5a68d1c4a83eb42a2` and journal
`c45db43770270f4632169dfa3f7f91016de93cad9a35b7ef18b596dace667361`, retained all three calls,
and resumed only the failed judgement. The crew requested a second grounded search, accepted
its coverage and authored a narrative without manual editorial input.

A second stop occurred after 12 responded calls: PlanRepair echoed the Structurer's immutable
`component` and `spansBeats` fields, which the fill adapter rejected. V2 now accepts only exact
echoes, refusing any structural change, and persists composition-role responses independently.
The failed old planner had not saved its repair counter; reconciliation restored it from zero
to one based on the durable `PlanRepairAgent` dispatch. No additional technical repair is allowed.
It archived checkpoint `95e7a6a95c8ae5f6bdd35747c43996a44e2a2612f00c47b43fcd6c2287b6ddba`
and journal `a586dbdc0be945a6f4bc4e7913e9581873e03cfc69888f43ef11460da11cab44`.
All 12 calls, original ceilings, research and narrative were retained. No Run or Take existed.

## Real outcomes: neither film was delivered

| Trial | Run | Total calls | Searches | Image calls | Takes | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| Rocket | `1b2e480b-4a2f-447e-ac71-b607a8781ebc` | 30/40 | 2/4 | 3/5 | 1/1 | Blocked on failed image job |
| Sky | `17d9b570-3c05-4a9c-8e13-61096581fa5c` | 17/40 | 1/4 | 0/5 | 0/1 | Blocked after lost technical repair response |

Rocket's first candidate was rejected by the reviewer. ImageCreator revised its intention and
the second candidate, under the same `parachute_failure_booster` identity, was accepted.
The third image call, for `booster_descent`, ended as `failed` with no candidate. The existing
Production adapter exposes a generic failure and did not retain the provider's precise cause.
No replacement was purchased. The Take and both image candidates remain available.

Sky's first research dossier and narrative were accepted. Production refused a deictic event
anchored to `wavelengths` while emphasizing `broad spectrum`. PlanRepair responded, but the
separate Production repair path still rejected its echoed immutable fields before saving the
response. The final implementation fixes that path, saves repair consumption before dispatch
and saves the response before assembly. ADK receipts also retain public answer parts, excluding
thought parts. Regression tests cover both identical echoes and attempted structural changes,
response reuse without new spend, and counter persistence after assembly failures.

The lost Sky response cannot be recovered and its one repair is consumed. A signed, read-only
Production reconciliation restored its counter from zero to one without resuming it. Original
checkpoint `b44a81d330cb03e3627a8ca203e7537542cbb952ea3732a4e11b97f462767e81` and journal
`5baec00ddc958f0da0c0458b6de1855ecec4e5771c0a649063068282de4988ca` were archived. Neither
trial has uncertain provider dispatches. No counter or limit was reset, and neither trial
was replaced with a new submission. The final code fixes have not produced two successful
autonomous cloud films; that acceptance criterion remains unmet.

## Local evidence delivery

The background reader is at **http://127.0.0.1:8767/**, process 8928. It labels both attempts
blocked and serves their original prompts, cited research, narratives, plans, image corrections,
review decisions, provider usage and signed exports. It does not display a placeholder film.
The earlier reader on port 8766 still responds with HTTP 200 and its process was preserved.

The downloaded evidence archive matched remote SHA-256
`97e8a3e95ca10e033216263f82b54ac8ddf2149beddf0641f1885371d32aeece`.
All 13 exported artifacts matched their signed descriptor hashes locally and over HTTP.
HEAD and byte-range requests passed for all 13 files; the Rocket audio fully decoded over HTTP.
No MP4 existed, so actual video playback, seeking and cloud audiovisual review could not be
verified. The earlier FFmpeg and SDK fixture tests must not be confused with that missing proof.

Public textual receipts are in [autonomous-delivery-2026-09-08](autonomous-delivery-2026-09-08/):
[outcomes and budgets](autonomous-delivery-2026-09-08/verification.json),
[HTTP verification](autonomous-delivery-2026-09-08/http-verification.json), and
[deployment digests](autonomous-delivery-2026-09-08/deployment.json).
The new local delivery directory is `.scratch/hackathon-launch/runtime/autonomous-delivery-2026-09-08/`.
