# 06: The client drives a complete run with a scripted plan

**What to build:** Driven by a fixture plan and no model at all, the client carries a
Brief from a fresh Run to a rendered preview: initialise, validate, Preflight, record,
compile, render, and read the resulting artifacts back.

This proves the entire client surface for zero tokens, and it is the Python counterpart
of the scripted driver the proofs already use. Every verb the crew will ever call is
exercised here, while the thing being tested is the client rather than a model's
judgement.

Payload-shaping applies to all of it, not just the plan. The Brief's request, the plan,
a Decline decision and a replacement authorisation all arrive at the client as objects;
the local implementation is where each becomes a file the launcher can be pointed at.
Artifacts travel the other way through the retrieval method, so no caller ever joins a
run root to a relative path.

Where a command refuses, the refusal is returned intact and is not raised as an
exception: a refusal is information the crew is meant to act on, and a client that
throws on it has destroyed the thing later tickets need.

**Blocked by:** 05 (A Python crew that reads the teaching surface)

**Status:** done

- [x] A fixture plan drives a Run from initialise through to a rendered preview
- [x] Every production verb is reachable through the client
- [x] Request, plan, decision and replacement authorisation are all passed as objects
- [x] The preview, the compile report and the Preflight report are read back through artifact retrieval
- [x] A refused command returns its envelope intact rather than raising
- [x] Tests run against recorded fixtures with no service, key, quota or network
