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
