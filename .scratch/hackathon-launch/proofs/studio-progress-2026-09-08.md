# Private Studio implementation — September 8, 2026

The user requested the Studio, then requested a commit of the prior work first.
That baseline is `74dade4`. The user subsequently confirmed private workspace access.
The Studio changes below are new work after that baseline.

## Implemented

- `apps/studio`: responsive private workspace, access-code sign-in, new Brief form,
  persistent film selection, actual phase activity, narration, cited sources, image history,
  digest-bound image decisions, native playback and downloads. The production app is separate
  from the internal capability gallery.
- Python Studio API: durable idempotent submission, cookie sessions, strict Origin checks,
  single-workspace media authorization and digest verification, byte-range playback.
- Separate worker: queue claim transaction, exclusive OS locks including the existing crew
  lock, original request preparation, explicit immutable authorization, real AutonomousRun
  adapter, public checkpoint projection, verified media cache and final audiovisual decoding.
- Studio human-image mode is fixed on checkpoint creation. Model rejection cannot be
  overridden by the browser; human rejection returns to bounded image correction and retains
  the existing Take. This behavior is covered through the actual AutonomousRun test harness.
- Interrupted work can only be requeued from a nonterminal checkpoint with no pending action,
  no unanswered provider dispatch, unchanged request/language/ceilings, unexpired authorization
  and a fresh matching signed Production snapshot. Unknown render outcomes remain paused.
- [ADR-0025](../../../docs/adr/0025-studio-admission-is-durable-and-separate-from-production-authority.md)
  and [runbook](../../../deploy/studio/README.md) record the boundary and operation.

## Verified locally

- Frontend TypeScript, production build and Biome checks pass; `git diff --check` passes.
- Existing 32 autonomous tests and the initial eight Studio tests passed together. The final
  ten Studio tests pass, adding checkpoint recovery and human-rejection correction through
  the real autonomous control flow. No test invokes a paid provider.
- Two browser tests pass using installed Edge and a disposable real HTTP API: private sign-in,
  saved Brief, stable work after refresh, source panel, mobile overflow and anonymous denial.
- Imported the historical Sky public delivery using its matching export index, checked media
  digests and decoded audio/video. Its recorded status remains blocked and its preview incomplete.
- A separate real-browser verification of that import confirmed a playable 56.576-second,
  1920×1080 MP4, seeking to 23 seconds, six source links, seven candidate images and no page errors.
  The inspection does not constitute scientific or audiovisual acceptance of that old film.

Local server: `http://127.0.0.1:8780/`. State and ignored access-code file are under
`../runtime/studio/`; PID, stdout/stderr, browser verification and Sky screenshot are there.
Browser test captures are under `../runtime/studio-browser-tests/`. At this local-verification
stage, provider workers were not
started and no additional generation was purchased. The previous eight-image authorization
remains exhausted and has not been reused for Studio.

## Still required for milestone completion

- Complete a fresh browser-to-reviewed-film trial, human image interaction, verified final
  media delivery and human viewing. Preserve actionable blocked states if that trial fails.
- Consolidate final verification and deployment references. The Studio milestone remains open.

## Hosted deployment and authorized trial

The canonical private workspace is now at
`https://vox-studio-164544259455.europe-west1.run.app`. The same private access code as the local
workspace is provisioned separately on the VM's persistent disk, never in metadata or images.
The API runs on the existing crew VM, backed by its ext4 disk. A stateless Cloud Run proxy
provides HTTPS through a dedicated `/26` subnet with only TCP 8780 allowed toward that VM.
The separate proxy identity has no application IAM roles or secrets. Cloud Run is limited
to one instance, minimum zero. Existing Production ingress and its bridge were preserved.

Deployed references (verified against Artifact Registry):

- API, initial deployment: `studio-api@sha256:e11c33c1fb059e0c3e1716ac0bfe13592450a0c663128da6ee2e3d20e37e86ca`.
- API, current status correction: `studio-api@sha256:cdda9ce19cf41f47318ae40f04fb464e0d8c2d4e8ddcb9ec02fd4f2e2e9713a2`.
- Worker: `studio-worker@sha256:cccfec947651d598a0d4071c6c105b61a7884adfba1f25416b4397ba90a1eac7`.
- Proxy: `studio-proxy@sha256:218782dce99f145af68529842a0bdcce4c0233e203b2d9671a5ccdd51475d6c6`.

All are in `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox-crew/`. Runtime records are under
`../runtime/studio-deploy/`. API/worker image scans passed (95/92 files, including the static
bundle); the Linux API container passed real cookie login and database access before deployment.
Cloud Run revision is `vox-studio-00001-wld`. Boot metadata was archived first, then the actual
installed crew metadata and unchanged Production metadata were verified by hash.

The hosted worker image successfully read real signed Production contracts/status with zero
provider calls and preserved connectivity marker `1460309a-d208-4bd4-a7da-cad6440fe8dc`.
The historical Sky import remains recorded and blocked. A real browser through HTTPS played
its 56.576-second 1080p MP4, sought to 23 seconds, read six sources and seven images without page
errors. A saved new brief survived browser refresh. A later API service restart preserved the
same session and jobs while the worker PID stayed unchanged; authenticated HTTP ranges returned
206 and anonymous media access returned 401.

The user explicitly replied **OUI** to the proposed new trial: 40 total counted dispatches,
including at most four searches, five Google image generations and one narration. This is a
new authorization; the exhausted eight-attempt Sky recovery policy was not changed.
The actual browser-submitted brief is `613ce79f-de42-4116-858f-c314c96f16d1`, original prompt
`Explain why we see lightning before we hear thunder.`, 50 seconds, English. Its prepared
request digest is `bc605f916918b646c1e78628b641ee46c7a56e677c16ea99fbe8c82ce6c03fa2`.
The exact five-image envelope was installed by the Production operator, then authorized in
Studio. The worker claimed that same submission. Research and narration have started; a
complete reviewed film and human image decision are still pending.

The status-message correction is now deployed in the API/static image: running work shows its
latest phase, while an awaiting-image job keeps the human-review instruction. The image passed
the 95-file scan and its registry digest was verified. Only the setup pull reference and API
unit changed, after checking their previous bytes and saving a rollback copy on persistent disk.
The API restarted successfully; the live worker PID was unchanged and authenticated HTTP readback
still showed the same pending candidate. Updated crew boot metadata is in
`../runtime/studio-deploy/status-v2/`. The worker keeps its original pinned image during this trial;
its local queue-claim message improvement has not been deployed in that running worker.

The new Production Run is `24c27f73-faff-4f8c-a7b4-e87fe8103f43`. Its last inspected checkpoint
recorded 19 total counted calls, one search, two image commands, one Take, one technical repair
and no uncertain provider dispatch. These counters are a point-in-time observation, not final
consumption. The public submission currently has ten sources and waits for human approval of
candidate `55832adeb0489f0b50b6f49e1fe8ea5316ff5468d1181f16e9761cbb67a891d2`.
The previous candidate was rejected by model review; the second passed model review and its
downloaded bytes were hash-verified and inspected. The user's budget authorization is not a
human image acceptance. No image decision has been fabricated and no final MP4 exists yet.

Assessment: the private hosted Studio and bounded workflow can support continued milestone
work, but end-to-end delivery reliability and Hackathon demo readiness remain unproven until
this authorized trial produces a complete reviewed, decoded film and a human rehearsal.
