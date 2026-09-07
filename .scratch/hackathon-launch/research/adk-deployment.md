# ADK deployment for the September 8 hackathon

Researched September 7, 2026. Decision evidence, not a deployment. Research branch: `research/adk-hackathon-deployment`.

Update pointer: the title's September 8 target was provisional. The confirmed hackathon deadline, provider constraints and user-directed voice deferral are recorded in [What result comes first for the September 9 hackathon?](../issues/02-name-the-demo-and-release-envelope.md). The deployment comparison below remains historical evidence; use the updated [delivery route](../route.md) for execution order.

Live infrastructure update from the parent session: read-only `gcloud compute instances describe` reports `vox-service` in `europe-west1-c` as **TERMINATED**. Its current container image and health are unverified. Starting and checking Production is therefore an execution prerequisite; this research did not start it.

## Recommendation for this repository

The CLI exists: `adk deploy cloud_run` and `adk deploy agent_engine`. Google recommends the former for Python agents targeting Cloud Run and documents the latter as the standard managed Agent Runtime deployment. Current documentation calls the managed service **Agent Runtime**, while the installed CLI retains `agent_engine`. [Cloud Run deployment](https://adk.dev/deploy/cloud-run/), [standard Agent Runtime deployment](https://adk.dev/deploy/agent-runtime/deploy/).

**Project-specific inference:** for tomorrow, the lowest adaptation risk is a separate Compute Engine crew VM/container with a persistent disk, a supervised worker, and a small authenticated application API. Preserve the existing Production VM and its HMAC/tunnel boundary. Cloud Run can host the Studio frontend/BFF. This is a candidate topology for the human deployment decision, not a Google recommendation to prefer VMs generally.

The first two hours must prove the entire path: Cloud Run BFF → authenticated crew API on the crew VM's private address → crew worker → supervised SSH local forwarding into Production's loopback listener. The API and worker share durable job records, events, and `FileCrewStateStore` on the crew disk. Return a job identifier immediately; polling/reconnecting reads those records independently of the worker. Permit one active job initially. An authenticated application route, bounded admission, job ownership, restart reconciliation, and its TLS/channel configuration still have to be implemented and proved. Direct VPC egress reaches a private address allowed by firewall rules; it does not supply application authentication. [Direct VPC egress](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc).

If a Cloud Run execution option is preferred, timebox its persistence and private-connection proof to two hours, then fall back to that separate VM worker. Do not turn an unproven bucket mount/database into a hidden dependency or install the crew into the working Production container under deadline pressure.

## What is already implemented locally

- `services/agents/pyproject.toml` declares `google-adk>=2.7.1,<3`; the installed `services/agents/.venv/Scripts/adk.exe --version` reports **2.7.1**. Keep that exercised version for packaging.
- `adk_roles.py:create_adk_director` wraps the deterministic crew as a custom `BaseAgent`, declares children, and yields sanitized ADK events. There is no deployable module-level `root_agent` export or application server/container. Its fixed crew instance is assembled from request-specific inputs; a global object must not accidentally share briefs, policy, or conversation state between users.
- `crew_run.py:build_crew` needs the Production client, published teaching surface, request, policy, and optional recordings/state store. Default role model is `gemini-3.6-flash`; model access and selected Google provider mode must be smoke-tested under the cloud identity. Live factual research uses `PARALLEL_API_KEY`.
- `crew_state.py` implements memory, file, and injected ADK-session checkpoint adapters. A file checkpoint preserves completed creative work; Production remains authoritative for its Run and spend ledger. Role-level sessions default to in-memory, and `build_crew` does not automatically inject one shared durable session service into all roles.
- `http_client.py` uses synchronous `HTTPConnection`, HMAC from `VOX_NETWORK_TOKEN`, a 1,800-second timeout, and intentionally no command retry. Render acknowledgement can be lost after Production started work. The async thread seams do not create a durable scheduler.

These are source observations, not platform promises. The handoff/parent inspection identifies the existing COS Production endpoint as `127.0.0.1:8080` behind IAP SSH. A new VPC route alone cannot reach that listener. A worker needs an SSH `-L` channel to remote loopback or a separately designed private gateway. Direct IAP TCP forwarding to VM port 8080 is not equivalent to forwarding through SSH to its loopback listener. Google documents IAP's SSH transport and access prerequisites; operation of a supervised application tunnel still requires proof. [IAP TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding).

## Deployment options

| Option | Verified platform path | Fit by tomorrow |
| --- | --- | --- |
| Standard ADK Cloud Run service | `adk deploy cloud_run --project PROJECT --region REGION --service_name vox-crew AGENT_DIR -- --no-allow-unauthenticated` | Supported shortcut after standard agent packaging; does not add our application contract, job admission, storage, or Production connection. |
| Managed Agent Runtime | `adk deploy agent_engine --project PROJECT --region REGION --display_name vox-crew AGENT_DIR` | Managed agent hosting; additional packaging, state and private-network adaptation must be proved. Least attractive late migration for this particular private renderer workflow. |
| Custom Cloud Run container | `gcloud run deploy` with an application Dockerfile is explicitly documented for custom FastAPI integration | Good Studio/BFF and API hosting; long work needs a separate execution strategy. |
| Cloud Run Job worker | Runs a container task to completion, with configurable task timeout | Appropriate lifecycle for long work, but needs durable shared job/events/checkpoints, authenticated launch, one-writer ownership, and Production connectivity. These do not exist automatically. |
| Separate Compute Engine worker | Project inference using the existing Python/file/tunnel seams | Fewest state-model changes; accept bounded single-worker availability and implement supervision/recovery. |

Sources: [ADK Cloud Run](https://adk.dev/deploy/cloud-run/), [ADK Agent Runtime](https://adk.dev/deploy/agent-runtime/deploy/), [Cloud Run Jobs timeout](https://docs.cloud.google.com/run/docs/configuring/task-timeout). Commands are schematic, not ready to execute before packaging and identity are configured.

Installed 2.7.1 `--help` independently confirms `--adk_version`, `--session_service_uri`, `--artifact_service_uri`, and Cloud Run gcloud passthrough after `--`. Agent Engine `--staging_bucket` is **deprecated and unused**; old examples requiring it are stale. Its `--extra_packages` and `--agent_engine_config_file` are available. `--with_ui` explicitly warns that the ADK web UI is for development/testing, not production; it is not the Studio.

## The newer CLI the user may remember

Agent Starter Pack now declares maintenance mode and points new work to **`agents-cli`**. The current Google CLI is distributed as `google-agents-cli`; its setup example is `uvx google-agents-cli setup`, and it includes `agents-cli deploy`, scaffolding and infrastructure commands. Google's ADK documentation also has a dedicated agents-cli deployment path. [Agent Starter Pack status](https://github.com/GoogleCloudPlatform/agent-starter-pack), [Google agents-cli](https://github.com/google/agents-cli), [ADK agents-cli deployment](https://adk.dev/deploy/agent-runtime/agents-cli/).

Do not run a broad scaffold/enhance over Vox Studio tomorrow merely to get the CLI. Inspect generated deployment conventions in isolation if useful. It cannot infer our Production contract, durable job semantics, or Studio UX. The recommendation to defer migration is project judgment.

## Non-negotiable operational consequences

Cloud Run services default to a five-minute request timeout, configurable to sixty minutes. A timeout closes the connection with 504 but does not necessarily stop processing. Google explicitly recommends reconnection/idempotency for long requests. Consequently, neither raising a timeout nor keeping SSE open is a reliable job lifecycle. [Cloud Run request timeouts](https://docs.cloud.google.com/run/docs/configuring/request-timeout).

Cloud Run's writable filesystem is ephemeral. An in-container SQLite/file checkpoint does not become durable because ADK can use it. The existing file store uses staged rename and has no distributed writer coordination; a bucket mount is not a drop-in proof. Managed ADK session storage persists data, not an arbitrary in-flight Python invocation or exactly-once render dispatch. [Container filesystem contract](https://docs.cloud.google.com/run/docs/container-contract), [ADK persistence options](https://adk.dev/deploy/cloud-run/).

Cloud Run Jobs allow task durations up to seven days without GPUs, but jobs can fail and VPC connections can break during maintenance. Automatic retries therefore require reconciliation and duplicate protection; do not enable blind retries of `run.render`. [Job lifecycle and maintenance](https://docs.cloud.google.com/run/docs/configuring/task-timeout).

Keep model/research/Production credentials server-side, with dedicated workload identities and secret injection. A browser talks only to the Studio application boundary. For Cloud Run service-to-service calls, IAM invoker authorization plus an audience-bound ID token is documented; this does not automatically authenticate a custom VM API. [Cloud Run service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).

## Proof before calling it ready

One cloud-originated brief must reach a playable narrated preview; browser refresh must reconnect to the same job. Restart the worker and confirm completed research/models are not spent again. Simulate an interrupted render connection and reconcile against Production status/artifacts before resubmission; report uncertain state honestly if status cannot establish completion. Reject duplicate starts, another user's job reads, unauthorized spend and missing credentials. Capture logs with job/run identifiers, a deployment revision, and a recoverable failed job. This proves a bounded deployable hackathon service, not HA or unrestricted public SaaS.

Documentation method: required Context7 `library "Google ADK"` then `docs /google/adk-python` (two calls), installed CLI help, local source reads, and current first-party web documentation. No deployment, provider calls, or secret values were read.
