# Studio rehearsal and reliability — September 8, 2026

Status: in progress. This report does not close the milestone.

The user authorized one new paid run in this session to complete rehearsal evidence.
Keep the existing operator ceilings: 40 counted dispatches, four searches, five image
generations, one Take. This is a new request-bound authorization, preserving all prior
Runs, envelopes and journals. Human image acceptance and final viewing remain human decisions.

## Baseline actually observed

The existing lightning/thunder job `613ce79f-de42-4116-858f-c314c96f16d1` remains blocked.
The current API and worker are active; neither the final review nor the terminal was changed.
The diagnosis already recorded for this film remains authoritative.

The hosted browser rehearsal at 18:30 UTC passed refresh, 1080p playback, seeking,
ten source links, three complete downloads, authenticated ranges, anonymous denial,
offline/reconnect, mobile layout and logout/session revocation, with no page errors.
Each download was 7,067,024 bytes and matched SHA-256
`28414a2d9e651ebae5ad8e32ec39ae2e6b7f15ed354f3e419ceb1e217c19ad62`.
Transfers took 1.8–2.8 seconds. The previous isolated IncompleteRead was not reproduced.

Evidence: `../runtime/studio-rehearsal-20260908/baseline/browser.json`, desktop/mobile
screenshots, MP4 downloads and `rehearsal.webm`. This backup is visibly an unvalidated draft.
The reusable browser runner is `deploy/studio/rehearse.cjs`; it records only after login.

## Reproduced interface failures and fixes

- Drop the HTTP response after the real API commits a Brief, then refresh: the form and
  admission key were lost. Persist the pending payload/key in tab session storage before
  admission, reuse them after refresh, clear them on acknowledgment or explicit logout.
  The regression test proves that the retry returns the original ID and only one job exists.
- Fail the initial session request: the existing built interface hid the connection error.
  Expose that error with an explicit retry and preserve unknown authentication until resolved.
  The regression test restores the network and reaches login through the retry button.

Four browser tests, frontend typecheck/build and 42 Studio/autonomous tests pass locally.
Two additional tests exercise a crash inside the real AutonomousRun human-image hook and a
completed render whose response is lost to the crew. All 12 Studio tests pass, including those
new cases. The render failure uses a simulated Production client, not a live hosted network cut.
`test_journal_ceiling_survives_reconstruction` covers budget exhaustion across reconstruction.

## Hosted deployment and admission

Deployed API: `studio-api@sha256:01b84be0d8dfe34a21f85fd5973b8670ac0f561d9db82febc41d96291bcaa718`.
The 92-file image scan passed; its registry digest was read back. Only the API unit and setup
pull reference changed, after checking prior file hashes and backing them up under
`/mnt/disks/vox-crew/studio-operator/api-before-rehearsal-20260908`. The worker PID was unchanged
by this deployment. Updated crew boot metadata is installed.

Browser submission: `b68869a4-e436-43b2-8985-a57ca8f7455f`, the same lightning/thunder question,
50 seconds, English. Hosted session-error retry, lost POST response after commit plus refresh,
and eight concurrent duplicates passed, returning one ID. Rebinding returned 409, arbitrary
budget fields 422 and foreign Origin 403. Evidence: runtime `admission.json`, `submitted.png`.

Request digest: `4a014b4f0922cbba0136346bcb70086e2bcabf4cfdc2f41ca6f69ddefeebef81`.
Its new five-image envelope expires September 10 at 00:00 UTC. Production and operator copies
matched SHA-256 `fa53298c9a97e3fded4d8144b1ecd1c6ae6911429383aae558e51d71db854c0a`.
No previous envelope changed. The worker claimed that same submission.
Fresh signed contracts/status at 18:34 UTC passed with zero provider calls, preserving marker
`1460309a-d208-4bd4-a7da-cad6440fe8dc`.

## Live worker crash and recovery

Run: `68871fb6-927a-4549-b194-ae72261d4c97`. At the first human-image gate: 14 counted calls,
one search, one image generation and one Take; no pending provider/action. One technical repair
is consumed. The API shows 14 sources.

Exact crew and Studio work directories were archived before the crash. Docker killed the worker
with SIGKILL from the host; systemd then reported MainPID 0, failed, exit status 137. Starting
the worker marked the same job interrupted with an actionable message, without purchasing work.

After stopping the executor, `studio_worker reconcile` checked the original nonterminal state
against fresh signed Production status. Its receipt at 18:43:09 UTC records a match, zero calls
and checkpoint hash `96d196ae6ec78fe648c4a4161d3cd4f15b2e7397f7e0cf08630313f1cde981c4`.
The restarted worker (PID 22715) returned to the same image gate. Separate assertions proved the
same Run, candidate and limits, with byte-identical provider journal
`2ba004c69fef48aee555215d125f4dd6b878dfb60492ab203873bb75dd63f3dd`.

Archive: runtime `recovery.tar.gz`, transferred as binary bytes by SCP. Its extracted
`b68869a4-e436-43b2-8985-a57ca8f7455f/recovery-proof.json` contains the assertions and
reconciliation receipt. `interrupted.json` records the actual API failure state.
This is a live crash/recovery proof, distinct from simulated failure tests.

Candidate `b56b470c3996ae11046f891402e3e82d2d438cc4abf9d8f195bc45bd03b598fc` was downloaded,
hash-verified and shown to the user. Human approval remains pending; none was invented.
Worker image `studio-worker@sha256:4b7474f742e35a5f2c31e9d9bb23b06114ea334387458c2a4be7431cdb3fed85`
was built/scanned/pushed with the existing local queue-message fix but is **not deployed**.
The live trial and recovery use the original pinned worker image.

## Prepared render-disconnect experiment (not yet exercised)

Later September 8 update: the temporary crash override described below was archived and removed;
the original pinned worker was restored without requeueing any job. See the
[retirement evidence](studio-user-corrections-2026-09-08.md#hosted-test-harness-retirement).
The experiment remains unexercised. The following configuration is historical.

`deploy/studio/reconcile_render.py` is implemented and documented in ADR-0025/runbook.
Nine tests prove preview-only behavior, archived explicit adoption followed by actual
AutonomousRun continuation to review without rendering again, and refusal on terminal state,
wrong pending action, changed plan/limits/Production, unanswered provider dispatch or bad media.
The complete relevant Python run now passes **53 tests**, plus the four browser tests.

The hosted worker currently has the temporary override
`/etc/systemd/system/vox-studio-worker.service.d/rehearsal.conf`. It runs the same pinned image
through `/var/lib/vox-studio/rehearsal-render-worker.py`. This one-shot harness targets only
Run `68871fb6-927a-4549-b194-ae72261d4c97` and exits with code 86 two seconds into its first
render call, to drop the real HTTP connection. It has not fired: human image approval is pending.
Installing the harness used a stopped executor and a second successful generic reconciliation
of the same human gate. The harness worker is running with PID 23161.

On continuation, inspect both API and worker/process state before acting. If the injection fires:

1. Verify process exit and read the one-shot marker at
   `/mnt/disks/vox-crew/studio/operator-rehearsal/b68869a4-e436-43b2-8985-a57ca8f7455f/render-disconnect.json`.
   `renderReturned: false` distinguishes the real in-flight disconnect from a very fast response.
2. Remove only the temporary `rehearsal.conf` override, daemon-reload, start the original worker
   to mark the saved job interrupted, then stop it and wait for that operation to finish.
3. Observe signed status for the **same Run**. Observation delay is not permission to render again.
4. Run `/var/lib/vox-studio/rehearsal-reconcile-render.py` in a one-off pinned worker container,
   with the usual network.env, Studio/crew state mounts and readonly operator config. Preview first;
   apply only when it verifies unchanged inputs, completed signed preview and full decoding.
   If refused, inspect the cause; never clear pending/terminal markers manually.
5. Start the original worker to continue film review, export and human viewing. Confirm one
   render dispatch and unchanged earlier provider journal entries. Recheck final hosted media.

The source harness, temporary unit, queue helper and completed-render tool are retained in the
ignored runtime folder. No paid rerun or image acceptance is implicit in any of these steps.

## Remaining evidence

Latest observation after the user's image decisions: the first image was accepted, then all
three candidates for `propagation_light` were rejected by model review. The run is now terminally
blocked at 23 counted calls, four generated images and one Take, with no pending provider.
The render-disconnect harness never reached rendering. Earlier references to pending human
approval above are historical. See the [rejection diagnosis](studio-image-rejections-2026-09-08.md).

- Actual hosted render-disconnect evidence. The simulated failure test proves conservative
  refusal and no repeated command, not live transport recovery.
- One newly authorized browser submission, human image decision, complete byte-bound
  audiovisual acceptance, signed export, full audio/video decode and human viewing.
- A saved rehearsal of the final accepted result, with usage and elapsed time recorded.

The later capabilities/catalog and voice milestones still require final release rehearsal.
