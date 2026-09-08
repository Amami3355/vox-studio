# First real video: hosted operator run

The user delegated editorial and implementation decisions for this milestone on 2026-09-07.
The selected Brief is an English 45–60 second explanation of Falcon 9 first-stage landing,
with one clearly labelled generated illustration. `request.json` is the canonical Brief.
ElevenLabs is retained for this milestone. Final human viewing remains an exit requirement.

September 8 result: the hosted Run reached `rendered`; the real MP4 is delivered at
<http://127.0.0.1:8765/> on the operator PC. See the
[delivery proof](../../../.scratch/hackathon-launch/proofs/milestone-2-delivery-2026-09-08.md)
for the exact Run, artifact hashes, additional image-call authorization and runtime overrides.
The user accepted the technical result on September 8; artistic/editorial acceptance remains
open for later feedback. Do not start another attempt to deliver this already rendered Run.

## Research and model access

Live research now uses Gemini on Google Cloud with the `parallel_ai_search` tool, through
`GroundedParallelResearchAdapter`. The previous Task API adapter remains available to its
existing callers/tests but is no longer selected by `build_crew` for live research.

The grounded response must contain search queries, web sources and grounded support segments.
Only those segments become dossier claims. Their source indices, multipart positions and
UTF-8 byte ranges are checked against the actual answer. Uncited prose is not promoted to a
supported claim. This records provider citation evidence; it is not an independent fact check.

The deployed research and creative models are explicitly `gemini-3.5-flash`, a documented
Parallel-grounding model. Google Gen AI Python `2.19.0` is pinned in the crew dependency set;
the hosted image also pins ADK `2.7.1`. Models use the VM's Google Cloud identity, not a
developer API key. The original Production image had an obsolete Imagen adapter. The
repository now uses Gemini image generation; this Run's authorized one-off recovery used
Production's own cloud identity at `global`. The general service image still needs that
adapter included in its next deployment. The crew gets no Production signing keys or narrator credential.

References checked with Context7 and the official pages:

- [Hackathon runtime Search requirement, including grounding](https://agentic-cinema.devpost.com/details/parallel-resources).
- [Parallel grounding setup, supported models and citation metadata](https://docs.parallel.ai/integrations/google-gemini-enterprise).
- [Google grounding API](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/grounding-with-parallel).
- [Google image-client cloud configuration](https://googleapis.github.io/js-genai/release_docs/classes/client.GoogleGenAI.html).

## Explicit execution bounds

`operator-policy.json` allows the four live phases. `execution-limits.json` permits at most
40 total crew model dispatches, including at most two grounded research dispatches, for the
same Brief across attempts. Each creative call is limited to 8,192 output tokens and a
300,000-byte serialized model input; grounded research is limited to 4,096 output tokens and
eight results per search. Gemini may issue several searches inside one grounded request:
the two-dispatch limit is not a claim of only two individual searches or an exact dollar cap.

The Production request allows one new narrated Take. The trusted image signer permits one
exact image request for this milestone. There is no automatically issued replacement grant,
no SDK model/image retry and no systemd paid-attempt restart. These are unit ceilings, not a
provider invoice estimate. Model usage is captured from the actual response where available.

For this Run only, after the original Imagen request failed without a candidate, the user
explicitly approved one additional Gemini image call. `recover-image.mjs` performed that
single recovery on the same request and job, retaining the consumed original grant and
recording a durable one-shot dispatch marker. Its `--check` mode is read-only; `--execute`
must not be run for a new allowance. The successful result is already accepted and rendered.

`provider-calls.jsonl` persists dispatch before calling a provider and records its response
usage afterward. An unfinished model dispatch blocks further calls and attempts. Operator
command records retain signed Production outcomes and identify a command with an unknown
outcome; inspect the authoritative Run before any repeat. Full provider requests, credentials,
exception bodies and model reasoning are not written into the public usage journal.

## Last credential setup and explicit start

The project has a `PARALLEL_API_KEY` secret with a reader binding only for the crew identity.
Add an enabled secret version through Secret Manager. The value must not appear in a shell
command, repository or chat. A Marketplace subscription is not required for this BYOK route.

From the repository root in **Git Bash**, provision only this missing key:

```bash
bash scripts/provision-cloud-project.sh --parallel-only --project studio-prod-7f3a
```

This mode checks the existing secret and its direct crew reader binding, opens the Parallel
dashboard, captures the key with hidden input and sends it to Secret Manager through stdin.
It checks that the newest version is `ENABLED` without reading its payload. Empty input fails
without writing; an already enabled latest version is kept without prompting or rotating it.
It does not provision other credentials, change IAM/APIs/VMs, write a local configuration file
or start a video attempt. Metadata checks do not prove that the provider accepts the key.
Running the script without arguments shows help; `--full` explicitly selects the historical
13-stage infrastructure setup, whose model-key and network-isolation steps predate this runtime.
Do not use that historical path to resume this deployment.

Render both boot documents with `deploy/crew/render.py --live` and immutable registry digests.
The crew installs its live policy and limits read-only, but boot does not start the attempt.
The operator stages the canonical request at `/mnt/disks/vox-crew/state/request.json`, owned
by UID/GID 10001. Do not replace an existing request with a different Brief.

Start `vox-crew-attempt.service` explicitly on the crew VM. Its `ExecStartPre` fetches the
Parallel secret using the crew identity and atomically installs a root-only `parallel.env`.
This happens before any model call; a missing version cannot spend an inquiry-planning call.
The ordinary connectivity probe and bridge do not require the Parallel key.

## Image authorization, review and resumption

The first run pauses before generating the image. The exact public request is saved under
`state/operator/image-requests/`, bound to a public Run ID. Transfer that request through the
operator channel to Production and run `sign-image-grant.mjs` inside the trusted container
with `tsx`. It reads the existing private key from the Production environment and persists
the one-request allowance at `/var/lib/vox/operator/milestone-2-image-grant.json` before
exporting the signed grant to the requested file. Its terminal output contains no signature
or private key. Keep the exported grant in ignored operator runtime storage.

Back on the crew host, invoke `python -m vox_crew.operator image-start --run-id ... --request ...
--grant ...` using the installed image, mounted state and caller env. The grant and request
must name the same Run. Inspect the returned job and fetch/view its candidate artifact before
using `image-accept --run-id ... --job-id ... --sha256 ...`, or reject it explicitly.
An agent review must be labelled as an agent review; it does not stand for final human viewing.

Start the same crew attempt unit again after the known pause. The existing checkpoints retain
the research, creative work, Take and image decisions; Production reuses the existing image
job. Do not initialize another Run, modify the Brief or change its operator policy to resume.

## Delivery and evidence

`python -m vox_crew.operator export --run-id ... --output ...` reads the signed Run status,
fetches the public artifact descriptors through the existing verified client, and writes an
index with digest-named media files. It never interprets remote artifact paths as local paths.
Copy that export to the operator workspace for delivery. Retain the crew checkpoints,
provider-call journal and signed command outcomes with the Run ID and deployed digests.

The milestone closes only when a real hosted run proves Parallel-backed sources, live authors,
an accepted image, existing ElevenLabs narration and a playable MP4 delivered for human review.
Connectivity tests, model readiness and recorded tests do not close it.
