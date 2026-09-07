# Which supported ADK deployment path fits this crew by tomorrow?

Parent: [Vox Studio: a visible result first, ready for the September 9 hackathon](../map.md)
Type: research
Label: wayfinder:research
Mode: AFK
Status: resolved
Assignee: codex-adk-deployment-research
Blocked by: none

## Question

What do current first-party ADK and Google Cloud documentation recommend for hosting this Python crew, and which supported CLI/deployment path minimizes changes by tomorrow?

Compare `adk deploy` targets, Agent Starter Pack if relevant, and a custom container around the existing Director. Establish CLI names/options against current docs and the installed/pinned version; separate platform recommendation from project-specific judgment. Inspect `create_adk_director`, `build_crew`, CrewStateStore, synchronous Production calls, model/provider configuration and the absence/presence of a deployable root agent.

Include durable execution versus ADK session persistence; disconnects/timeouts; private connectivity to the loopback-only Production VM; identity and secrets; how a custom Studio calls the crew; what the CLI does not solve. Avoid recommending an unproved database, bucket mount or public production endpoint as if it already worked. Cite primary sources and give a timeboxed fallback.

## Answer

Resolved 2026-09-07 by background research, using Context7, current first-party documentation and installed ADK 2.7.1 CLI help. Evidence: [ADK deployment for the September 8 hackathon](../research/adk-deployment.md). Research preserved on branch `research/adk-hackathon-deployment`, commit `d0f10c201923d293a46aa34b24586071a4f1a9b7`.

Google documents `adk deploy cloud_run` as the recommended Python shortcut for Cloud Run, and `adk deploy agent_engine` for managed Agent Runtime. Both are available in the installed CLI. The newer Agents CLI (`google-agents-cli`, `agents-cli deploy`) is the actively developed successor to Agent Starter Pack, which now declares maintenance mode. The ADK dev UI is not the product Studio. CLI defaults do not supply durable application work or this repository's private Production connection.

The project-specific recommendation is a separate Compute Engine crew worker/container with persistent disk and a supervised SSH connection to Production's loopback listener, with a Studio/frontend server on Cloud Run. The crew VM hosts a small authenticated private application API and durable job/progress state beside the worker; Cloud Run reaches that API through explicitly configured private networking. This minimizes adaptations to existing file checkpoints and long-running execution. It is a recommendation for the human topology decision, not a chosen deployment or a claim that IAM, TLS, supervision, job ownership or recovery already exists.

Timebox a preferred Cloud Run worker alternative to a two-hour proof of durable state and private connectivity; otherwise use the separate VM worker candidate. No topology may depend on a developer laptop tunnel. A supervised tunnel does not solve the measured render-disconnect failure: reconcile the same Production Run and avoid blind paid-operation retries.

The research question is answered; release audience and topology acceptance remain open in their own tickets. The report's September 8 deadline was provisional; the confirmed event deadline and provider constraints are recorded in [What result comes first for the September 9 hackathon?](02-name-the-demo-and-release-envelope.md). Preserve this research as historical deployment evidence; do not repeat it solely because the delivery order changed.
