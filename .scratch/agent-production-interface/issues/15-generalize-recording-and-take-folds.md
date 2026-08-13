# Generalise recording and Take folds

Type: task
Status: resolved
Blocked by: 06, 08, 12

## Objective

Replace the shipped-plan-only recording shell with injected functions that can synthesise any
validated ordered Beat text and produce verified Run Take artifacts without repository paths.

## Scope

- Refactor `@vox/voice` so synthesis accepts arbitrary Beats and complete public voice settings;
  keep provider credentials in an injected service-side adapter.
- Extend the manifest with full audio/alignment binding, Recording-input identity and full
  `takeSha256` while retaining the 12-character display `takeId`.
- Separate provider response persistence from pure alignment folding and produce immutable
  Beat-shape folds keyed by ordered `{ id, text }`.
- Verify audio, canonical alignment, exact text/segmentation and a fresh fold at every API
  boundary; never rely on Git or hardcoded repository paths.
- Keep the shipped recording/refold workflows working through thin adapters or deliberately
  migrate them with tests and documented paths.

## Acceptance

One provider response can produce a verified Run Take and multiple quota-free id-renamed folds;
spliced, stale or text-mismatched artifacts are refused before any consumer output.

## Verification

```text
pnpm --filter @vox/voice typecheck
pnpm test -- packages/voice/tests/fold.test.ts packages/voice/tests/take.test.ts packages/voice/tests/run-take.test.ts
```

## Answer

Implemented 2026-08-13.

- `requestSynthesis` accepts arbitrary Beats, the complete public voice settings and an
  injected provider adapter. Only `createElevenLabsAdapter` receives the service-side key;
  the pure call surface contains no credential or repository path.
- `RunTakeManifest` binds ordered Beat texts/segmentation, voice settings,
  `recordingInputSha256`, exact audio and canonical alignment hashes, full `takeSha256` and
  its 12-character display `takeId`.
- Raw provider response and folding are separate. `foldRunTake` verifies the complete Take
  before deriving a Beat-shape-keyed fold, so an id-only rename yields a new quota-free fold
  over the same full Take.
- Every verification boundary checks recording input, audio bytes, alignment, full identity,
  exact alignment text/time arrays and a freshly recomputed fold. Splices, changed text,
  changed segmentation and edited TimedBeats are refused.
- The shipped `record-take.mts`/`refold.mts` paths remain deliberate repository adapters;
  their former implicit seed now resolves explicitly to the accepted seed 7.

Verification actually run:

```text
pnpm --filter @vox/voice typecheck
  PASS
pnpm test -- packages/voice/tests/fold.test.ts packages/voice/tests/take.test.ts packages/voice/tests/run-take.test.ts
  PASS — 3 files, 31 tests
git diff --check
  PASS
```
