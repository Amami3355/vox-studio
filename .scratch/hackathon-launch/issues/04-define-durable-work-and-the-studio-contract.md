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

2026-09-08, user correction session: the user explicitly chose control over production ceilings
and correction/reprise of blocked Runs. The updated ADR-0025 replaces operator-only budget
admission with validated user totals and server-signed, request-bound authorization. The local
implementation persists a correction and its limits atomically, verifies the same Production
Run before adoption, retains the prior terminal/journal/media, and surfaces detailed review
observations. Initial admission, lost responses and duplicate continuation are tested without
providers. Hosted deployment and accepted-film/rehearsal evidence remain separate open gates.

2026-09-08, rehearsal session: [live recovery evidence](../proofs/studio-rehearsal-2026-09-08.md)
now proves SIGKILL at a nonterminal human-image gate, visible interrupted state, fresh signed
checkpoint reconciliation, and return to the same Run/candidate with a byte-identical provider
journal (14 dispatches). Hosted lost-admission-response/refresh and eight concurrent duplicate
submissions also preserve one job. A simulated completed-render/lost-response test refuses
implicit replay. Actual hosted render-disconnect evidence remains open; do not close the ticket yet.

2026-09-08, deployment session: [the limits/correction rollout is hosted](../proofs/studio-limits-deployment-2026-09-08.md).
Protocol 4, matching dedicated keys, signed connectivity and browser controls passed without
providers. All four jobs and checkpoint/provider-journal hashes are preserved. The user's live
trial, accepted-film and actual render-disconnect evidence remain open.
