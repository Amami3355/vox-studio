# 03: The project is a trust boundary, and is provisioned as one

Status: done
Type: task
Blocked by: —

**Provisioned 2026-09-02.** The operator walked the wizard and the project exists. What is there:

| | |
|---|---|
| project | `studio-prod-7f3a`, billing attached, budget alert at 10 EUR |
| region / zone | `europe-west1` / **`europe-west1-c`** |
| identities | `vox-production@studio-prod-7f3a.iam.gserviceaccount.com`, `vox-crew@…` |
| secrets | the four production names → production only; `VOX_CREW_MODEL_KEY` → crew only |
| registry | `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox` |
| disk | `vox-runs`, 50 GB pd-balanced, `europe-west1-c` |
| instance | `vox-service`, Container-Optimized OS, `e2-standard-2`, no external address |
| in | IAP TCP forwarding only — `gcloud compute ssh vox-service --zone=europe-west1-c --tunnel-through-iap` |
| out | Cloud NAT via `vox-router` / `vox-nat` |

Four things the run itself settled, each of which a later ticket would otherwise assume:

- **The zone is `europe-west1-c`, not `-b`.** `europe-west1-b` returned
  `ZONE_RESOURCE_POOL_EXHAUSTED` for a 50 GB `pd-balanced` disk — a Google-side shortage, not a
  configuration error. The region was the decision; the zone was a constant. **Tickets 04 and 07
  must use `-c`**, and the wizard now tries the region's zones in turn rather than hardcoding one.
- **The separation is proved, and was re-proved independently after the run.** The crew identity
  is refused on `ELEVENLABS_API_KEY`; the production identity is refused on `VOX_CREW_MODEL_KEY`;
  the production identity reads its own secret. The third is what makes the first two mean
  something.
- **The default network's `allow-ssh`, `allow-rdp` and `allow-icmp` rules are deleted.** They admit
  `0.0.0.0/0` at priority 65534 and were inert behind the deny-all at 65000 — which made closed
  ingress a property of one rule staying in place. `default-allow-internal` is kept. The tunnel was
  re-verified afterwards and still reaches the instance.
- **Ingress is evidenced by absence, which is stronger than the criterion asked for and is not the
  same measurement.** The criterion says an unauthenticated request to the service's address is
  refused. There is no address: the instance has no external IP, so there is nothing to send the
  request to. What was evidenced is the empty `accessConfigs`, the three surviving ingress rules,
  and a working IAP tunnel. Recorded this way rather than ticked as if a refusal had been observed,
  per ADR-0018 decision 6.

**Amended 2026-09-02, after the topology was chosen.** The topology is a Compute Engine VM with a
persistent disk in `europe-west1`, reached only through an SSH tunnel. Three consequences for this
ticket, and nothing else changes:

- **The region is decided: `europe-west1`.** It no longer needs choosing, only citing.
- **`gcloud` is not installed on the operator's machine.** Installing and authenticating it is the
  wizard's first step, and it was not budgeted when this ticket was written.
- **The wizard provisions a VM, a persistent disk, an Artifact Registry repository and a firewall
  that admits nothing** — not a serverless service and not a managed filesystem. Ingress being closed
  is now a property of the firewall and the absence of an external address, which is cheaper to
  verify than a platform setting and cannot be left half-applied.

The two-identities decision below is untouched and remains the point of the ticket.

**Amended again 2026-09-02. The wizard exists: [`scripts/provision-cloud-project.sh`](../../../scripts/provision-cloud-project.sh),
thirteen stages, idempotent, safe to stop and re-run.** It is committed rather than left in
`.scratch/` because this ticket's own criterion is that an operator who has not seen the project
can follow it. Nothing below changes; what follows is what writing it settled and what it found.

- **The route in is IAP TCP forwarding, and the route out is Cloud NAT.** Settled by the user on
  2026-09-02 against the alternative of an external address behind a deny-all rule. **A VM with no
  external address cannot reach the internet at all** — Private Google Access covers Artifact
  Registry and Secret Manager and covers neither the synthesizer nor the font host — so NAT is what
  makes "no external address" survivable rather than an extra. Ingress is one allow from
  `35.235.240.0/20` on `tcp:22` to tagged hosts, plus a deny-all at priority 65000 that beats the
  default network's permissive rules. The gateway is a standing cost the envelope now carries; on
  the order of ten currency units for a week.
- **Egress cannot be restricted to a host, and the wizard says so on screen rather than
  pretending.** Firewall rules take CIDR ranges. See ticket 07's fourth amendment and ADR-0018
  decision 5, both corrected the same day.
- **The wizard stops at a bare VM.** `create-with-container` is deprecated, and choosing what owns
  restart is ticket 07's decision rather than something to bury in a provisioning script.
- **Secrets are generated where generating beats typing.** `VOX_GRANT_KEY` and `VOX_RUN_HMAC_KEY`
  are 32 random bytes offered at an empty prompt. Every secret goes to Secret Manager on stdin —
  never a file, never an argv element, never the operator's shell history.
- **The captured configuration lands outside the repository**, at `~/.vox-cloud.env`, and holds no
  secret. The last criterion below is a property of the script, not a hope about the operator.
- **Stage 8 runs three commands, not two.** The two refusals the ticket asks for, and one grant.
  Two refusals also happen when nothing works at all, and a proof that cannot distinguish those is
  the vacuous pass this project has already been bitten by once.

## Problem Statement

There is no Google Cloud project. Prerequisite 2 of this spec asks for one *"with billing, and a
decision about who owns it"*, and gives the reason in a sentence that is easy to read past: the
production service holds live ElevenLabs credentials and signs Run ledgers, so **its project is a
trust boundary, not a convenience.**

The default move — one project, one service account, everything in it — quietly destroys a property
the local topology has for free. Locally the crew reaches production through a launcher and never
holds `ELEVENLABS_API_KEY`, `VOX_RUN_HMAC_KEY`, `VOX_GRANT_KEY` or `VOX_RUN_KEY_ID`; the service
reads them from its own environment (`service-host.ts:26-36`, each through `required()`) and the
crew reads none of them. Decision 8 states the property directly: *neither side holds the other's
secret.* A single project with a single identity makes that sentence false by construction, and it
becomes false silently — nothing fails, no test goes red, and the code-blindness argument loses a
leg that nobody notices is missing until an audit asks.

This is also the one item on the critical path that an agent cannot complete. Creating a project,
attaching billing and deciding ownership are human actions in a console, and they gate tickets 04,
07 and 09.

## Solution

Provision the smallest topology that keeps the two sides' secrets apart, and record the shape so
that it is reproducible rather than remembered.

**Two service identities, not one.** *Amended 2026-09-02.* The production service runs as the VM's
service account; the crew runs locally under its own credential and is never given the VM's. The
production identity can read the four production secrets and nothing else. The crew holds its model
credential and the `VOX_IPC_TOKEN` capability, and neither of those is a production secret. Neither
side can read the other's. This is decision 8 made operational, and it is the whole point of the
ticket — the crew being local does not soften it, because the secrets the boundary exists to
separate all live on the VM either way.

**Secrets live in the managed store from the first day**, not in a shell environment that is "moved
later". `service-host.ts` reads them from `process.env` today and will continue to — what changes is
who puts them there, and that is the runtime's secret binding rather than a code change. Ticket 07
consumes this; this ticket establishes it.

**Ingress is closed before anything is deployed to it.** The production service accepts no public
traffic. A service that is reachable while being configured has been reachable, and the window is
not recoverable by closing it afterwards.

**The provisioning is a wizard, not a runbook paragraph.** The steps are console actions with
console-specific names that drift, and the repository has already learned once — ticket 31 — that an
operator procedure nobody can follow is rediscovered every session. A wizard that walks the operator
and verifies each step is the artifact.

## Implementation Decisions

- **Two identities is the load-bearing decision and is not negotiable for cost.** Additional service
  accounts are free. The temptation is convenience during a deadline, and the cost of the shortcut
  is the sentence in decision 8 that this project's audit story rests on.
- **One project, two identities — rather than two projects.** Two projects is the stronger boundary
  and is the right answer for a product with real tenants. It is not the right answer for this
  milestone: it doubles the provisioning surface, the network configuration and the billing setup,
  and the property that matters here is secret separation, which per-identity IAM delivers inside one
  project. **This is a deliberate trade and it is recorded here so that it is revisited rather than
  inherited.** If this system ever serves a caller who is not the operator, revisit it first.
- **Region is chosen once and written down.** The volume in ticket 04, the container in ticket 07 and
  the crew in cloud-phase 01 must be co-located, and a mismatched region is discovered as a mount
  failure rather than as a configuration error. One region, named in the wizard, cited by the others.
- **Billing is attached before provisioning, and a budget alert is set.** Not a cost-control gesture:
  a render is minutes of CPU with a headless browser attached and this phase will run several by
  accident. An alert is the difference between noticing on the day and noticing on the invoice.
- **The wizard verifies rather than instructs.** Each step ends with a command whose output proves
  the step took effect. An operator who followed nine steps and mistyped one should learn it at step
  nine, not at ticket 07's first deploy.
- **No credential is committed, echoed into a transcript, or written to the repository.** The wizard
  reads secrets from operator input and writes them to the managed store directly.

## Testing Decisions

This ticket provisions a resource, so its assertions are operator-run verifications rather than CI
tests — the same shape decision 6 gives the volume conformance check.

**The separation is proved, not assumed.** With the production identity's credentials, the crew's
model secret is unreadable, and with the crew identity's credentials, all four production secrets
are unreadable. Two commands, both expected to fail, and a run that shows them succeeding is the
finding. **This is the ticket's actual deliverable** — the project exists is not the claim; the
project keeps the two sides apart is the claim.

**Public ingress is refused, from outside.** An unauthenticated request to the service's address is
rejected. Run before anything sensitive is deployed behind it.

**Nothing in CI reaches the project.** `conftest.py`'s network sentinel and the workspace's
equivalent stay in force. No test acquires a cloud credential.

## Out of Scope

- **The volume.** Ticket 04, which needs this project to exist and is otherwise independent.
- **Deploying anything.** Ticket 07.
- **The crew's model credential's provider and quota.** It is supplied to the crew identity; which
  model and what quota is not this ticket's decision.
- **Multi-tenancy, org policy, VPC-SC, or a second environment.** One environment, one operator, per
  the spec's user stories. A staging project is a real need and a later one.
- **CI/CD.** Deploys are operator-run in this phase. An automated pipeline is a convenience that
  costs its own trust decisions.

## Further Notes

**This ticket is the critical path's only human blocker, and it should be started first even though
ticket 02 must land before anything is built.** The two do not conflict: 02 is a decision an agent
can draft while the operator walks the console. Nothing is deployed until 02 is accepted.

**The four production secret names are already fixed by the code** and should be reused verbatim
rather than renamed for the cloud: `ELEVENLABS_API_KEY`, `VOX_GRANT_KEY`, `VOX_RUN_HMAC_KEY`,
`VOX_RUN_KEY_ID`. `service-host.ts` also requires `VOX_PIPE_PATH`, `VOX_IPC_TOKEN`,
`VOX_LEDGER_ROOT`, `VOX_CALIBRATION_PATH` and `VOX_REMOTION_ENTRY`; the first two are transport
configuration that ticket 07 replaces, the last three are paths into the volume.

**Blocked by:** None (human-run; start immediately, in parallel with ticket 02)

- [x] A Google Cloud project exists with billing attached and a named owner
- [x] One region is chosen and written down, and tickets 04, 07 and cloud-phase 01 cite it
- [x] Two workload identities exist: one for the production service, one for the crew
- [x] The four production secrets live in the managed secret store, readable by the production identity only
- [x] The crew's model credential lives in the managed secret store, readable by the crew identity only
- [x] Neither identity can read the other's secrets, proved by two commands that are expected to fail
- [x] The production service's address refuses unauthenticated requests, proved from outside
- [x] A budget alert is configured
- [x] The whole procedure is a wizard that verifies each step, and an operator who has not seen the project can follow it
- [x] No credential appears in the repository, a transcript, or a shell history
