# 19: Pin the ADK to the version it was exercised against

Status: ready-for-agent

## Problem Statement

The crew declares `google-adk>=1.0` and is written against 2.x. The comment directly above the
declaration says *"Exercised here on google-adk 2.7.1, Python 3.14.4"*, and the README repeats
it. Nothing enforces the agreement: a fresh `pip install -e ".[agents,dev]"` on a machine
resolving from an older index may legally install a 1.x, and the crew would import an `LlmAgent`
and an `InMemoryRunner` whose behaviour it does not target.

The failure that produces is the shape this codebase has already decided it does not want. The
model pin is pinned exactly because *"a stale pin is a dead run rather than a slow one"* — a
retired family is listed by `models.list()` and 404s on the first turn, so the failure has to be
loud and early. The dependency floor is the same argument one level down, and it is currently
the only place in the crew where a version claim is made in prose and not in a constraint.

It matters now rather than eventually because the two tickets after this one depend on 2.x
behaviour: binding `output_schema` alongside tools, and the runner's async surface. Depending on
a version the manifest does not require would put a claim in the code that the install cannot
keep.

## Solution

Say in the constraint what the comment already says in prose: the crew needs the major version
it was exercised against, and not the next one.

The floor is the exercised minor, and the ceiling excludes the next major, because the runner
and agent APIs are what the crew touches and those are what a major version is free to move. A
bare floor with no ceiling is the same defect pointing the other way — it would let a 3.x land
in a routine install and break the one class the framework reaches.

The README's install line and the pyproject comment are brought into agreement with the
constraint, so a reader is told the same thing in all three places. Nothing else moves: the
dependency stays optional, still imported when an author is built rather than when `planner.py`
is loaded, and a bare `pytest` still needs no network install.

## Implementation Decisions

- **The optional-extra structure does not change.** `agents` stays optional and `dev` stays
  separate. The reason the crew's tests run with neither installed is the import site, not the
  constraint, and this ticket does not touch the import site.
- **The exercised version is the floor.** Not the earliest version that happens to work — the
  crew has evidence for one version and none for any other, and a floor lower than the evidence
  is a guess published as a requirement.
- **The next major is excluded.** The framework's agent and runner surfaces are the crew's only
  contact with it, and they are exactly what a major version may reshape.
- **Three statements of the version become one source and two references.** Whichever of the
  README line and the pyproject comment survives should point at the constraint rather than
  restate a number that can drift away from it.

## Testing Decisions

There is no unit test for a dependency constraint, and inventing one would be testing pip. What
this ticket is held to instead is that the suite is unchanged and still passes with the extra
absent — which is the property the optional dependency exists to protect, and the thing a
careless edit here would break.

The verification is an install: the extra resolves, `AdkPlanAuthor` builds, and
`AdkPlanAuthor.agent(...)` returns an agent on a machine holding no model credential. That is
the furthest a keyless machine follows the live path and it is already a public seam for exactly
this reason.

## Out of Scope

- **Making the ADK a required dependency.** The reason it is optional is recorded in the
  pyproject comment and is unchanged.
- **Pinning to an exact version.** A lockfile is not what this project uses and a hard pin would
  refuse patch releases the crew has no reason to refuse.
- **Auditing the crew against a 2.x newer than the exercised one.** If a later version is
  adopted, the exercised number and the floor move together, in that change.

**Blocked by:** None (can start immediately)

- [ ] The declared constraint requires the major version the crew is written against and excludes the next
- [ ] The floor is the version the crew has actually been exercised on
- [ ] The README, the pyproject comment and the constraint agree on one number
- [ ] The extra is still optional and the framework is still imported when an author is built, not when the module loads
- [ ] The full suite passes with the extra absent
- [ ] With the extra installed, a keyless machine can still build an agent through the public seam
