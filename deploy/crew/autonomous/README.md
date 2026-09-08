# Autonomous prompt submissions

The worker accepts an original prompt, optional target duration and language:

```sh
python -m vox_crew.hosted prompt "Explain why the sky is blue." \
  --submission-id sky-demo --config /etc/vox-crew/autonomous
```

Operator configuration supplies `prompt-defaults.json`, `operator-policy.json` and
`execution-limits.json`. No provider options or grants appear in the original prompt.
`--prepare-only` stages the exact request and prints its purpose-tagged digest without
provider work. An operator installs the matching envelope in Production's
`VOX_AUTONOMOUS_IMAGES_DIRECTORY/envelopes/<requestSha256>.json` before paid execution.
The envelope schema is `{schemaVersion:1, requestSha256, maxImages, expiresAt}`; it is trusted
operator configuration, never supplied through the crew API. Its state directory must persist.

The default limits are 40 total dispatch attempts, including four grounded searches, five
image generations and one recording. Rejected candidates consume the same limits. The
Production ledger reports actual media jobs and Takes separately from model usage metadata.

Image jobs retain normalized provider diagnostics in `failure`: HTTP status codes, or the
response's image count, supported MIME type, finish reason and prompt block reason. Provider
messages, text responses and credentials are excluded. A transport exception without a confirmed
HTTP outcome is `uncertain`, not a confirmed failed generation. Neither classification starts a
retry; observation and repeated commands reuse the existing job and preserve consumed grants.
An API-key test on an operator workstation exercises Gemini Developer API billing, not the
deployed Production service's Vertex AI identity or project quota.

An explicitly approved exception can be installed separately at
`<VOX_AUTONOMOUS_IMAGES_DIRECTORY>/recovery/<requestSha256>.json`, using the published
`imageRecoveryPolicy` schema. It binds one original request and Run, expires, permits at most
eight total attempts, and authorizes only confirmed HTTP 429 retries. Never rewrite an envelope.
Production exposes `imageRecoveryPolicy` with `attemptsUsed` and `nextImageDispatchAt` in signed
status. `retryOf` names the latest failed 429 job and preserves the exact provider request.
Retries have distinct counted jobs and idempotency; all previous jobs and grants remain.
Production returns `IMAGE_RATE_WAIT` before an early dispatch. The worker waits at least the
policy interval, doubling consecutive 429 delays up to eight intervals, before journaling a call.
Unknown transport failures cannot retry. Global calls, searches and the Take allowance remain.
`reconcile_image_recovery.py` previews by default; `--apply` archives the checkpoint and journal,
checks every response and the signed snapshot, then adopts only the approved policy and clears
the specific three-image HTTP 429 block. Resume the same submission ID after this reconciliation.

Production's placeholder worklist excludes failed resources, whose fallback is a distinct state.
V2 therefore also visits every authored image requirement on resume, retaining cached intents and
commands, before permitting delivery. An accepted retry replaces the failed resource in current
resolution; the old job stays in the ledger. Only the latest job per identity supplies a resource.
Previously published exact jobs remain observable/retryable after recompilation removes their
placeholder; plan identity, retry policy, request digest and grant checks still apply.
`reconcile_image_precondition.py` is restricted to the diagnosed `IMAGE_REQUIREMENT_NOT_PENDING`
refusal before provider dispatch. It verifies the signed seven-job ledger view, archives the
refused command response, retains its global dispatch count, and appends `providerDispatched:false`
to its accounting evidence. Only that failed command cache entry and terminal are cleared.
Delivery distinguishes image command attempts from actual provider generations and compares the
latter to the signed Production count; a refused internal command does not consume a Google image.

Before spending PlanRepair, V2 can apply one `DEICTIC_ANCHOR_REQUIRED` refusal when exactly one
anchor in Production's `expected` list preserves every event's order. It records the refusal
and before/after plan hashes in `deterministicRepairs` and revalidates through Production.
Ambiguous choices, multiple errors, or offsets needing recorded timing are not rewritten.
This consumes no model call and does not replenish the shared PlanRepair allowance.
`reconcile_anchor.py` defaults to a read-only preview. Its explicit `--apply` archives and clears
only the diagnosed exhausted-repair block before recording, after checking the exact dispatch
count, every response, the unchanged signed Production snapshot, and applicability of the
unambiguous repair. It leaves the plan unchanged; the deployed worker performs and records the
correction on resume. It refuses lost or uncertain calls and never changes a ceiling or counter.

V2 checkpoints live in `briefs/<sha256(submission-id)>/autonomous-v2.json`. Results retain all
validated role decisions, source/claim provenance, exact image requests, candidate reviews,
film hashes, temporal observations, correction counts and command dependencies. No model
reasoning is saved. `provider-calls.jsonl` retains provider dispatch evidence. Resume with
the same ID, original prompt, language and limits. An uncertain dispatch or changed Production
snapshot blocks for reconciliation; do not delete journals or checkpoints to retry.

Director responses retain their declared public fields in `role-outputs/`, including when
validation fails. A contract diagnostic identifies the failed gate. Thought parts and values
of undeclared response fields are excluded. `reconcile_coverage.py` is an explicit operator
tool limited to a responded, invalid coverage judgement before any Production Run exists.
Its explicit `--step composition` variant handles only the diagnosed redundant structural-field
refusal, with no unfinished composition role. It restores any technical repair consumption
proven by the provider journal that the failed old planner did not save. It takes the original
submission ID and exact consumed call count, acquires the worker lock,
archives checkpoint and journal bytes with hashes, and clears only the failed pending gate
and terminal. It refuses uncertain dispatches. The next judgement consumes the original
budget; cached research is retained. V2 also caches Structurer, SceneAuthor and PlanRepair
responses separately. Exact repetitions of immutable `component` and `spansBeats` are checked
against the Structurer and removed from fills; changing either remains a refusal. Legacy
planning keeps its strict output shape. Other interruptions require separate reconciliation.
`audit_blocked_accounting.py` can restore the journal-proven repair count on the specifically
diagnosed old Production-repair failure. It verifies the signed Production snapshot, archives
the original bytes and leaves the Run blocked. It does not dispatch a model or clear a pending
action. A lost response and an exhausted repair allowance are not authorization to retry.

`prepare_deployment.py` emits pinned boot metadata, explicit systemd units for the two planned
prompts, request-bound envelopes and installation scripts. It never starts paid attempts, and
boot does not enable the autonomous units. Build and scan both images, preserve previous boot
metadata, install the generated files, update VM metadata, and run the signed probe before
starting `vox-crew-autonomous-rocket.service` and `vox-crew-autonomous-sky.service` sequentially.
Legacy configuration is retained separately. Production still has the only grant-signing key.

The audiovisual reviewer uses local video bytes through the
[official Google Gen AI SDK path](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/googlegenaisdk-textgen-with-local-video).
FFmpeg first fully decodes the original and creates an inspection copy retaining audio.
Tests with fixture media verify transport and decoding, not real editorial quality.

The reviewer retains compiled timing and semantic context but replaces embedded `data:` asset
URIs with hashes/lengths: those bitmaps are already visible in the attached media. Context over
250,000 characters is refused before dispatch. Confirmed SDK HTTP errors persist only status,
media/context hashes and a failed outcome; transport failures remain outstanding. No raw provider
message is stored. `reconcile_media_client_error.py` handles only the diagnosed legacy film-review
ClientError after checking the signed snapshot, preserved video bytes and exact consumed calls.
The pinned SDK maps ClientError to an HTTP 4xx response; the receipt explicitly states that the
exact status was lost. It appends that failure classification without resetting its paid attempt,
archives checkpoint/journal, and clears only the pre-verdict pending review and block. It refuses
timeouts, other pending roles and existing verdicts. The corrected worker first completes all
authored image requirements, then renders and reviews the resulting new bytes.
Once the image allowance is consumed, V2 stops before purchasing another image intention unless
an already generated, unreviewed candidate can still be inspected. Image review must not demand
annotations reserved in `rendererElements` inside the bitmap; those belong to final film review.
This does not waive scientific accuracy checks or change any saved verdict.

Only `status: reviewed` can be delivered as a validated film. A model's acceptance is separate
from final human appreciation. Export through the signed client, verify every descriptor and
fully decode locally. Keep blocked attempts labelled as blocked and preserve earlier videos.
