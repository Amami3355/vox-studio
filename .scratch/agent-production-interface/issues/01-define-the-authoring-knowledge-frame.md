# Define the authoring-knowledge frame

Type: grilling
Status: open
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
