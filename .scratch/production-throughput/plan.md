# Production throughput and reliable progress

Accepted September 9, 2026: retain automatic image review/correction, remove final
audiovisual model review, deliver technically verified output, process independent
images continuously with at most two generations and two reviews concurrently.
Preserve narration, accepted assets, explicit stop, durable recovery and spending
evidence. This is not a new spending ceiling.

## Completion requirements

- [x] Compact immutable image references in compiled documents, bindings and new receipts;
  read historical inline assets without rewriting signed historical receipts.
- [x] Measure receipt verification and eliminate duplicate work under valid integrity guarantees.
- [x] ADK workflow for independent image pipelines with separate bounded generation/review
  capacity, stable operation identities, per-image checkpoints and safe concurrent commits.
- [x] Recover completed generations/reviews without duplicate dispatch; retain unknown outcomes
  for reconciliation; stop new work while preserving in-flight results.
- [x] Deliver rendered, decoded media without final audiovisual model review or automatic
  film correction; preserve historical evidence without mislabelling new films as reviewed.
- [x] Accurate per-image and render progress, timestamps, elapsed time and connection state.
- [x] Profile render phases, reuse the immutable renderer bundle with correct invalidation,
  and evaluate CPU/concurrency sizing against representative measurements.
- [x] Update domain/operating documentation and compatibility/recovery tools consistently.
- [x] Verify concurrent completions, lost responses, crash recovery, stopping, receipt tampering,
  technical delivery, browser progress and representative rendering.
- [x] Build/deploy the verified changes and check deployed source versions and application
  behavior without resuming unrelated saved films.

## Working evidence

The starting worktree contains extensive prior uncommitted work. Preserve it.
The handoff measured 791,936,889 bytes across 52 receipts, repeated data-image URIs,
and a roughly 7.5-minute render on two CPUs; causal timing shares are unmeasured.
The original code had one global pending step and one outstanding provider dispatch;
Production commits rejected stale revisions. Parallelizing calls alone was insufficient.
ADK is pinned to 2.7.1 in the crew Dockerfile; system Python has no ADK installed.
Official docs consulted through Context7 and adk.dev describe dynamic parallel nodes
and at-least-once tool execution on resume. Production must retain deduplication authority.

Validated locally: full TypeScript suite 1,153 tests, full Python suite 748 passing/1 skipped,
then additional progress and recovery cases; all workspace typechecks; generated contracts;
browser flow from concurrent images through measured frames to honest technical delivery;
real cached-bundle render and full H.264/AAC decode. The five ADK workflow tests cover separate
capacity pools, answered-review crash recovery, unknown-review refusal, completed-generation
reconciliation, and stopping with two generations in flight. No real provider call was made.

Cloud read-only pre-deploy: no queued/running/awaiting-image job. Existing completed film and
three blocked films retained. Installed service units match archived boot metadata. Production
is e2-standard-2; worker is e2-small. No machine size changed. CPU comparison and immutable
container deployment verification are complete. Deployment source revision is
`1125a50892d8d3d1`; `images.json` contains the three immutable references. See
`deployed-verification.json`, `browser-verification.json`, and `render-comparison.json`.
The pre-existing crew checkpoints and journals pass their before/after digest comparison.
No existing film was resumed and no new paid production was started.
