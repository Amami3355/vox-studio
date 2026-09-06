# ADR-0019 — The Visual Planner uses role-specific catalog projections

**Status:** accepted · 2026-09-06
**Supersedes:** ADR-0017's whole-catalog-author decision. Its per-role prefix-identity rule remains.

## Context

ADR-0017 chose one generalist author whose identical prefix carried the whole catalog. That made
before-and-after measurements comparable, but it also gave one role authority to select structure,
fill every SceneInstance, and repair refusals. The production-crew design separates those jobs: a
Visual Structurer chooses capabilities from the complete compact selection tier; a Scene Author
receives full specifications only for those selections; a Plan Repair Agent receives only the
implicated specifications. This is not a token-saving rewrite. It makes each role's knowledge match
the decisions it is allowed to make and avoids the measured capability wall at which one generalist
prefix stopped producing reliable choices.

## Decision

Catalog material supplied to visual roles is a generated, byte-identical projection of the
published contract, never a summary or a crew-maintained list. The Visual Structurer receives every
capability's compact selection material. The Scene Author receives the full specifications of
exactly the selected capabilities. A repair receives the full specifications of exactly the
capabilities named by the refusal. An unavailable selection is a finding; it does not widen the
role's view to the whole catalog.

Prefix identity remains binding **inside one role**: every turn by that role in one Run begins with
the same generated prefix bytes. Prefixes are not required to be identical between roles, because
their authority and teaching surfaces are intentionally different.

The four visual-planning tools remain the only dynamic catalog access: capability search,
specification retrieval, SceneInstance validation, and VideoPlan validation. Their results come
from the published contract and disclose no Production client, path, command, or implementation.

## Retired measurements

Role-specific prefixes create a new measurement regime. The following generalist-author figures
remain historical evidence but must not be compared with a role-specific run:

- every assembled-prefix size and category share in ADR-0017, including 118,598 and 95,503
  characters and the catalog's 47.6% and 59.1% shares;
- the eleven/twelve and fifteen/sixteen synthetic capability walls recorded in ADR-0017;
- `services/agents/prefix-census.md`'s current whole-prefix size, category shares, repeat totals,
  anchor occurrences, distinct anchor statements, unparsed-anchor count, and withheld-category
  counterfactual;
- any context-spend, repeated-prefix, fixed-byte-count, or cache-reachability claim whose subject is
  the former generalist author's prefix.

Measurements of the canonical catalog body itself remain valid as artifact measurements, and
tests that establish the meaning of an anchor or Production command remain valid. What is retired
is comparison across incompatible authoring prefixes.

## Consequences

The contract must publish tier membership and every tier must reconstruct its canonical source by
byte-identical selection. The old `PlanAuthor` remains a compatibility seam for handed and scripted
diagnostics, but the ADK production crew does not teach its role-split Visual Planner through that
generalist prefix. New prefix census records must name the role and projection they measured.

