# Production throughput — deployed September 9, 2026

The coherent Studio path is now preparation → recorded narration → independent image
generation/review/correction → final compilation → rendering → technical file verification → ready.
Automatic final audiovisual model review and its automatic film-correction loop are removed.
Explicit user corrections remain available and preserve the recorded narration.

- Each image has its own ADK activation, checkpoint, creative context and provider journal.
  Two generation slots and two review slots are independent; finishing generation releases
  capacity for the next image while the previous image is reviewed.
- Production reserves and commits image jobs under its Run lease; external calls occur outside
  the lease. A replay recovers a completed job or saved review response. An unknown result
  stays paused. Stop prevents queued calls while preserving in-flight results.
- New documents and receipts use `vox-asset:sha256:` references; verified image bytes are
  materialized only for rendering. Identical image bytes share an immutable artifact path.
  Historical signed receipts are never rewritten, so their existing verification cost remains.
- Receipt verification is reused inside a lease-protected operation and repeated across later
  operations. Tamper and crash-recovery checks remain active.
- The UI shows per-image activity, approved/required counts, timestamps, measured rendering
  and encoding frames, and connection recovery. A 15-second request timeout avoids hanging
  browser polling. `run.progress` is observational and never authorizes delivery or retries render.
- The Docker image contains the renderer bundle built from its exact source/dependencies.
  Each render receives its own audio directory. A new film is `ready` only after digest
  verification and full video/audio decoding; existing `reviewed` films retain their evidence.

## Verification

The full TypeScript suite passed 1,153 tests before the added render-progress case; that case
and the final focused suite also pass. The full Python suite passed 748 tests with one skip;
two additional targeted ADK cases also pass. The five workflow cases exercise overlapping
generations/reviews, answered-review crash recovery, unknown-response refusal, completed-image
reconciliation and stopping with two calls in flight. The 47-case compatibility suite passes.
All workspace typechecks and generated contract checks pass.

The eight existing browser cases passed; the added image → render → technical-delivery case
passes on desktop and mobile. A real rendered MP4 passes codec inspection and full FFmpeg
decoding. Concurrency tests use deterministic provider doubles; no new paid production was
started to claim a full live model-to-film validation.

## Measurement and sizing decision

The same recorded 27.819-second film was rendered at 1920×1080 H.264/AAC in local Linux Docker,
with a 4 GiB memory cap. One run at each CPU cap, with matching renderer concurrency:

| CPU cap | Bundle copy | Composition | Render + encode | Total |
| --- | ---: | ---: | ---: | ---: |
| 2 | 0.15 s | 1.17 s | 166.62 s | 168.21 s |
| 4 | 0.14 s | 1.00 s | 104.45 s | 105.66 s |

Four CPUs reduced local elapsed time by 37.2%. This is a local comparison, not a cloud speed
guarantee or a measured end-to-end production gain. Both files decode fully and have matching
duration, resolution and codecs. Existing font loading requires network access. Keep the
deployed e2-standard-2 machine; expose `VOX_RENDER_CONCURRENCY` for later controlled sizing.

## Deployment evidence

Source revision: `1125a50892d8d3d1`. The exact image source verification covered 278 Production
files and 49 Python source files in each Studio image. The worker runs ADK 2.7.1 and SQLAlchemy
2.0.52. Registry references are in [images.json](images.json).

Production, worker and API run their expected immutable images. Installed units were checked
against archived boot metadata before the upgrade; backups and updated boot metadata retain
existing execution settings. Existing checkpoints and provider journals pass the before/after
hash comparison. The four saved films retain their original statuses: one reviewed, three blocked.

The deployed signed protocol publishes `run.progress`; the historical completed Run still
verifies as rendered. The browser loads the new interface, preserves the historical review,
refreshes successfully and has no mobile overflow or JavaScript error.

- [Signed runtime verification](deployed-verification.json)
- [Browser verification](browser-verification.json)
- [CPU comparison](render-comparison.json)
- [Source manifest](source-manifest.json)
- [Architectural decision](../../docs/adr/0026-independent-image-work-and-technical-film-delivery.md)

The design follows ADK's documented [dynamic workflows](https://adk.dev/graphs/dynamic/) and
[resumability semantics](https://adk.dev/runtime/resume/): replayable workflow execution does not
replace application-level paid-effect deduplication. ADK's resumability remains experimental;
the deployed version is pinned and application checkpoints retain the effect authority.
