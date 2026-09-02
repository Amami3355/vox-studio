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
  network volume** — [04](issues/04-the-volume-proves-posix-semantics-or-it-is-the-wrong-volume.md).
  The phase already ships a one-instance ceiling and a synchronous render, so nothing serverless was
  being used; a real ext4 disk makes `RunStore`'s POSIX requirements a property rather than a
  hypothesis, and deletes the phase's largest unknown instead of testing it.
- **Cost is held to a demo envelope**, which is what rules out a managed filesystem's monthly floor.
- **Region is `europe-west1`, chosen once.** The disk, the VM and the proof run all agree on it.
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
  Debian VM with Docker is the named escape hatch if Remotion turns out to need something from the
  host. Building from source on the box is ruled out: the source on the box is the code-blindness
  argument leaking.
- **The crew holding `VOX_IPC_TOKEN` is not a violation of decision 8, and never was.** Verified in
  `proof/codex-agent.ts:415`, which scrubs the environment and then re-applies the token by name as
  *the launcher capability*. It authorises calling the service; it reveals none of the four
  production secrets, which stay service-side in `service-host.ts:26-36`. The bearer capability moves
  to the second transport unchanged, so the crew-side change is small.

## Not yet specified

In scope, real, and not yet sharp enough to ticket.

- **The operator procedure on the day.** How the tunnel is stood up, what the operator types, and
  what they see while a synchronous render runs for minutes. Graduates once 03 lands and there is a
  box to tunnel to.
- **Whether the image can carry all of Remotion's dependencies.** Sharpens into a real question only
  after the spike in [11](issues/11-remotion-renders-in-the-image-or-the-image-is-wrong.md) reports;
  if it can't, the COS decision reopens and the Debian escape hatch is taken.
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
