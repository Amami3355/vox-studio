# Spec — The ADK agent crew (local first)

Status: ready-for-agent

## Problem Statement

Vox Studio can turn a Brief into a narrated preview, but only when a human (or a
one-off scripted proof driver) operates the Agent production interface by hand:
discover contracts, author a VideoPlan, repair it against compiler refusals,
preflight, record, compile, render. The hackathon requires the orchestration to
be Gemini-driven agents on Google Cloud (ADK / Agent Builder), and the frozen
architecture reserves a Python ADK crew that has never been initialised. Today
there is no crew: no agent that reads the teaching surface, writes plans, obeys
the recording-input authorisation rules, or declines an unservable Brief on its
own.

## Solution

A Python ADK agent crew, developed and run **locally on Windows first**, that
takes a fresh editorial Brief and autonomously drives the existing Agent
production interface end-to-end — from contract discovery through a rendered
narrated preview MP4 — without ever seeing repository source. The crew runs
inside an isolated workroot containing only the `vox.exe` launcher and the
public contract projections, exactly like the proof agents before it. Its tools
wrap the production command surface and return the service's JSON envelopes
verbatim, so the crew learns from the same refusals (`means`/`repair`/`next`)
the interface already publishes. Research arrives through Parallel tools behind
a recordable interface. The existing proof harness — workroot setup, stubbed
providers, assertion sheets — is the crew's test seam, so the crew is held to
the same bar as the Codex driver it replaces.

## Prerequisites — what the operator must do first

These are yours, not the agent's. Nothing below is code.

1. **Land the in-flight work.** The working tree carries the Helios Bay
   showcase-proof changes the crew builds on (harness scenario routing, sandbox
   hardening, workroots at `C:\vox-proof-workroots`). Commit them before crew
   work starts so the crew effort begins from a clean tree.
2. **Gemini access for local ADK.** Create a Google AI Studio API key
   (aistudio.google.com) and export it as `GOOGLE_API_KEY` in the shell that
   runs the crew. Free tier is enough for development. (A billed GCP project
   with Vertex AI is a cloud-phase item, but create the project now — it costs
   nothing and you will need it for Agent Engine later.)
3. **Parallel account.** Sign up at parallel.ai, create an API key, and store
   it outside the repository (environment variable). This is the partner-track
   integration surface for the researcher agent.
4. **Local Python toolchain.** Install Python 3.11+ and `uv` on Windows
   (e.g. `winget install astral-sh.uv`). The crew will be a self-contained
   Python project; nothing touches the pnpm workspace.
5. **Verify the .NET Framework compiler exists** at
   `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` (default on
   Windows 10/11 — just confirm; it builds `vox.exe` via the existing
   distribution script).
6. **Sandbox account for workroots.** The isolated-workroot machinery needs the
   restricted Windows account the proof setup creates; have that credential
   available and run the existing sandbox setup script once for the crew
   workroot.
7. **ElevenLabs key** already lives service-side for proofs — no action, but
   confirm the environment still carries it so a real Helios Bay take can be
   recorded for the final local proof.

## User Stories

1. As an operator, I want to hand the crew a fresh Brief and receive a narrated
   preview MP4, so that producing an explainer no longer means driving the
   production CLI by hand.
2. As an operator, I want the crew to discover capability, action and anchor
   names from the published contracts rather than assuming them, so that its
   plans track the catalog instead of the model's memory.
3. As an operator, I want the crew to author plans as pure semantics — beats,
   sections, scene instances, symbolic anchors — so that the compiler remains
   the only writer of physical time.
4. As an operator, I want the crew to repair a refused plan by reading the
   refusal's `means`, `repair` and `next` fields and acting on them, so that it
   converges without human hand-holding.
5. As an operator, I want the crew to consult Preflight before recording, so
   that duration mistakes are caught while they are still advisory.
6. As an operator, I want the crew to spend exactly one synthesis dispatch on a
   compliant plan and never retry an identical recording input without explicit
   authorisation, so that quota rules bind the crew the way they bound the
   proof agents.
7. As an operator, I want a paused run (quota cap or replacement required) to
   stop the crew and surface the operator decision, so that authorisation stays
   human.
8. As an operator, I want the crew to emit a structured Decline — naming the
   unmet editorial need — for a Brief the catalog cannot serve, so that
   refusing is correct production behaviour, not a crash.
9. As an operator, I want the crew to prefer take-preserving repairs (reassign
   or merge beats) over rewriting beat text, so that an existing Take is not
   invalidated by a lazy edit.
10. As an operator, I want the crew to write asset requirements semantically
    (subject, treatment, orientation) and never image binaries or resolved
    references, so that ADR-0005's boundary survives automation.
11. As an operator, I want the crew to accept placeholder degradation visibly
    rather than fighting it, so that a preview with placeholders is an honest
    intermediate state.
12. As an operator, I want the whole crew to run inside an isolated workroot
    containing only `vox.exe`, the contracts and its run directories, so that
    code-blindness holds during local development, not just at proof time.
13. As an operator, I want crew transcripts and every command envelope
    persisted per run inside the workroot, so that any run can be audited
    afterwards exactly like a proof evidence bundle.
14. As an operator, I want the Helios Bay showcase Brief to be the crew's
    end-to-end acceptance case, so that the crew proves catalog breadth on the
    same frozen fixture the proofs use.
15. As a researcher agent, I want Parallel research tools (deep-research tasks)
    available behind a stable interface, so that factual Briefs get grounded
    narratives.
16. As a researcher agent, I want to detect fictional Briefs (Helios Bay) and
    skip live research, so that no network call is made for facts that are
    declared test data.
17. As a planner agent, I want the manifest's teaching surface — grammar
   examples, action descriptions, soft constraints, scene examples — as my
   authoring input, so that my plans conform to the catalog's published shape.
18. As a planner agent, I want tool results to be the production JSON envelopes
    verbatim, so that I learn from the interface's own refusals instead of a
    paraphrase.
19. As a developer, I want to run the crew headless locally with one command,
    so that the loop from Brief to artifacts is repeatable in CI-like fashion.
20. As a developer, I want the crew's tools tested against recorded envelope
    fixtures, so that Python tests need no service, no key and no quota.
21. As a developer, I want an end-to-end crew test that runs the real
    production service with stubbed synthesis and render adapters, so that the
    full loop is deterministic and free.
22. As a developer, I want the existing proof assertion sheets reused against
    crew-produced runs, so that the crew is judged by the same bar as the
    scripted proof agents.
23. As a developer, I want the Python project isolated from the TypeScript
    workspace (own dependency file, own test runner), so that `pnpm typecheck`
    and the existing checks stay untouched.
24. As a developer, I want workroot bootstrap (sandbox, distribution build,
    contract projection) as one repeatable script, so that a fresh machine can
    run the crew in one step.
25. As a developer, I want a recorded Parallel fixture, so that researcher
    tests never touch the network.
26. As a hackathon judge, I want the orchestration to be visibly Gemini-driven
    ADK agents, so that the submission's Google Cloud requirement is met by
    the local architecture that later deploys to Agent Engine.

## Implementation Decisions

- **Location and toolchain.** The crew lives in the reserved Python area
  (`services/agents`), as a self-contained ADK project: Python 3.11+, `uv` for
  environment management, `google-adk` as the framework, `pytest` for tests.
  It is not a pnpm workspace member; the repo's TypeScript checks do not see
  it.
- **Transport (decided with the operator).** Local development uses the real
  code-blind boundary: the crew process runs with its working directory inside
  an isolated workroot, and every production operation is a `vox.exe`
  subprocess invocation, exactly as the proof drivers did. No stdio shim, no
  second client interface. The existing sandbox/workroot setup and the agent
  distribution build are generalised from "codex-proof" to crew-agnostic.
- **Crew shape — smallest crew that closes the loop.** Two agents first: a
  **researcher** (Parallel tools, brief triage, decline recommendation) and a
  **producer/orchestrator** (contract discovery, plan authoring, repair loop,
  preflight, record, compile, render, decline). Sub-agents may be added later;
  the spec does not require a larger org chart to pass acceptance.
- **Tools mirror the command surface.** One tool per production verb plus the
  two contract discovery operations. Tool names and descriptions are derived
  from the published protocol contract, not hand-invented, so there is one
  source of truth for the vocabulary the model sees.
- **Envelopes verbatim.** Tool results are the service's result envelopes
  unmodified — outcomes, errors with `means`/`repair`, and the `next` command
  suggestions. The crew's prompts must not re-explain what a refusal already
  teaches.
- **System prompt from the teaching surface.** The crew's instructions are
  authored from the contract index's five canonical categories. No repository
  vocabulary, file layout or implementation knowledge may appear in prompts —
  the same leak-scan discipline the proofs apply to task messages.
- **Recording discipline is behavioural.** The crew must treat `maxNewTakes`
  as absolute, treat a paused/replacement-required outcome as a stop-and-ask,
  and prefer beat reassignment over text edits after a Take exists. These are
  acceptance-asserted behaviours, not prompt hopes.
- **Parallel behind an interface.** Research runs through a thin client with
  two implementations: live (operator key, interactive runs only) and a
  recorded fixture (tests, CI). Fictional Briefs must take the skip path —
  Helios Bay must produce zero research calls.
- **Assets stay semantic.** The crew only ever writes `AssetRequirement`
  fields. Placeholder degradation in a preview is acceptable output for this
  spec; the trusted-side generation loop is separate work.
- **Run workspace.** ADK session state plus the workroot's run directories
  hold all intermediate work; the crew never writes outside its workroot.
  `plan.json` remains agent-authored inside the run directory.
- **Evidence.** Each crew run persists a bundle in the shape of the proof
  bundles: transcripts, the ordered command envelopes, run artifacts, and an
  assertion evaluation against the scenario's sheet.
- **Model config.** Local runs use Gemini through the AI Studio developer key
  (`GOOGLE_API_KEY`), selected via ADK's model configuration. The same crew
  must be deployable to Agent Engine later without structural change — no
  local-only shortcuts in tool interfaces.
- **Acceptance bar.** (1) End-to-end Northbridge or showcase run passes the
  existing assertion sheet with stubbed providers. (2) One real Helios Bay run
  — live synthesis, one take — passes machine assertions and is submitted for
  the standing human watch/listen verdict.

## Testing Decisions

- **Good tests assert external behaviour**: given a Brief and contracts, what
  the run produced — envelopes, run state, artifacts — never the model's
  private reasoning or prompt internals.
- **Highest seam, reused.** The end-to-end test runs the crew headless in a
  bootstrapped workroot against the real production service with stubbed
  synthesizer and render adapters (the proof harness pattern), then evaluates
  the run with the existing assertion module. No new assertion vocabulary
  unless a crew behaviour is genuinely unmeasured.
- **Tool seam.** Python tool tests run against recorded `vox.exe` envelope
  fixtures (captured from real invocations), asserting parse-and-return
  behaviour and that envelopes pass through verbatim.
- **Researcher tests** use the recorded Parallel fixture; a network sentinel
  fails any test that attempts egress, mirroring the proofs' zero-network
  probes.
- **Prior art in the repo**: the proof harness suite (scenario assertions,
  sandbox usability, evidence bundles), the stdio/IPC contract tests
  (envelope-shape assertions), and the render-purity philosophy (deterministic,
  credential-free CI).
- **Python tests live with the crew project** and follow the repo's stance:
  deterministic, no keys, no quota, no network in CI.

## Out of Scope

- Cloud deployment: Agent Engine, Cloud Run, the HTTPS/MCP transport for the
  production service, service accounts, GCS artifact store (separate spec; the
  topology is already decided).
- The trusted-side asset generation loop (Imagen) and the human asset review
  UI.
- The measurement gate and its ten blind Briefs.
- The product Studio UI, hosting, public export.
- Non-Windows local transports; vox.exe remains the boundary.
- Enlarging the crew beyond researcher + producer, multi-crew orchestration,
  and any Gemini/Vertex feature beyond plain model calls.

## Further Notes

- The cloud phases (production service on Cloud Run, crew on Agent Engine,
  plan-as-payload over HTTPS) are decided and deliberately deferred — see the
  conversation record and ADR-0007 for the trust boundary this spec preserves
  locally.
- The uncommitted Helios Bay harness work is a dependency, not a rival: its
  scenario routing, assertion parameterisation and sandbox predicates are
  exactly what the crew's acceptance tests consume.
- Keep the CONTEXT.md vocabulary in all crew-facing writing: Brief, Run,
  Take, Decline, Preflight, teaching surface. The crew's own artifacts should
  read like the rest of the repository.
