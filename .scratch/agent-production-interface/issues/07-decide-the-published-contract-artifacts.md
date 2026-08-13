# Decide the published contract artifacts

Type: grilling
Status: open
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
