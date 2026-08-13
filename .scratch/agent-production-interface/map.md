# Wayfinder — Agent production interface

Type: wayfinder:map
Status: resolved

## Destination

A decision-complete, implementation-ready specification and executable ticket set for an
Agent production interface that will let a generalist agent turn a fresh editorial Brief into
a narrated preview MP4 without repository-source access.

This map **records decisions and slices work; it does not run the code-blind proof.** A child
decision ticket defines that proof's acceptance test — the subsequent implementation effort
is what satisfies it. The map is not complete until its final act has produced the
implementation tickets, their order, their verification requirements and a handoff carrying
the *Never cut* guarantees below.

## Notes

### Context

- Use the vocabulary in `CONTEXT.md`, especially `Brief`, `VideoPlan`, `SceneCapability`,
  `Compile report`, `Take`, `Take manifest`, `Recording input`, `Preflight` and `Agent
  production interface`.
- The agent is a model-independent generalist with a shell and JSON file access. It receives
  the isolated production interface, generated contracts, the Brief and operator-owned
  production configuration.
- Every grilling ticket uses the `grilling` and `domain-modeling` skills. Record hard-to-
  reverse decisions as they crystallise rather than reconstructing them in a final batch.
- The proof target is a fresh 20–30 second Brief exercised with the two capabilities that
  exist today. Catalogue breadth and the measurement gate are separate concerns.

### Standing constraints

These bind every ticket. They are not open questions, and a ticket that finds itself
contradicting one has found a reason to reopen the map, not a licence to proceed.

**The code-blindness threat model.**

- The agent may inspect every readable file in its environment.
- Public contracts and vocabulary are intentionally readable.
- TypeScript, sourcemaps, repository paths, internal comments and readable implementations
  are forbidden.
- Minification alone does not establish code-blindness.

**Production and quota.** Only `record` may use the network or spend quota. No command
mutates `plan.json`; the agent alone authors and repairs it.

**Recording authorisation.** A *recording input* — ordered beat text plus production voice
settings — is what authorisation is granted against. Within an operator-authorised run and
its quota budget: the first recording of a distinct recording input is autonomous; changed
text is a new recording input and needs no further human interruption; retrying an identical
recording input is a *replacement* and requires explicit authorisation; a verified existing
take is reused. The run configuration caps the number of new takes, and exhausting that cap
produces a structured paused outcome rather than a silent retry or a failed run.

**Take-preserving repair.** After recording, compilation is authoritative. A repair should
first try to preserve the take by reassigning or merging existing beats; any textual change
invalidates the take and requires an explicit new recording.

**Degradation stays visible.** Warnings do not block a preview, and neither `placeholder` nor
`failed` assets do — rule 5 already makes both degradations. They are never presented as
equivalent: `placeholder` is pending work at `quality`, `failed` is attempted work that needs
intervention at `important`, and the final receipt preserves the distinction so a broken asset
cannot masquerade as a merely pending one.

**Decline stays possible.** The interface must preserve a structured decline outcome for an
unservable Brief, represented as an explicit result artifact or protocol state and not encoded
only as a process exit code. `docs/measurement-gate.md` measure 5 makes declining a first-
class outcome, and the gate consumes this interface later.

### Known implementation obligations

Known work, not unresolved decisions. The implementation tickets below now own their ordering,
boundaries and change-scoped verification.

- **Implement ADR-0006** — `COMPILER_CHECKS` as data, `CompilerErrorCode` and
  `CompilerWarningCode` derived from it, the twenty-seven `means`/`repair` prose entries, the
  top-level `checks` block, `manifestVersion` → 3. Decided 2026-08-13 and not built; the
  manifest today publishes `manifestVersion`, `time` and `capabilities` only.
- **Generalise recording.** `packages/voice/scripts/record-take.mts` records
  `shippedPlans[0]` and writes four hardcoded repository paths. It cannot record an arbitrary
  `plan.json` from an isolated run directory. This is implementation cost hiding inside what
  reads as an existing seam — do not plan `record` as wiring up what exists.

## Decisions so far

- [Define the authoring-knowledge frame](issues/01-define-the-authoring-knowledge-frame.md) —
  a compact discovery index over five canonical categories: ubiquitous language,
  `VideoPlan` structure, SceneCapability authoring, compiler checks and production protocol.
  Facts live once beside the behaviour they govern; projections and full-plan structural
  examples are generated and contract-tested.
- [Define the public command lifecycle](issues/02-define-the-public-command-lifecycle.md) —
  explicit `vox production` contract and Run commands advance a persistent Run through
  validation, advisory Preflight, recording, authoritative compilation and rendering. JSON
  inputs/results, Decline, write containment and process exit semantics are fixed; quota and
  network remain exclusive to `record`.
- [Choose the production voice](issues/08-choose-the-production-voice.md) — George
  (`JBFqnCBsd6RMkjVDRZzb`), `eleven_v3`, seed 7, no paid listening comparison before the
  deadline. Deferred cost recorded in the ticket.
- [Prove code-isolated rendering](issues/03-prove-code-isolated-rendering.md) — green through
  a thin readable client calling a production process outside the agent's filesystem. The
  current local Remotion artifact is rejected because it exposes sourcemaps and readable Vox
  implementation; the external-process candidate actually validated, compiled and rendered
  the current plan before passing the in-container leak probe.

- [Decide the code-blind production boundary](issues/04-decide-the-code-blind-production-boundary.md)
  — production executes in a trusted Production service reached only through authenticated
  OS-local IPC. The agent receives a thin native launcher, public contracts and Run outputs;
  source, runtimes, dependencies and credentials stay outside its readable environment, and
  isolation plus leak scans are standing release gates.
- [Define duration preflight](issues/05-define-duration-preflight.md) — authored UTF-16 text is
  estimated at 66.25 ms/unit for the fixed English voice configuration with a provisional 20%
  uncertainty margin. Minimum and recommended risks remain explicitly advisory, missing or
  falsified calibration never blocks recording, and future verified Takes invalidate rather
  than silently retune a calibration that fails its published bounds.
- [Bind artifacts, retries and resume](issues/06-bind-artifacts-retries-and-resume.md) — the
  agent-writable Run carries immutable content-addressed artifacts, an authenticated Run
  checkpoint and chained receipts; a private monotonic Run ledger prevents quota rollback and
  grant replay. Every consumer reverifies its inputs, identical operations reuse verified
  results, text/segmentation/voice changes stale a Take, and uncertain recording dispatches
  never retry automatically.
- [Decide the published contract artifacts](issues/07-decide-the-published-contract-artifacts.md)
  — absorbed into the boundary decision under the schedule cut. The five Authoring knowledge
  frame categories are versioned JSON projections from their canonical sources; JSON Schema,
  not TypeScript, is public, and ADR-0007 owns the topology while ADR-0006 remains scoped to
  compiler checks in the manifest.
- [Specify the code-blind end-to-end proof](issues/09-specify-the-code-blind-end-to-end-proof.md)
  — a fresh isolated agent must turn the permanently measurement-ineligible fictional
  Northbridge Brief into one 20–30 second narrated MP4 with both capabilities, a March Word
  anchor, visible placeholder degradation and exactly one synthesis dispatch. Machine evidence,
  zero-network paused/failed probes and a signed watch/listen verdict are mandatory; no
  code-blind end-to-end claim exists before both actual verdicts pass.

- [Implement compile and render stages](issues/17-implement-compile-and-render-stages.md) -
  the Production service now reverifies every plan/report/Preflight/Take/fold/compiler input,
  publishes content-addressed compile and preview artifacts, preserves all three asset states,
  reuses exact inputs without recomputation and renders the recorded vertical slice as a
  ffprobe-confirmed H.264/AAC MP4 without outbound network access.

- [Implement recording reuse and authorisation](issues/18-implement-record-reuse-and-authorisation.md)
  - `run.record` now verifies and reuses authenticated Take history, durably charges every
  provider dispatch before I/O, recovers complete private responses without network, pauses
  uncertain attempts, and enforces scoped one-time replacement grants plus the hard Run cap.

- [Build the OS-local IPC boundary and native launcher](issues/19-build-local-ipc-and-native-launcher.md)
  - every public command now crosses authenticated, replay-resistant Windows named-pipe IPC
  through one leak-scanned `vox.exe`; its restricted-token suite proves an isolated work root
  is read/write while repository and trusted service roots remain unreadable, without claiming
  that the fresh-agent Northbridge proof has run.

- [Build the code-blind proof harness](issues/20-build-code-blind-proof-harness.md) - the
  frozen Northbridge fixture now produces real H.264/AAC media and a complete hash-indexed,
  fail-closed evidence bundle. All itemized checks pass except the deliberately ineligible
  scripted-agent assertion; seeded leak and network violations each fail independently. A
  hardened fresh-Codex driver is wired for the separate actual proof without claiming it ran.

## Cost

- **Planning deadline: 20 August 2026.** The hackathon deadline is 7 September 2026, leaving
  roughly eighteen days for implementation.
- **Expected cadence: about one resolved decision per day.** The decision graph is five deep,
  so there is no slack to discover late.
- **The boundary prototype runs alongside** the authoring-frame and lifecycle conversations
  rather than after them.
- **A missed daily frontier is visible schedule pressure**, to be answered by applying the cut
  line immediately — not deferred to 19 August and not absorbed by the default mechanism.

The authoritative dependency graph lives only in the child tickets' `Blocked by` metadata.
Its longest path currently contains five decisions; do not duplicate it here, because a
second graph can drift from the frontier the tracker computes. The
[production voice decision](issues/08-choose-the-production-voice.md) is resolved and blocks
nothing.

**Cut line, in order.** 1 — the paid listening comparison (already taken: the production
voice is resolved on the existing configuration). 2 — combine the contract-artifact and
production-boundary decisions rather than dropping the former. 3 — prototype breadth: test
the most credible boundary first and examine the alternative only if the first leaks or
fails.

**Never cut:** the authoring-knowledge frame; ADR-0006 implementation ownership; lifecycle and
preflight semantics; the code-blindness threat model; artifact and take integrity; structured
decline compatibility; the end-to-end proof specification.

**The timebox default.** After 20 August, an unresolved choice may take a documented
conservative default only when reversing it later costs an edit rather than a re-decision —
flag spelling, exit-code allocation, provisional report-field naming, the initial preflight
margin. A default may never change an agent-authored artifact, invalidate a take, change a
public semantic contract, weaken code-blindness or integrity, or require an ADR-level
reversal. Every node on the critical path is a defining guarantee, so a choice that affects
one is resolved by the user or the destination is redrawn — the deadline does not authorise
guessing.

## Implementation sequence

The child tickets' `Blocked by` fields remain the authoritative dependency graph. Their
numeric order is the intended frontier when more than one ticket is unblocked:

1. [Implement the compiler-check registry and catalog v3](issues/10-implement-compiler-check-registry.md).
2. [Publish the plan schema and structural examples](issues/11-publish-plan-schema-and-structural-examples.md).
3. [Build the production contract projections](issues/12-build-production-contract-projections.md).
4. [Implement the authenticated Run store](issues/13-implement-authenticated-run-store.md).
5. [Implement duration Preflight](issues/14-implement-duration-preflight.md).
6. [Generalise recording and Take folds](issues/15-generalize-recording-and-take-folds.md).
7. [Implement the non-network production commands](issues/16-implement-non-network-production-commands.md).
8. [Implement compile and render stages](issues/17-implement-compile-and-render-stages.md).
9. [Implement recording reuse and authorisation](issues/18-implement-record-reuse-and-authorisation.md).
10. [Build the OS-local IPC boundary and native launcher](issues/19-build-local-ipc-and-native-launcher.md).
11. [Build the code-blind proof harness](issues/20-build-code-blind-proof-harness.md).
12. [Execute the Northbridge code-blind proof](issues/21-execute-northbridge-code-blind-proof.md).

Each ticket carries its own acceptance criteria and verification commands. Resolving this
map means the planning destination is complete; it does not claim that implementation or the
code-blind proof has run.

## Out of scope

- Gemini, ADK, Google Cloud Agent Builder, Parallel research and the eventual agent crew.
- Group 4, groups 2–3, TypographicStatement, Comparison and all other catalogue expansion.
- The measurement gate and its ten blind Briefs; it will consume this interface later but is
  not the proof subject here.
- Final image generation, human asset selection and frame-premium judgement. Repository
  placeholders are acceptable in the narrated preview.
- Product Studio UI, hosting, prompt editing, public export and cross-platform distribution.
