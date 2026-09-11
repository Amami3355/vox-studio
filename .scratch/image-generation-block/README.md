# Image-generation blockage — 2026-09-09

Run `cbfe43c8-ce0d-457f-bc5c-4b108500cffa`, Studio submission
`bd16fc84-1608-46c5-9df7-f60472ee7b93`.

The first Olympia candidate was rejected by image review. Its PNG was 8,755,620 bytes.
The next exact edit request was refused before dispatch with `IMAGE_EDIT_SOURCE_TOO_LARGE`.
The Python worker dereferenced the refusal's null `data`, raised `AttributeError`, and left
its journal dispatch open. Each saved continuation then queried a job that had never been
created and dereferenced another null response (`IMAGE_JOB_NOT_FOUND`).

Production now encodes oversized source references as WebP before consuming a job or grant,
trying lossless first and quality 95 at unchanged dimensions if necessary. The original
artifact and its digest remain untouched. Worker command handling, read-only reconciliation
and Studio media projection tolerate null failure data while preserving uncertain outcomes.

The actual original image was tested offline in the candidate Docker image: 5,897,314-byte
WebP, 2752 × 1536, with decoded RGBA pixels identical to the original.
See `reference-verification.json`.

Validation: 23 Production lifecycle tests, 13 Google adapter tests, 34 worker/continuation
tests, Production TypeScript checks, Biome, and image credential scans passed. The captured
run and pending decision were also replayed through `retry_refused_operation.py` with
deterministic clients: one exact request, no checkpoint or journal edits, same continuation.
Python tests use a short Windows temporary path to avoid the repository's long-path issue.

Production and worker images derive from their exact active images; changed files were
compared with HEAD before overlaying the patch. API/frontend and renderer bundle remain in
their original images/layers. Per-host runtime payloads retain exact before/after files,
boot metadata and rollback references. Deployment receipts and live source verification
are stored in this directory. These are private operational artifacts.

Recovery deliberately requires the original verified pre-dispatch refusal, matching saved
request bytes, exact pending operation and continuation, fresh Production state, rejected
source digest and exclusive worker locks. It reserves the existing continuation and replays
only that exact idempotent request; ordinary missing-job reconciliation still refuses an
unproved retry. The normal worker then adopts the durable image result and continues review.

Completed: the same Studio submission is ready, all three images are accepted, and the 33,521,297-byte MP4 passed full audio/video decoding and digest verification. Narration and the two previously approved image histories match the pre-recovery checkpoint. See `completed.json` and `delivery-evidence.json`. Source changes remain local and uncommitted.
