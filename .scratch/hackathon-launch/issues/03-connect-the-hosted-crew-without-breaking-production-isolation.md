# How does the hosted crew reach Production and the browser safely?

Parent: [Vox Studio: a visible result first, ready for the September 9 hackathon](../map.md)
Type: grilling
Label: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: Codex
Blocked by: 01, 02

## Question

Using the deployment research and release audience, choose the crew host, Studio host and exact authenticated network route to the existing Production VM. Production currently binds loopback behind an operator tunnel; placing a container in a VPC does not make that listener reachable.

Compare a managed crew runtime with an explicit bridge against an isolated crew worker on Compute Engine using durable disk and supervised connectivity. Preserve the three ADR-0018 isolation guarantees, payload-shaped ProductionClient, separate identities, request MACs and private Run ledger. Name any amendment needed for a new ingress topology or browser artifact export. Choose artifact delivery through an authenticated application route or an explicitly approved export mechanism, never a browser-held Production credential. Define the smallest connectivity proof and a strict fallback deadline.

## Comments

2026-09-07 session 11: Deployment and runtime proof completed; see Answer below. Both VMs
remain running. No provider phase was invoked. Historical receipt refusals are tracked separately.

2026-09-07 session 11: Claimed to execute the approved separate crew VM deployment and
cloud-to-cloud connectivity, persistence and isolation proof. The hosting approval is settled.

2026-09-07 user decision, after the waiting notices: **"Ma réponse est oui pour la VM crew de
10 Go."** This answers the proposed separate `e2-small` crew VM with a 10 GB persistent disk.
The user asks to continue in the next session. The hosting approval blocker is removed: do
not ask for this permission again. Claim this ticket next session and execute the prepared
deployment and actual cloud-to-cloud proof. This does not approve unrelated provider spending
or settle the later Studio audience/access choices. The ticket remains open for that proof.

2026-09-07: Released the claim while waiting for the user's hosting choice. The same missing
decision persisted across three goal turns. Prepared code, images and deployment evidence are
preserved; Production remains running. Resume by claiming this ticket after the choice arrives,
then execute the remaining cloud-to-cloud proof. The milestone is not complete.

2026-09-07 implementation: Production is updated to `9808524` and passes its deployed boundary
smoke test. The crew image, isolated registry, operator entry point and boot configuration are
prepared. Hosting choice awaits the user; no crew VM or cloud-to-cloud proof exists yet.
See [deployment evidence and exact remaining work](../proofs/cloud-path-progress-2026-09-07.md).

2026-09-07: The priority decision is resolved and this ticket is on the frontier. Reuse the completed research and timebox the initial connection proof to two hours. The event rules do not establish a need to migrate to Agent Engine. Verify Google Cloud model configuration during deployment and keep ElevenLabs for initial delivery. Audience choices remain in [Who uses the first Studio, with which Brief and limits?](07-confirm-the-demo-envelope.md); confirm any access choice needed for the selected route without reopening the settled event or delivery priority.

## Answer

The approved `e2-small` crew VM is deployed at `10.132.0.3`, with its separate persistent
10 GB state disk and no external address. A supervised, host-key-pinned SSH bridge reaches
only Production loopback port 8080 through a zero-session `voxbridge` account. The VPC allows
crew identity to Production identity on TCP 22 and operator IAP to crew TCP 22. Images and
identities are separate; the caller still signs requests and verifies response MACs.

The hosted probe successfully reads all seven contracts and a Run status, before and after a
crew stop/start, with identical persistence marker and response hashes. Session creation,
another-port forwarding, remote forwarding, private secret access and Production registry
listing/download are refused at runtime. Production's deployed smoke checks pass. This accepts
[ADR-0022](../../../docs/adr/0022-the-hosted-crew-gets-a-forwarding-capability-not-a-production-login.md)
and completes the first delivery milestone; the two-hour connectivity timebox did not require
the fallback. Exact digests, observations and tests are in the
[canonical proof](../proofs/cloud-path-progress-2026-09-07.md).

The operator policy remains separately mounted and authorizes no live phase. The browser will
use an authenticated application boundary with authorized artifact delivery and no Production
credential; Cloud Run is still the Studio host recommendation. Its concrete submit/status/media
contract and audience choices remain in tickets 04 and 07 and are not claimed deployed here.

The live proof found and fixed URL corruption in Production's path sanitizer and the renderer's
incorrect storage-directory assumption. Both old Runs separately fail current receipt-schema
validation; [ticket 08](08-diagnose-historical-run-receipt-compatibility.md) owns that unresolved
compatibility issue. A new connectivity-only Run with zero recording quota supplied the proof.
