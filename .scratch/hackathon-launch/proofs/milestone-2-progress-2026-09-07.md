# Milestone 2: implementation and deployment, session 12

Historical session-12 record. The video was subsequently produced and delivered; see the
[September 8 delivery and technical acceptance](milestone-2-delivery-2026-09-08.md).

Observed 2026-09-07. **The milestone is not complete:** no Parallel-backed research,
creative video Run, generated image, narration or MP4 has been produced in this session.
The user requested a handoff before providing the Parallel key, and wants its provisioning
added to `scripts/provision-cloud-project.sh` in the next session.

## Implementation and decisions

The user selected Gemini grounding with Parallel Search and delegated editorial/technical
choices for the first video. The exact Brief, operator policy, execution limits, image grant
signer, provider integration references and operational steps are maintained in
[`deploy/crew/milestone-2/`](../../../deploy/crew/milestone-2/README.md).
That runbook owns the procedure; this file owns observed evidence.

The first video's subject is Falcon 9 first-stage landing, in English, for a general audience.
The live research adapter validates actual search queries, cited sources and support byte ranges
before creating the provider-neutral dossier. Models retain their named ADK roles. The hosted
provider journal counts dispatches across attempts, captures response usage and refuses uncertain
prior dispatches. Image acceptance and digest-verified export have explicit operator commands.

## Cloud changes and actual deployed images

- Enabled `aiplatform.googleapis.com`.
- Created custom role `projects/studio-prod-7f3a/roles/voxInferenceCaller`, containing only
  `aiplatform.endpoints.predict` and `serviceusage.services.use`, and bound it to the crew and
  Production service accounts. Read back both bindings.
- Created the empty `PARALLEL_API_KEY` secret with an accessor binding for the crew account.
  Latest metadata check found **no enabled version**. No key value was read or printed.
- Built, pushed and read both image digests back from Artifact Registry:
  - Crew: `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox-crew/crew@sha256:fa49a9334580558db760aea496524278aa4866101f1e864051c910120d5d080b`.
  - Production: `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox/production@sha256:dcea1c8238bc0b3f9bda9b96fb2c264e78ce4ebf0e71559f13b232837a98566e`.
- Revision label for both: `166b078-milestone2-wip`; implementation changes remain uncommitted.
- Rendered both boot configurations with `--live`, applied metadata and performed controlled
  stop/start cycles. Both VMs returned RUNNING. Production's running image matches the digest,
  its listener is `127.0.0.1:8080`, and its data disk remains `/dev/sdb`, ext4.
- Crew setup and bridge units are active. The live attempt unit is installed but has not been
  started. Its Parallel secret fetch runs only on an explicit attempt, leaving boot/probe
  independent of that missing key.
- Staged the canonical Brief as `/mnt/disks/vox-crew/state/request.json`, mode 0600, UID/GID
  10001. Read back the call limits. No `state/briefs` directory existed at that check.
- Current generated metadata files (ignored): `.scratch/hackathon-launch/runtime/crew-milestone2.json`
  and `production-milestone2.yaml`. Older `crew-cloud-init.json` and `production-bridge.yaml`
  belong to the preceding deployment; do not reinstall them accidentally.

The crew Linux image reports ADK `2.7.1`, Google Gen AI `2.19.0`, the Parallel tool type present,
and no `/app/packages/production` source directory.

## Runtime verification

The crew's signed probe succeeded at `2026-09-07T21:54:41` UTC after redeployment. It retained
the session-11 persistence marker, public connectivity Run and status digest recorded in
[the preceding proof](cloud-path-progress-2026-09-07.md). All seven contract hashes matched.
This probe made zero provider calls and does not constitute a creative Run.

`deploy/crew/check-inference.py` then made one deliberately bounded, non-retried Google Cloud
call from the crew VM with its service identity. `gemini-3.5-flash` returned `READY`, reporting
7 prompt tokens, 1 candidate token, 68 thought tokens, 76 total tokens. The response identified
model version `gemini-3.5-flash`. Evidence is on the crew disk at
`state/inference-readiness.json`; the script refuses to run again if that file exists.
This proves basic inference, not Parallel access or actual ADK creative authorship.

`deploy/crew/check-voice.mjs` ran inside deployed Production. The read-only ElevenLabs voice
request returned HTTP 200 for the configured voice, named `George - Warm, Captivating Storyteller`.
It made zero narration calls. No provider credential was printed.

All eight deployed Production smoke checks passed: socket readiness, malformed/forged request
refusal, signed answer, contract index, replay refusal, available-egress control and denied
adapter egress. The prior SSH/secret/registry isolation suite was not rerun after adding the
inference-only role; do not claim a new full isolation proof.

## Tests and artifact checks

- Complete Python crew suite: 569 collected; 568 passed, 1 skipped. Only existing SDK
  deprecation warnings were reported. The suite includes the grounding, usage, hosted and
  verified-export tests.
- Renderer suite: 10 passed, including live-unit configuration and absence of paid boot start.
- Google image adapter: 4 passed; Production TypeScript check passed.
- Deployment contract checks: all passed.
- Production image leak scan: 351 files, no violations; `/etc/vox` absent. The scanner was
  mounted read-only because it is intentionally excluded from the image.
- Image-grant test executed in a disposable Production image with a synthetic key and no
  Production disk: signature correctness, identical-request reuse, second-request refusal,
  and secret-free terminal output all passed.
- TypeScript formatting applied; diff whitespace check passed before final documentation.

Local deployed implementation file SHA256 values:

| File | SHA256 |
| --- | --- |
| `services/agents/src/vox_crew/grounded_research.py` | `b3aeda36941239b3fee926d6259fc549502d54e4746818e948b054dd0885bc2f` |
| `services/agents/src/vox_crew/hosted.py` | `704d81d4e8f0e6b935b66126c50dcc62322bb17e9a27e0de73bb6fab6cb5c82d` |
| `packages/production/src/image/google.ts` | `0d23c33b85ead8add1915fc12b79dc4b5b18f212c346a480859a3014429c5bce` |

## Remaining acceptance work

Modify the existing credential wizard as the user requested; then let the user provision the
Parallel key there. The secret resource already exists without a value: inspect the wizard's
`capture_secret` existence check so an empty resource cannot be mistaken for usable credentials.
Do not rerun unrelated destructive provisioning or rotate existing Production secrets.

After the key is installed, run the hosted factual Brief with actual grounded research and live
authors. Exercise and repair any real-path failures, authorize the one exact image request,
view/accept its candidate, resume the same Run and deliver its narrated MP4 and source/usage
evidence. Image inference and creative role output quality are not yet verified live. Preserve
uncertain operations and existing paid work instead of blindly restarting. Human viewing of
the finished narration/visuals still remains an exit criterion.
