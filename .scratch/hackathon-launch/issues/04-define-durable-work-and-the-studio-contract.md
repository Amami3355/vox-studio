# What survives a browser disconnect or a worker restart?

Parent: [Vox Studio: a visible result first, ready for the September 9 hackathon](../map.md)
Type: grilling
Label: wayfinder:grilling
Mode: HITL
Status: open
Assignee: none
Blocked by: 03

## Question

Choose the minimum durable application contract between Studio and the hosted crew: submit a Brief and immediately obtain a stable identifier, read status/progress, recover after refresh, retrieve artifacts, and handle permitted image acceptance/resume actions.

Distinguish application job identity from ADK sessions, the Brief and the authoritative Production Run. Specify persistence, one active owner/lease, idempotent submission, operator-owned policy/grants, bounded concurrency, and recovery after a side effect completed but its response was lost. Crew checkpoints and ADK sessions alone are not a durable executor. The measured synchronous render/tunnel failure after 137–181 seconds must have an answer; increasing the browser timeout is not evidence. Decide the minimum asynchronous operation/reconciliation change needed and its proof without promising exactly-once paid provider calls.

## Comments

2026-09-08: The deployed Studio now uses persistent SQLite submissions, stable job identities,
idempotency keys, exclusive OS execution locks and a separate worker. The browser cannot provide
its own grants. Image decisions bind to a candidate digest; verified media follows session
authorization. [ADR-0025](../../../docs/adr/0025-studio-admission-is-durable-and-separate-from-production-authority.md)
records the contract. Hosted API restart preserved the session, jobs and live worker PID.
Tests cover guarded reconciliation, but live worker-crash and uncertain-render recovery are
not yet rehearsed. Keep this ticket open for that evidence; do not infer exactly-once provider
execution from the local tests. See [Studio verification](../proofs/studio-progress-2026-09-08.md).
