# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Because this repo tracks issues as local markdown, the label is written as a `Status:` line near the top of the issue file.

Two further status strings are in use and map to no skills role, because they record what became
of a ticket rather than how it was triaged:

| Status in our tracker  | Meaning                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `done`                 | Implemented and landed; every acceptance criterion discharged       |
| `claimed` / `resolved` | Wayfinding tickets only — see `issue-tracker.md`                    |

Edit the right-hand column to match whatever vocabulary you actually use.
