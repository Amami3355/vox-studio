# Map — the way to a Brief at a URL

Label: `wayfinder:map` · **Charted:** 2026-09-02 · **Tracker:** local markdown (`AGENTS.md:5-7`)

This map holds **decisions**. It does not hold the build: `DELIVERY.md` orders the nine build
tickets and is not restated here. A decision lives in exactly one place; this file gists it and
points at where the detail is.

## Destination

An operator submits a Brief to a remote production service and watches the preview it renders, by
**9 September 2026**, with the run store, the render and the four production secrets all off the
operator's machine. The crew runs locally and drives it. The deployed artifact knows nothing about
Windows.

Reaching the destination means ticket 09's criteria, minus the half of its first criterion that
requires the crew itself to be hosted — cut deliberately on day one, recorded below.

## Notes

**Domain:** a trusted production service with a code-blindness boundary, moving from an OS-local
named pipe to a network transport without losing the isolation argument that boundary carries.

**Skills every session should consult:** `mattpocock-skills:tdd` for tickets 05, 06 and 08;
`mattpocock-skills:domain-modeling` for ticket 02's ADR; `find-docs` before any claim about a Google
Cloud product surface — this map was charted after one such claim could *not* be evidenced and the
topology changed as a result; `vox-production-service` before hand-rolling a service start.

**Standing preferences for this effort.** Plain prose to the user, house style in artifacts. Name
every cut out loud and unprompted. Do not spawn subagents unless the user asks. Do not pick up a
frozen crew ticket — a session that finds itself in one has drifted off the path.

**Check the clock before writing any schedule.** A handoff's header date is the date it was
*written*. This has cost the project twice.

## Decisions so far

Twelve decisions were settled while charting, in three rounds with the user on 2026-09-02. Four of
them contradict tickets as written; those tickets were edited the same day rather than left as traps.

- **The scope cut is taken on day one, not day six**: crew-20 and cloud-01 are dropped and the crew
  stays local, buying back two days out of a seven-day plan that had no slack. This is the spec's own
  decision 5 first milestone rather than a retreat. See [Out of scope](#out-of-scope).
- **"Not dependent on Windows" means the deployed artifact, not the codebase.** The named pipe
  transport, `ipc/host.ts:70`'s pipe-path assertion, the pipe bridge and `RestrictedRunner.cs` all
  survive as the local development and proof topology. Two transports over one surface, permanently.
- **The GCP project is provisioned by a wizard the operator walks**, not a runbook paragraph —
  [03](issues/03-the-project-is-a-trust-boundary-and-is-provisioned-as-one.md). `gcloud` is not
  installed on the operator's machine; the wizard covers that first.
- **This map is the decision layer only.** `DELIVERY.md` keeps the build order.
- **The topology is one Compute Engine VM with a persistent disk, not a serverless runtime with a
  network volume** — [04](issues/04-the-volume-proves-posix-semantics-or-it-is-the-wrong-volume.md),
  **which is now proved rather than argued**: all four primitives hold on the real `ext4` disk from
  a container on the box, and the same check goes red on a gcsfuse bucket. **`link()` is the only
  one of the four that discriminates** — the bucket passed `rename()`, `realpath()` and exclusive
  create, and downgraded `0600` to `0644` without failing anything. See
  [`ticket-04/FINDINGS.md`](ticket-04/FINDINGS.md).
  The phase already ships a one-instance ceiling and a synchronous render, so nothing serverless was
  being used; a real ext4 disk makes `RunStore`'s POSIX requirements a property rather than a
  hypothesis, and deletes the phase's largest unknown instead of testing it.
- **Cost is held to a demo envelope**, which is what rules out a managed filesystem's monthly floor.
- **The machine type is `e2-standard-2` — 2 vCPU, 8 GB — measured rather than chosen.** Ticket 11
  built the real image and rendered in it: 2.08 GB peak and 178 s under a two-vCPU cap, against a
  cap that was pessimistic in the direction that matters. Four times the memory headroom, three
  minutes a render, and the cheaper answer. The request timeout and the platform's ceiling both have
  to admit three minutes.
- **Region is `europe-west1`, chosen once.** The disk, the VM and the proof run all agree on it.
  **The zone is `europe-west1-c`**, decided by availability rather than preference on 2026-09-02:
  `-b` had no `pd-balanced` capacity for the run store's disk. The region is the decision and the
  zone is a fact — tickets 04 and 07 cite `-c`, and the wizard tries the region's zones in turn.
- **The project is `studio-prod-7f3a`, and it is provisioned** —
  [03](issues/03-the-project-is-a-trust-boundary-and-is-provisioned-as-one.md) is done. Two
  identities, five secrets separated and the separation proved by three commands, Artifact
  Registry, a 50 GB disk, `vox-service` on Container-Optimized OS with no external address, IAP in
  and Cloud NAT out. The default network's internet-facing allow rules are deleted rather than
  left shadowed. **04 and 07 are unblocked on this axis.**
- **The preview is a time-limited signed link**, with the thinnest possible page around it. Streaming
  bytes back through a synchronous render response is the version that fails on the day.
- **The operator on the 9th is the project's own operator**, nobody else. No third-party
  authentication is budgeted.
- **There is no public ingress and no domain**: the service is reached through an SSH tunnel, so
  ticket 03's closed-ingress requirement is satisfied by construction rather than by configuration.
  Ticket 09's real criterion — no local checkout, launcher or operator disk in the path — is
  untouched by this, because the service, the store and the render are all remote.
- **The image is pulled from Artifact Registry onto Container-Optimized OS**, with the platform
  owning restart — [07](issues/07-the-trusted-service-is-a-container-without-a-launcher.md). A plain
  Debian VM with Docker was the named escape hatch if Remotion turned out to need something from the
  host; **ticket 11 built the image and rendered in it, so the escape hatch is not taken** and the
  decision is evidenced rather than assumed. Building from source on the box is ruled out: the
  source on the box is the code-blindness argument leaking.
- **The VM has no external address; IAP is the way in and Cloud NAT is the way out.** Settled by
  the user on 2026-09-02, against an external address behind a deny-all rule. The forcing fact came
  from the docs: **an instance with no external address reaches no non-Google host without NAT**,
  and Private Google Access does not cover the synthesizer or the font host, so `record` and every
  render depend on the gateway. Ingress is one allow from `35.235.240.0/20` on `tcp:22`, plus a
  deny-all at priority 65000. The NAT gateway is a standing cost the envelope now carries.
  Provisioned by [`scripts/provision-cloud-project.sh`](../../scripts/provision-cloud-project.sh).
- **Egress is not restrictable to a host, so the two-host list governs review and not traffic.**
  VPC firewall rules take CIDR ranges; the synthesizer and `fonts.gstatic.com` are both behind
  CDNs. **The denying adapter is the only enforced egress lock in this phase.** ADR-0018 decision 5
  and ticket 07 were corrected the same day, on the day the ADR was accepted. Enforcing the list
  needs Secure Web Proxy or Cloud NGFW FQDN objects and is a later ticket.
- **`sshd` and the firewall answer "who may connect", and nothing inside the container does.**
  Settled by ADR-0018 decision 2 and corrected the same day in the three places that still said
  otherwise: the spec's decision 4 and its transport paragraph, ticket 06's caller-authentication
  and TLS decisions, and ticket 08's client. All three were written against a serverless runtime
  with an identity layer in front of it; a VM behind a tunnel has none. **The property is unchanged
  and only its mechanism moved**, and the consequence is subtractive — the network host binds
  loopback and implements no identity check, and the HTTP client presents no identity and needs no
  credential beyond the bearer token and HMAC key it already holds. There is no TLS anywhere in this
  topology; the tunnel is the encrypted channel.
- **The isolation guarantee is stated independently of the transport, and ADR-0007's transport
  clause is superseded in part** — [ADR-0018](../../docs/adr/0018-the-isolation-guarantee-outlives-the-named-pipe.md),
  accepted 2026-09-02, closing ticket 02 and the spec's prerequisite 1. The guarantee is three
  sentences that mention no socket; the tunnel and the SSH key answer what the pipe ACL and the
  absent socket answered; the per-request HMAC is unchanged and answers a different question; the
  container replaces the restricted OS account and is a stronger separation. Two assertions become
  `not-evidenced` in a cloud run rather than passing — `isolation.service-denied`, and
  `network.record-only` in its current wording — and the pipe-path assertions stay with the local
  topology. **06, 07, 09 and 12 are unblocked by it and each owes something to it.**
- **The four faces stay on `fonts.gstatic.com`, and the egress rule names it.** Settled by the user
  on 2026-09-02, against a recommendation to self-host them in the image. The render's egress
  allowlist carries two hosts — the synthesizer's and `fonts.gstatic.com` — each with its reason
  written down. The denying adapter at `service-host.ts:59` is unchanged and still refuses everything
  the service attempts; what is given up is the second lock, because font traffic below the adapter
  now has a permitted path out. **ADR-0007's property is therefore weaker than it was and ADR-0018
  states the weaker one rather than inheriting the old wording** — see
  [02](issues/02-the-boundary-is-re-earned-without-os-local-ipc.md) and
  [07](issues/07-the-trusted-service-is-a-container-without-a-launcher.md). One consequence is
  bought back: the accepted still hashes do not move.
- **The crew holding `VOX_IPC_TOKEN` is not a violation of decision 8, and never was.** Verified in
  `proof/codex-agent.ts:415`, which scrubs the environment and then re-applies the token by name as
  *the launcher capability*. It authorises calling the service; it reveals none of the four
  production secrets, which stay service-side in `service-host.ts:26-36`. The bearer capability moves
  to the second transport unchanged, so the crew-side change is small.

- **The payload-shaped surface is constructed with a runs root, not the ledger root** —
  [05](issues/05-the-service-gains-a-payload-shaped-surface.md), which is done. Ticket 05's criterion
  said "its own ledger root"; taken literally that puts public Run directories inside the private
  trusted area, contradicting the split every fixture builds and the volume ticket 04 mounted. The
  surface takes `runsRoot` and the command service keeps its `ledgerRoot`. Settled with the user on
  2026-09-02 before the module was written. `ProductionCommandService` and `dispatchProductionArgv`
  are unchanged and permanently coexist as the two callers of one command service. **06, 08 and 10
  are unblocked.**

## Not yet specified

In scope, real, and not yet sharp enough to ticket.

- **Who owns the run-store mount across a reboot, and which uid the container runs as.** The disk is
  formatted and mounted at `/mnt/disks/vox-runs`, `root:root 755`, with no `/etc/fstab` entry. Ticket
  07's, and named here so it is not discovered.

- **The operator procedure on the day.** How the tunnel is stood up, what the operator types, and
  what they see while a synchronous render runs for minutes. The tunnel half is now answered —
  `gcloud compute ssh <instance> --tunnel-through-iap`, and ticket 03's wizard proves it reaches
  the box in its last stage. What the operator watches during a three-minute synchronous render is
  still unwritten, and graduates once 07 deploys something to watch.
- **What owns container restart on Container-Optimized OS.** `create-with-container` is deprecated
  and ticket 07 must choose a mechanism rather than inherit one. A `cloud-init` unit is the near
  neighbour and has not been tried.
- **What the Windows-recorded still hashes mean on Linux.** Fourteen of them differ in the container
  and pass on the host. No longer entangled with the fonts — the font decision leaves them where
  they are — so this is a Windows-versus-Linux question on its own, and ticket 09 asserts recorded
  fixtures are unchanged across the phase, which cannot currently hold on both platforms at once.
- **The Linux-path corpus for the widened sanitiser expression.** `internalPath` needs a container
  path to redact; what the corpus must contain is a ticket 06 question and is not answerable before
  the container path shape is known.
- **What the local proof harness's Windows-only verdicts become.** Ticket 02's ADR names which
  recorded probes stop meaning anything; what replaces them in the sheet is downstream of that
  naming and of [12](issues/12-the-proof-sheet-says-what-it-cannot-evidence.md).

## Out of scope

Past the destination. These never graduate; they return only if the destination is redrawn, and then
as a fresh effort.

- **Hosting the crew** — crew-20 and cloud-01. The scope cut on day one. The crew runs from a local
  checkout and drives the remote service. What is lost is the "no local checkout" half of ticket 09's
  first criterion, and nothing else.
- **The context and token economy cluster** — crew 24, 27, 28, 30 and the deferred `TeachingSurface`
  refactor, plus crew 11, 13, 21, 29, 31 and production-interface 22–25. Frozen by `DELIVERY.md`,
  and frozen is not cancelled: 24 is the first thing to unfreeze after the 9th.
- **Removing Windows from the codebase.** One transport, the pipe bridge deleted, the harness ported.
  It would throw away the authority for the local topology to buy nothing this destination needs.
- **A serverless runtime and a managed network filesystem.** Ruled out by the topology decision, and
  by a cost envelope this milestone has no reason to spend.
- **A domain, TLS termination and public ingress.** Ruled out with the tunnel. Returns the moment a
  caller who is not the operator needs to reach this.
