# 19: Pin the ADK to the version it was exercised against

Status: done

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

- [x] The declared constraint requires the major version the crew is written against and excludes the next
- [x] The floor is the version the crew has actually been exercised on
- [x] The README, the pyproject comment and the constraint agree on one number
- [x] The extra is still optional and the framework is still imported when an author is built, not when the module loads
- [x] The full suite passes with the extra absent
- [x] With the extra installed, a keyless machine can still build an agent through the public seam

## Further Notes

**What the constraint became (2026-08-28).** `agents = ["google-adk>=2.7.1,<3"]`. The floor is
the version installed in `services/agents/.venv` and the one every claim in this repo about the
framework was checked against — `ContextCacheConfig`'s caching gate for ticket 22, and the
`LlmAgent` and `InMemoryRunner` surfaces `AdkPlanAuthor` builds. There is evidence for that
version and none for any older one.

**The number now has one home.** It was written in three places and is written in one: the
constraint. The pyproject comment above it and the README's install paragraph both point at the
constraint rather than restating a digit that can drift away from it. The spec's ticket-22
finding still names `google-adk 2.7.1` and is left alone deliberately — it is a past-tense record
of what was checked on a day, not a claim about what the project requires.

**The ceiling is prospective, and that is the point.** `pip index versions google-adk` on
2026-08-28 lists 2.8.0 as the latest and no 3.x at all, so the ceiling excludes nothing that
exists. It is written so that the day a 3.x lands, a routine `pip install -e ".[agents,dev]"`
fails loudly rather than quietly reshaping `LlmAgent` under the one class that reaches for it —
the same argument the model pin already makes one level up, where a stale pin is a dead run
rather than a slow one.

**Why the floor is not 2.8.0.** Because 2.8.0 is the latest and not the exercised. The floor
states what the crew has evidence for, and the evidence is a suite run and a keyless agent build
against 2.7.1; the constraint admits 2.8.0 without claiming it. Adopting it is the change this
ticket puts out of scope, where the installed version and the floor move together.

**Verified by install, not by argument.** `.venv/Scripts/python -m pip install -e
".[agents,dev]"` resolved against the installed 2.7.1 and exited 0, recording
`google-adk<3,>=2.7.1` in the distribution metadata, and `pip check` reports no broken
requirements. On a process with `GOOGLE_API_KEY`, `GEMINI_API_KEY` and
`GOOGLE_APPLICATION_CREDENTIALS` all absent, `AdkPlanAuthor(model=...).agent(instructions(...))`
returned an `LlmAgent` holding the 118,598-character prefix and no tools — the furthest a keyless
machine follows the live path, and the ticket's stated verification.

**The suite with the extra absent.** Simulated rather than uninstalled: a `meta_path` finder that
raises `ModuleNotFoundError` for `google.adk`, which is what a truly missing package raises, run
as a `-p` plugin. Exit 0, with five `importorskip` skips (`test_cli.py` twice, `test_planner.py`
three times) and the pre-existing symlink skip. That measurement corrected a claim in the two
paragraphs this ticket was editing anyway: both said *"every test but one runs without it"*, and
five tests need it. Neither says a number now — they say which tests, which cannot drift.

**Nothing else moved.** The extra is still optional, and `planner.py` still imports the framework
inside `agent()` rather than at module load, which
`test_the_live_author_is_not_imported_until_one_is_built` asserts and which passed in both runs.
No test was added, removed or changed.
