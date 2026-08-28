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
narrated preview MP4 — without ever seeing repository source. The crew process
lives outside an isolated workroot and works with its directory set to it,
exactly like the proof agents before it: the workroot itself begins as `vox.exe`
and the Brief's `request.json` and nothing else, and the crew earns the contract
projections by asking for them. Its tools wrap the production command surface
and return the service's JSON envelopes verbatim, so the crew learns from the
same refusals (`means`/`repair`/`next`) the interface already publishes. Research arrives through Parallel tools behind
a recordable interface. The existing proof harness — workroot setup, stubbed
providers, assertion sheets — is the crew's test seam, so the crew is held to
the same bar as the Codex driver it replaces.

## Prerequisites — what the operator must do first

These are yours, not the agent's. Nothing below is code.

1. ~~**Land the in-flight work.**~~ **Done** — the Helios Bay showcase-proof
   changes the crew builds on (harness scenario routing, sandbox hardening,
   workroots at `C:\vox-proof-workroots`) landed in `be7ca5e`. The crew effort
   begins from a clean tree.
2. **Gemini access for local ADK.** Create a Google AI Studio API key
   (aistudio.google.com) and export it as `GOOGLE_API_KEY` in the shell that
   runs the crew. Note that the harness deletes this variable today — review
   decision 2 is the amendment that lets it through, and until it lands the crew
   cannot reach a model. Do not assume the free tier carries a full run: review
   decision 3 sets the budget the crew works within. (A billed GCP project with
   Vertex AI is a cloud-phase item, but create the project now — it costs
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
12. As an operator, I want the crew to work only inside an isolated workroot
    that begins as `vox.exe` and `request.json` and grows nothing but its run
    directories, so that code-blindness holds during local development, not just
    at proof time. Contract projections arrive on stdout inside the result
    envelope and are held in the crew's context — never cached into the
    workroot, which is what keeps "nothing but its run directories" true.
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
  it. The one exception is the harness driver shim — reaching the crew from the
  proof harness needs a `createCrewAgentDriver: AgentDriver` beside the Codex
  one, and that stays TypeScript inside `packages/production`.
- **Transport (decided with the operator).** Local development uses the real
  code-blind boundary: the crew process runs with its working directory inside
  an isolated workroot, and every production operation is a `vox.exe`
  subprocess invocation, exactly as the proof drivers did. No stdio shim, no
  second client interface, and no local HTTP listener — ADR-0007 forbids TCP and
  HTTP for this boundary, and the isolation evidence rests on the named pipe.
  The agent distribution build is generalised from "codex-proof" to
  crew-agnostic. **The sandbox is not a rename**: `setup-codex-sandbox.ts`
  shells out to `codex sandbox`, and that mechanism is the sole producer of
  `repositoryDenied`, `serviceDenied`, `credentialsDenied` and
  `directNetworkDenied`. Replacing it is real work, not a search-and-replace,
  and review decision 1 defers it rather than pretending otherwise.
- **The deployment seam is the client, not the transport (ADR-0015).** The crew
  depends on one Python production-client interface with two implementations: a
  local one that spawns `vox.exe`, and an HTTP one for the cloud phase. Neither
  tools, agent instructions nor tests may branch on which is active. The
  client's methods are **payload-shaped from the first commit, in both
  directions** — every path-shaped input the command surface takes (`--request`,
  `--plan`, `--decision`, `--replacement-authorisation`) arrives as an object, a
  Run is named by its id, and artifacts are retrieved through a client method
  taking a Run id and an envelope's artifact descriptor rather than by joining a
  run root to a relative path. The read-back direction matters most: the crew
  reads the preview and the compile and Preflight reports off its own disk
  today, and in the cloud that disk is not there. The local implementation is
  the only module that knows a plan becomes `plan.json` and that `--plan` takes
  a path. This is what makes the crew deployable later without touching an
  agent: the cloud phase adds an implementation and deletes one module's path
  handling. A tool that accepts or returns a path is a defect against this
  decision even when it works locally.
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
- **Acceptance bar.** (1) End-to-end Northbridge or showcase run is scored by
  the existing assertion sheet with stubbed providers and earns every assertion
  that is its to earn — **excluding the isolation assertions**, which crew runs
  do not evidence for this phase (review decision 1), and **excluding
  `agent.unscripted-generalist`** whenever the plan is handed in rather than
  authored, which is what a free and deterministic run costs. The aggregate
  machine verdict for such a run is therefore `fail`, on authorship and nothing
  else; the sheet's own pass needs a model and is (3)'s to earn.
  (2) An unservable Brief produces a structured Decline naming the unmet
  editorial need, with no Take recorded (review decision 4). (3) One real Helios
  Bay run — live synthesis, one take — earns every assertion that is its to
  earn and is submitted for the standing human watch/listen verdict.
  **Review decision 1 binds (3) exactly as it binds (1):** a crew run does not
  evidence the isolation boundary, so its six isolation rows score
  `not-evidenced` and never `pass`, and the aggregate verdict of such a run is
  read as `51 pass / 6 not-evidenced` rather than as a clean sheet. (1) said this
  and (3) did not, which left the ticket amending itself against a spec that
  still asked it for a verdict a crew run cannot give.

## Review decisions — settled

These four came out of reading the surfaces this spec builds on. Each changed
what the work is, so each is settled here rather than left to be discovered in a
ticket.

1. **Local crew runs report `sandboxEvidence: null`, and the isolation
   assertions are not evidence for this phase.** The alternative was a real
   sandbox backend for a Python process tree, and it is more work than it looks:
   `RestrictedRunner` will not do it as-is — it is a SAFER constrained token that
   loads one managed assembly and constrains filesystem, not network — and the
   existing backend is Codex's own (`setup-codex-sandbox.ts` shells out to `codex
   sandbox`), which leaves with Codex. Taking the honest null now keeps the crew
   phase moving; the real backend is cloud-phase work, where service separation
   makes isolation structural rather than sandbox-enforced.

   **What this costs, stated plainly so it is not rediscovered at submission
   time.** With `sandboxEvidence: null` the harness falls back through `??` to the
   `RestrictedRunner` probes, which measure what a restricted token *would* be
   denied rather than what the crew process actually was, and `directNetworkDenied`
   is whatever the driver returns. That section therefore passes vacuously: the
   crew process can read the repository at will. So **code-blindness is convention,
   not enforcement, for crew runs.** The project may claim the code-blind boundary
   for the Codex proofs, which evidence it, and may not claim it for the crew.
   Acceptance bar (1) is amended accordingly, to stop reading as if it did — this is a
   claim-versus-evidence question before it is a test-coverage one, and story 26's
   submission narrative depends on getting it right.

2. **The environment scrub gains the crew runtime, and the credentials probe is
   re-pointed at it.** `scrubAgentEnvironment` matches `API_?KEY`-shaped names and
   whitelists only `^(CODEX|OPENAI)_`, so `GOOGLE_API_KEY` is deleted before the
   crew spawns — prerequisite 2 currently asks the operator to export a variable
   the harness removes. The crew cannot run without its key, so the amendment is
   forced rather than chosen; it widens a deliberate boundary and the reasoning
   goes in that file's existing comment, in its style. Separately, the harness
   hardcodes `credentialsProbePath` to `CODEX_HOME/auth.json`, which proves nothing
   about a runtime holding its credential in the environment: the crew's probe
   tests the crew's actual credential or it is retired, because a probe that cannot
   fail is worse than no probe.

3. **The contract budget is solved by not re-sending, not by not fetching.** The
   five generated contract files total ~220 KB of JSON (catalog 107 KB, protocol
   63 KB, language 21 KB, plan 18 KB, checks 11 KB). Selective fetching does not
   solve this: **the catalog is the planner's primary authoring input** —
   capability names, actions and anchors all live there and nothing can be written
   before it is read — so the dominant term is the one item that cannot be
   deferred. Fetching `checks` only when a refusal names it, and `language` and
   `plan` once, saves a fraction and leaves the problem. The lever taken was an
   assembled prefix: the catalog is read once and assembled once, and every turn is
   authored against that same object. Prerequisite 2's "free tier is enough for
   development" is struck; the crew names a rate-limit and token budget it runs
   within.

   **Amended, ticket 22.** That lever is not the saving this paragraph was written
   expecting. Assembling once is not sending once — the catalog is transmitted in
   full on every turn — so what the prefix buys is comparability, not a smaller
   bill. The dominant term is unchanged and still paid per turn.

   **Measured, ticket 14.** The 220 KB is the generated files on disk, and it is
   not what a model receives. What the crew assembles and sends is each category's
   *projection*, serialised compact: **124,690 characters, ~42k tokens** (catalog
   64,371, protocol 24,108, language 18,504, checks 9,037, plan 7,387, and the
   crew's preamble and headings). The placeholder estimate of 55–70k tokens was
   over the wrong artifact and by roughly a third.

   **Re-measured once the author was given a tool.** The scripted prefix is
   unchanged by the tool — that is the point of adding the tool paragraph only
   for an author that holds one, and it is what keeps every measurement taken
   before the tool comparable. A live author's prefix is the same text plus a
   paragraph describing the tool it may call. Both sit far inside the resident
   line.

   **Both figures are now taken by the suite, not by hand.** At ADR-0017's
   boundary — the prefix `cache_prefix` assembles, framing included — the
   scripted prefix is **118,598** and the tool-holding one **119,266**, a
   668-character paragraph apart. The 124,690 and 125,039 this bullet carried
   until crew 23 were taken before production issue 28 moved the checks document
   out of the catalog projection, and were stale by roughly 6,000 characters. The
   record is `services/agents/prefix-census.md`, rewritten on every `pytest` run.
   The budget is therefore stated
   in characters, which the crew can count exactly and offline on every Run, with
   tokens as a deliberately conservative conversion at 3 characters per token:

   - **Resident prefix: 150,000 characters (~50k tokens)**, charged once per Run
     and transmitted on every turn of it.
     A quarter of headroom over the measured 119,266, which is room for the
     catalog to gain capabilities without a Run being refused for it.
   - **Fresh text: 20,000 characters per plan version.** The largest refusal the
     fixtures record is 5,248 characters and a showcase Brief handed back with an
     eight-scene plan is ~10,000 more.
   - A **showcase Run** is budgeted six plan versions, so **270,000 characters
     (~90k tokens)** in total. Its measured worst case puts **826,492 characters
     (~276k tokens)** in front of a model across six turns, of which **623,450
     (75%) is the same prefix re-sent unchanged**. Charged once, that is 203,042
     characters (~68k tokens) — the figure the budget is set against.
   - **Rate consumption is one model request per plan version, issued one at a
     time**: at most six for a showcase Brief, five for the short one
     (`repair_budget(25).plan_versions == 5`).

     **Amended once the author was given a tool.** An author holding one answers
     a single ask over several model calls — it reads the prefix, calls the tool,
     and reads the prefix again with the answer appended — so a plan version is
     no longer one request. The rule the spec was reaching for survives in a
     stronger form: **a Run may take at most `MODEL_CALLS_PER_ASK` calls per plan
     version**, four, being the first call plus three the author may spend
     reading a finding and trying again. An author holding no tool takes exactly
     one and is priced as it always was. The line is enforced by
     `ContextSpend.overrun`, which reads it *before* the character line it would
     also blow: a Run that passed it spent its budget looping against a tool
     rather than on plan versions, and that is the finding rather than where the
     characters went.

   All three lines are enforced rather than reported, and priced before a turn is
   asked for rather than after. A first ask that does not fit is refused before a
   Run is opened; a repair that would cross the turn allowance is refused and the
   Run ends `budget_exhausted` with the line named.
   `services/agents/tests/test_context.py` re-measures the resident term against
   the recorded projections on every run of the suite, so a catalog that outgrows
   the allowance fails the build rather than an invoice.

   **What "cached" does and does not mean here.** The crew's side of it is an
   identical prefix, placed first, assembled once. **Amended, ticket 22:** that was
   written as the *precondition* for a provider serving it from cache, with the
   code, the bundle and the CLI worded to claim no more than an eligibility. The
   eligibility itself does not survive inspection, and the wording now says so.
   Three things are worth recording:

   - Identical prefixes are still **transmitted** every turn. A cache would save
     the model's work and the bill, not the bytes on the wire — and there is no
     cache. The bundle reports `repeatedPrefixChars`: what the turns after the
     first spent re-sending the prefix, every character of it spend that reached a
     model.
   - **ADK's own `ContextCacheConfig` cannot engage as the crew is built.** Checked
     against the installed `google-adk 2.7.1` rather than inherited: caching begins
     on a session's second turn at the earliest, a first request has no previous
     token count to match on, and `AdkPlanAuthor` opens a fresh session per ask. So
     every session this crew opens is single-turn, which that package names
     outright as never cached, and `min_tokens` only raises the floor. Wiring
     `ContextCacheConfig` as things stand would be a switch that could never fire —
     the "probe that cannot fail" decision 2 already rejects.
   - **Holding one session across a Run is the change that would put a cache in
     reach, and it is rejected.** Rebuilding the whole prompt each turn is what
     keeps the prefix identical and successive measurements comparable. ADR-0017
     records that decision, and the bundle publishes it under `prefixCache` beside
     the number, so that a reader does not read the rejection as a defect.

   What the identical prefix buys is **comparability**: a measurement taken either
   side of a change is a measurement of the change. That is the whole of it, and it
   is what ticket 17's before-and-after design rests on.

   **Amended, ticket 22 — the reading this section assigned is discharged, not
   dropped.** What stood here asked ticket 15 to read the SDK's
   `usage_metadata.cached_content_token_count` on the first live Run, as the one
   thing that could turn the eligibility into a measurement. There is no eligibility
   to turn: every session the crew opens is single-turn, which is never cached, so
   that count could only ever have come back zero. Ticket 15 closed without the
   reading and nothing is now waiting on it. Recorded because ticket 14 points here
   for it.

4. **A third scenario is added: an unservable Brief that must produce a Decline.**
   Story 8 wants a structured Decline naming the unmet editorial need, and neither
   Northbridge nor the showcase exercises it. Moving Decline out of scope was the
   alternative and it is the worse trade: the scenario is cheap to fixture (a Brief
   asking for something the catalog's `avoidWhen` already redirects), refusing well
   is judge-visible as product behaviour rather than a crash, and the measurement
   gate consumes Decline later regardless. The acceptance bar is amended
   accordingly to name it.

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
  locally, and **ADR-0015** for where the local-to-cloud seam is placed and why
  it is not the transport. ADR-0015 also decides that the cloud run store keeps
  POSIX semantics rather than object storage, which is the one cloud choice that
  reaches back into this phase: `RunStore` uses `link`, `rename` and lock files,
  and taking that decision now is what makes the local design correct rather
  than provisional.
- The Helios Bay harness work is a dependency, not a rival: its scenario
  routing, assertion parameterisation and sandbox predicates are exactly what
  the crew's acceptance tests consume. It landed in `be7ca5e`.
- Keep the CONTEXT.md vocabulary in all crew-facing writing: Brief, Run,
  Take, Decline, Preflight, teaching surface. The crew's own artifacts should
  read like the rest of the repository.
