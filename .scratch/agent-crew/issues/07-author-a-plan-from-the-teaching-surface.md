# 07: The producer agent authors a plan from the teaching surface

**What to build:** Given a fresh Brief and the published contracts, the producer agent
writes a VideoPlan of its own and submits it. The compiler accepting or refusing that
plan are both successful outcomes for this ticket; converging on a refusal is the next
one.

This is the first ticket where a model is in the loop. Its instructions are authored
from the contract index's five canonical categories and nothing else — no repository
vocabulary, no file layout, no implementation knowledge may appear in them, held to the
same leak-scan discipline the proofs apply to their task messages.

What the agent writes is pure semantics: Beats carrying their own voice-over text,
partitioned into Sections with their SceneInstances, persistent elements and placements,
with symbolic anchors throughout. It writes no timings, no frames and no safe areas —
the compiler is the only writer of physical time, and an agent that writes a frame is a
bug. Capability, action and anchor names come from the published catalog rather than the
model's memory.

Asset requirements are written semantically — subject, treatment, orientation — and
never as image binaries or resolved references.

**Blocked by:** 01 (Carry a crew runtime's model credential through the environment scrub), 06 (The client drives a complete run with a scripted plan)

**Status:** ready-for-agent

- [ ] The producer agent authors a VideoPlan from a fresh Brief and submits it
- [ ] Agent instructions are built from the published contract categories, with no repository vocabulary in them
- [ ] A leak scan over the instructions passes
- [ ] The plan contains no timings, frames or safe areas
- [ ] Capability, action and anchor names all appear in the published catalog
- [ ] Asset requirements are semantic, never binaries or resolved references
- [ ] Both acceptance and refusal of the authored plan are handled without crashing
