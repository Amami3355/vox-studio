# Wayfinder — Agent production interface

Type: wayfinder:map
Status: open

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

### Known implementation obligations awaiting sequencing

Known work, not unresolved decisions. They remain unsliced only because their ordering and
ticket boundaries depend on open decisions above.

- **Implement ADR-0006** — `COMPILER_CHECKS` as data, `CompilerErrorCode` and
  `CompilerWarningCode` derived from it, the twenty-six `means`/`repair` prose entries, the
  top-level `checks` block, `manifestVersion` → 3. Decided 2026-08-13 and not built; the
  manifest today publishes `manifestVersion`, `time` and `capabilities` only.
- **Generalise recording.** `packages/voice/scripts/record-take.mts` records
  `shippedPlans[0]` and writes four hardcoded repository paths. It cannot record an arbitrary
  `plan.json` from an isolated run directory. This is implementation cost hiding inside what
  reads as an existing seam — do not plan `record` as wiring up what exists.

## Decisions so far

- [Choose the production voice](issues/08-choose-the-production-voice.md) — George
  (`JBFqnCBsd6RMkjVDRZzb`), `eleven_v3`, seed 7, no paid listening comparison before the
  deadline. Deferred cost recorded in the ticket.

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

## Not yet specified

- The implementation sequence, ticket boundaries and change-scoped verification commands.
  These depend on the authoring-knowledge frame, the command lifecycle, the code-blind
  boundary, the artifact state machine and the proof specification; graduate them only after
  those decisions are resolved. Graduating them is this map's final act.

## Out of scope

- Gemini, ADK, Google Cloud Agent Builder, Parallel research and the eventual agent crew.
- Group 4, groups 2–3, TypographicStatement, Comparison and all other catalogue expansion.
- The measurement gate and its ten blind Briefs; it will consume this interface later but is
  not the proof subject here.
- Final image generation, human asset selection and frame-premium judgement. Repository
  placeholders are acceptable in the narrated preview.
- Product Studio UI, hosting, prompt editing, public export and cross-platform distribution.
