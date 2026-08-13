# Decide the code-blind production boundary

Type: grilling
Status: open
Blocked by: 02, 03

## Question

Given the public command lifecycle and the boundary prototype, **what does the agent receive**,
and where does production actually execute? Decide between a local opaque runtime artifact and
a thin CLI calling a process outside the readable environment; decide how the boundary proves
that implementations are unreachable; and decide which dependencies may remain installed
outside the agent's environment without making them readable.

The question is deliberately *what the agent receives*, not *what unit sits in its directory*:
the second phrasing presupposes the in-directory bundle, and the prototype exists precisely to
test whether that boundary holds.

Enforce the map's threat model as the acceptance standard — readable contracts and vocabulary
yes, readable implementations, TypeScript, sourcemaps, repository paths and internal comments
no, and minification alone establishes nothing.

If the cut line reaches item 2, this ticket also absorbs
[Decide the published contract artifacts](07-decide-the-published-contract-artifacts.md)
rather than dropping its question.

## Resolved when

The executing location, the received artifacts and the enforcement mechanism are fixed, and
the leak checks the prototype ran are restated as standing requirements on the production
build.
