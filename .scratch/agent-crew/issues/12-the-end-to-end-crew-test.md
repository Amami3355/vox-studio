# 12: The end-to-end crew test through the proof harness

**What to build:** The crew runs headless in a bootstrapped workroot against the real
production service with stubbed synthesis and render adapters, and the resulting run is
scored by the existing assertion sheet. Deterministic, free, and needing no key, quota or
network.

Reaching the crew from the harness needs a crew driver alongside the existing one. That
shim stays TypeScript and lives with the harness, because drivers belong to the harness
rather than to the crew.

The isolation assertions are reported as **not evidenced** for this run, per review
decision 1, and the run is a pass on that basis rather than despite it. The crew process
is not sandboxed in this phase: code-blindness is convention here, not enforcement, and
the sheet says so plainly instead of implying a boundary that was never tested.

No new assertion vocabulary unless a crew behaviour is genuinely unmeasured by the
existing sheet. The point of this ticket is that the crew is judged by the same bar as
the scripted driver it replaces.

**This is acceptance bar (1).**

**Blocked by:** 02 (Score isolation as not-evidenced when a driver brings no sandbox), 09 (The producer records, compiles and renders under the quota rules), 10 (Every crew run leaves an evidence bundle)

**Status:** ready-for-agent

- [ ] A crew driver lets the harness run the crew headless
- [ ] The run uses the real production service with stubbed synthesis and render adapters
- [ ] The run is deterministic and needs no key, quota or network
- [ ] The existing assertion sheet scores the run, with no new assertion vocabulary for already-measured behaviour
- [ ] Isolation assertions report as not evidenced, and the run passes on that basis
- [ ] The run produces an evidence bundle that verifies after the fact
