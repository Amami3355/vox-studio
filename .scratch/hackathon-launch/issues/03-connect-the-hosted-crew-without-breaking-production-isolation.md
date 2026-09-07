# How does the hosted crew reach Production and the browser safely?

Parent: [Vox Studio: a visible result first, ready for the September 9 hackathon](../map.md)
Type: grilling
Label: wayfinder:grilling
Mode: HITL
Status: open
Assignee: none
Blocked by: 01, 02

## Question

Using the deployment research and release audience, choose the crew host, Studio host and exact authenticated network route to the existing Production VM. Production currently binds loopback behind an operator tunnel; placing a container in a VPC does not make that listener reachable.

Compare a managed crew runtime with an explicit bridge against an isolated crew worker on Compute Engine using durable disk and supervised connectivity. Preserve the three ADR-0018 isolation guarantees, payload-shaped ProductionClient, separate identities, request MACs and private Run ledger. Name any amendment needed for a new ingress topology or browser artifact export. Choose artifact delivery through an authenticated application route or an explicitly approved export mechanism, never a browser-held Production credential. Define the smallest connectivity proof and a strict fallback deadline.

## Comments

2026-09-07: The priority decision is resolved and this ticket is on the frontier. Reuse the completed research and timebox the initial connection proof to two hours. The event rules do not establish a need to migrate to Agent Engine. Verify Google Cloud model configuration during deployment and keep ElevenLabs for initial delivery. Audience choices remain in [Who uses the first Studio, with which Brief and limits?](07-confirm-the-demo-envelope.md); confirm any access choice needed for the selected route without reopening the settled event or delivery priority.
