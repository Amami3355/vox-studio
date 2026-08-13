# Define the authoring-knowledge frame

Type: grilling
Status: resolved
Blocked by: none

## Question

What is the *frame* through which a generalist agent learns everything it needs to author a
valid `VideoPlan` without source access? Decide the categories of knowledge the agent must
receive, the single canonical source of each category, the rule by which later decisions
deposit facts into this frame, and the validated structural-example mechanism.

It decides the frame and **not a complete inventory**. Several facts the agent must learn are
owned downstream — take-safe repair rules by
[Bind artifacts, retries and resume](06-bind-artifacts-retries-and-resume.md), duration-risk
language by [Define duration preflight](05-define-duration-preflight.md), the decline result
by [Define the public command lifecycle](02-define-the-public-command-lifecycle.md), and
whatever [Decide the code-blind production boundary](04-decide-the-code-blind-production-boundary.md)
makes readable at all. Those tickets register their facts *through* this frame and do not
reopen its architecture. A ticket claiming to enumerate every fact on day one would be
contradicted four times or would stall on its own dependents.

ADR-0006's check vocabulary is required knowledge and enters as a category here; implementing
it is a Known implementation obligation on the map, and it graduates into a ticket once the
artifact topology is settled by
[Decide the published contract artifacts](07-decide-the-published-contract-artifacts.md).

## Resolved when

The categories, their canonical sources, the deposit rule and the example mechanism are
written down, and a fact arriving from any later ticket has exactly one place to go.

## Answer

The **Authoring knowledge frame** is a compact discovery index over five exclusive knowledge
categories. It is not a sixth source and not a monolithic guide: it names the available
categories, their purpose and how to request their projected detail.

| Category | Single canonical source | Owns |
|---|---|---|
| Ubiquitous language | `CONTEXT.md` | Public domain terms, distinctions and avoided synonyms |
| `VideoPlan` structure | `videoPlanSchema` | The complete agent-authored document shape, including Beats, Sections, SceneInstances, persistent elements, placements and their structural constraints |
| SceneCapability authoring | The registered `SceneCapability` data | Selection metadata, props schemas, soft constraints, actions, layouts and capability-local `SceneExample`s |
| Compiler checks | `COMPILER_CHECKS` | Every error and warning code, regime, meaning, repair and warning severity, as decided by ADR-0006 |
| Production protocol | Declarative production-contract data | Commands, stages, prerequisites, outcomes, Preflight semantics, recording authorisation, artifact integrity, repair and resume rules |

Ticket 07 owns the concrete public artifacts and may combine or separate generated
projections of these sources. It may not turn a projection into a second place to author a
fact. The compact index is the always-readable entry point; detailed categories are loaded on
demand so capability growth does not force the entire contract into every interaction.

### Deposit rule

A new agent-visible fact is authored **once**, in the canonical source whose behaviour would
be wrong if that fact changed. Behaviour, public projections and contract tests derive from
that source. A prompt, prose guide, command description or generated JSON may explain or
project the fact but may never originate or override it.

When a fact appears to cross categories, ownership follows the behavioural subject, not the
consumer. For example, ticket 05 deposits the estimator and uncertainty in production-
contract data while a capability's duration floors stay in registered `SceneCapability`
metadata; ticket 06 deposits take-safe repair rules in production-contract data while the
term `Recording input` remains in `CONTEXT.md`. A vocabulary change updates `CONTEXT.md`
immediately, even when another source owns the operational rule that uses the term.

Every generated projection has a build/check command that fails on drift. Every public fact
has a contract test against its canonical source. Hand-maintained copies and facts existing
only in prompts or documentation are rejected.

### Validated structural examples

The frame adds complete `VideoPlan` examples alongside, not instead of, capability-local
`SceneExample`s. A structural example is source data carrying a complete plan plus a concise
statement of what structure it demonstrates. Generation refuses an example unless both
`videoPlanSchema` and `validateVideoPlan` accept it.

The initial set must collectively demonstrate the Beat → Section → SceneInstance partition,
persistent elements and placements, multiple SceneCapabilities, events, and a valid Word
anchor. It contains no TimedBeat, frame or fabricated duration and is never called compiled:
only a real Take can make compilation authoritative. Ticket 07 decides the examples' public
projection.

### Trade-offs

Five sources are less superficially tidy than one handwritten manual, but they keep each fact
beside the behaviour that enforces it and make drift testable. Progressive discovery adds an
index and lookup step, but prevents a growing catalogue or protocol from becoming an
always-loaded context tax. Full-plan examples duplicate some values present in capability
examples by design; they uniquely teach relationships a SceneInstance fragment cannot show,
and validation prevents that instructional duplication from drifting semantically.

## Comments

### Grilling round 1 — awaiting user decision

The repository establishes these facts: `CONTEXT.md` is the glossary; capability schemas,
metadata, actions, layouts and `SceneExample`s already generate `catalog.json`;
ADR-0006 assigns compiler check knowledge to `COMPILER_CHECKS`; no public `videoPlanSchema`
or validated full-plan example source exists yet; and downstream lifecycle, Preflight and run
integrity facts still need canonical declarative homes.

The open frontier is:

1. adopt five exclusive knowledge categories and sources: glossary → `CONTEXT.md`; plan
   structure → `videoPlanSchema`; capability authoring → the `SceneCapability` registry;
   check meaning/repair → `COMPILER_CHECKS`; production protocol → declarative production
   contract data;
2. require each fact to be authored in the canonical source that governs its behaviour, then
   generated into projections and contract-tested — never written only in a prompt, guide or
   hand-maintained JSON;
3. add validated complete `VideoPlan` examples, without fabricated timings, checked by
   `videoPlanSchema` and `validateVideoPlan` while keeping per-capability `SceneExample`s;
4. expose the frame through a compact category/discovery index with details loaded on demand;
   ticket 07 remains owner of the concrete artifact topology.

The recommendation is yes to all four. No answer is recorded until the user confirms or
changes them.

User confirmed all four recommendations on 2026-08-13: `Q1 oui, Q2 oui, Q3 oui, Q4 index`.
