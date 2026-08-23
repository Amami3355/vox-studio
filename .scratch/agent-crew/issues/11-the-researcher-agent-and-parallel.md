# 11: The researcher agent, with Parallel behind an interface

**What to build:** A researcher agent that triages an incoming Brief, grounds a factual
one with deep research, recommends a Decline for one the catalog cannot serve, and makes
no network call at all for a Brief that is declared test data.

Research runs behind a thin interface with two implementations: a live one using the
operator's key, for interactive runs only, and a recorded fixture for tests and CI. The
crew depends on the interface, never on which implementation is active.

The skip path is the behaviour most worth asserting. A fictional Brief — Helios Bay is
the standing example — must produce **zero** research calls, because spending a network
request on facts that were declared test data is both waste and a correctness error.
Tests prove the count is zero rather than merely small.

Researcher tests never touch the network. A sentinel fails any test that attempts
egress, mirroring the zero-network probes the proofs already run.

This ticket is independent of the producer chain and can be worked in parallel with it.

**Blocked by:** 05 (A Python crew that reads the teaching surface)

**Status:** ready-for-agent

- [ ] The researcher triages a Brief and grounds a factual one with research
- [ ] Research runs behind one interface with live and recorded-fixture implementations
- [ ] A fictional Brief produces exactly zero research calls, asserted as a count
- [ ] The researcher recommends a Decline for a Brief the catalog cannot serve
- [ ] Tests use the recorded fixture and a network sentinel fails any egress attempt
- [ ] No crew code branches on which research implementation is active
