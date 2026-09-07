# 05: The work on this branch that no ticket asked for

**Status:** done

A Spec-axis review of `6a4ff36..HEAD` found two commits on this branch that the four tickets do
not cover. Neither is wrong; both were unrecorded, which is the actual defect — a reviewer
reading the tickets could not tell whether the code was intended. This file is the record.

## `9f06e05` — the Decline the crew could reach in principle and never in practice

The Structurer's third answer (`unservable`), `_refuse_if_unservable`, the `UnservableBrief`
relocation into `crew_contract`, and the Structurer instruction that offers the answer.

**Why it is on this branch and not in a ticket.** It is spec-sanctioned rather than invented:
US51 asks for a missing suitable SceneCapability to become a finding, and US19 asks the Run to be
able to Decline. Ticket 02 lists "The Decline path" under **Not in scope**, and that exclusion was
about the *repair loop* reaching a Decline on exhaustion — repair exhaustion stops, and the
reasoning for stopping rather than Declining is on `SplitVisualPlanner._repair_turn`. The
Structurer's `unservable` is the other half: the one role placed to say the catalog cannot express
the need. Excluding it from the repair loop is not the same as excluding it from the branch, but
no ticket said so until now.

## `c7947b2` — four literals, two copies and a gate the checklist never named

TypeScript: `packages/production/src/commands/{dispatch,service}.ts`,
`packages/video/src/catalog/{build,tools}.ts`, plus `docs/adding-a-capability.md` and the prefix
census.

**Why it is on this branch.** It answers a prior review of this working tree, and it carries a
real catalog identity fix. Ticket 01 says it "touches `crew_run.py`, `visual_planner.py` and
`pyproject.toml`, and no contract" — true of ticket 01's own work, and this commit is not ticket
01's work. It was deliberately left as a standalone commit rather than folded into the crew
commits or rewritten, so that a reviewer bisecting the branch sees the catalog fix by itself.

**What a reviewer should do with it.** Read it as a separate change that shares a branch, not as
crew work. If the branch is ever split for review, `c7947b2` is the natural first cut.

- [x] Every commit on the branch is covered by a ticket or named here with its reason
- [x] The `Not in scope` line in ticket 02 is reconciled with `9f06e05` rather than left contradicting it
- [x] `c7947b2` is recorded as sharing the branch rather than implementing a ticket
