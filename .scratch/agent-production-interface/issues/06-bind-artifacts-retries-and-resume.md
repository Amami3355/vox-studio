# Bind artifacts, retries and resume

Type: grilling
Status: open
Blocked by: 02, 04

## Question

What state machine makes `record`, `compile` and `render` safe to repeat after success or
partial failure? Decide:

- exact artifact ownership and paths, and overwrite refusal;
- how an **uncommitted run take remains load-bearing**;
- verification at every consumer boundary, not only at the producer;
- freshness and hash checks, and when a verified take is reused;
- what counts as an authorised replacement, under the recording-input model;
- persistence and later reopening of the run directory, and crash recovery;
- which repairs preserve a take and which invalidate it;
- how `run.json` binds the plan, production configuration, take, compiled document, report
  and preview — preserving the `placeholder` / `failed` distinction so a broken asset cannot
  masquerade as a merely pending one.

It decides the repair rules and the guarantees. It does **not** decide their delivery channel:
publication is registered through
[Define the authoring-knowledge frame](01-define-the-authoring-knowledge-frame.md), and
[Decide the published contract artifacts](07-decide-the-published-contract-artifacts.md)
owns how accumulated knowledge becomes agent-readable artifacts.

**A Git commit is one persistence mechanism for shipped takes, not the definition of take
integrity.** In this repository a take is committed and a standing test holds the mp3 against
its manifest; in an isolated run neither exists. Hashes, verification at every boundary and
the final receipt must carry the standing guarantee instead.

Blocked by
[Decide the code-blind production boundary](04-decide-the-code-blind-production-boundary.md)
because artifact ownership reads differently if the agent never holds the artifacts.

## Resolved when

Every artifact has an owner, a verification point and a defined behaviour on repeat, and the
take-preserving repair rule is stated precisely enough to be published.
