# Decide the published contract artifacts

Type: grilling
Status: resolved
Blocked by: 01, 04

## Question

How does the knowledge accumulated in
[Define the authoring-knowledge frame](01-define-the-authoring-knowledge-frame.md) become
agent-readable?
Decide whether it appears in `catalog.json`, in a separate generated schema, in command
output, or across several with one canonical source and explicitly generated projections —
and decide the public `videoPlanSchema` and its TypeScript and JSON Schema derivations.

This ticket is the single owner of *how knowledge becomes an artifact*. Every other ticket
decides facts and registers them through 01's frame; none of them decides a file format.

**Its final act is choosing the ADR home**, which the map deliberately leaves provisional:

- inside `catalog.json`, implying an amendment to ADR-0006, whose scope today is *"the
  compiler's check vocabulary — its error and warning codes — and whether `catalog.json`
  carries it"*;
- in a separate generated artifact, potentially ADR-0007 or its own ADR;
- across both, with one canonical source and a named projection.

Do not widen ADR-0006 before this is decided. The map committed to the filing before the fact
that determines it, and that commitment has been demoted.

Blocked by
[Decide the code-blind production boundary](04-decide-the-code-blind-production-boundary.md)
because what the agent can read at all depends on where production executes.

Cut-line item 2: if the schedule slips, this question folds into
[Decide the code-blind production boundary](04-decide-the-code-blind-production-boundary.md)
rather than being dropped.

## Resolved when

The artifacts, their canonical source, their generated projections and their ADR home are
fixed, and ADR-0006's implementation can graduate into an implementation ticket against a
settled topology.

## Answer

Cut-line item 2 was applied: this artifact decision is absorbed by
[the production-boundary decision](04-decide-the-code-blind-production-boundary.md), not
dropped. The agent reads no hand-maintained documentation bundle and receives no public
TypeScript. `vox production contract index` is the compact discovery surface and
`vox production contract show <category>` returns these versioned JSON projections:

| Category | Projection | Canonical source |
|---|---|---|
| `language` | Generated glossary data | `CONTEXT.md` |
| `plan` | JSON Schema plus validated complete-plan examples | Private `videoPlanSchema` and structural-example data |
| `catalog` | Manifest version 3 with `time`, `capabilities` and `checks` | Registered SceneCapability data, `ANCHOR_GRAMMAR` and `COMPILER_CHECKS` |
| `checks` | On-demand view of the catalog's exact generated check data | `COMPILER_CHECKS` |
| `protocol` | Commands, stages, outcomes and production rules | Declarative production-contract data |

The repository's TypeScript `VideoPlan` type and the public JSON Schema both derive from the
private `videoPlanSchema`; only the JSON Schema crosses the boundary. The `checks` view is a
projection of ADR-0006's catalog block, never a second source. Every projection is generated
and contract-tested against its canonical source.

The architectural home is
[ADR-0007](../../../docs/adr/0007-isolate-agent-production-behind-a-trusted-service.md), which
records both the trusted execution boundary and the public projection topology. ADR-0006 is
not widened: it remains the decision that `COMPILER_CHECKS` is canonical and `catalog.json`
carries its generated top-level `checks` block. With the topology fixed, its implementation is
ready to graduate into an implementation ticket.

## Comments

Tickets 01, 02, 03 and 04 settled every prerequisite. The schedule cut combined this question
with ticket 04; the user's confirmations for its received surface and ADR home are recorded in
that ticket's grilling rounds 2 and 3.
