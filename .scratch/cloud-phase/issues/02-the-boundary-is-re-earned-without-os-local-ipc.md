# 02: The boundary is re-earned without OS-local IPC

Status: done
Type: grilling
Blocked by: —

**Amended 2026-09-02, after the topology was chosen.** This ticket was written before the runtime
was decided and assumed a serverless one. The topology is a Compute Engine VM with a persistent
disk, no public ingress, no domain, and an SSH tunnel as the only route in; the crew stays local.
The ADR's four questions are unchanged and its argument is unchanged. What changes is the answer to
the second one — see the amended paragraph below — and the ADR must now be written against a tunnel
and a firewall rather than against a platform's identity layer. See `map.md`.

**Amended again 2026-09-02, after the font decision.** The ADR gains a fifth thing to state, and one
of its scope exclusions below needs reading carefully rather than at face value.

**A `render` reaches the network, and the ADR must say so in its own words.** Ticket 11 measured it
and the user settled it: the four faces stay on `fonts.gstatic.com`, fetched by the headless browser
*below* `service-host.ts:59`, where the denying adapter cannot see them. ADR-0007 reads as though
`record` is the only command with outbound traffic. That was never quite true in the local topology
either — the fetch happened there too, silently, over a machine with a network — but locally nothing
claimed otherwise. In the cloud it becomes a written property of the deployment, because the egress
rule has to name `fonts.gstatic.com` for renders to work at all.

- **The exclusion "not `record`'s network exception" still stands, and is narrower than it looks.**
  This ticket does not reopen *why* `record` may reach outbound network or what else might. It does
  have to state accurately what the render path does, because ticket 09's proof sheet will otherwise
  score a property the deployment does not have.
- **State the guarantee at the layer that actually holds it.** The adapter's rule — the service
  itself reaches nothing but what `record` needs — is untouched and provable. The egress rule is a
  second, weaker lock: two named hosts rather than one, and font traffic below the adapter has a
  permitted path out. The honest sentence separates the two locks instead of presenting the pair as
  one property.
- **This is a claim ticket 09 must be able to evidence.** "No unexpected egress" is not scorable
  against an allowlist with an unexplained entry on it. "Egress is limited to two hosts, each named
  with its cause, and everything else is refused" is.

## Problem Statement

ADR-0007 contains one sentence that forbids this entire spec:

> A native, thin `vox` launcher communicates with it through authenticated OS-local
> IPC, **never TCP or HTTP**.

That is not a stylistic preference and it must not be edited away as one. It is the load-bearing
clause of the code-blindness argument, and three of the four isolation properties the proof sheet
scores hang off it: the pipe ACL answers *who may connect*, the restricted Windows account answers
*what the caller may read*, and the absence of a socket answers *who may reach the service at all*.
In a cloud topology none of those three exist. There is no pipe, no Windows principal, and the
service is reachable by anything the network permits.

The spec's prerequisite 1 says nothing in the cloud phase may be built before this is settled, and
that ordering is correct rather than ceremonial. Every other ticket in this phase is downstream of
the answer: ticket 06 cannot choose an authentication mechanism before the guarantee it must deliver
is stated, ticket 07 cannot argue its container's ingress posture, and ticket 09's proof sheet has
nothing to score itself against.

**The tempting move is to amend the sentence and leave the rest of ADR-0007 standing.** That is
wrong, and cheaply so: the sentence is a consequence of the threat model rather than an axiom of it,
and the surrounding paragraphs — what the service alone owns, what the agent receives, what `record`
alone may do — remain true in both topologies. An amendment that changes one clause leaves a reader
unable to tell which of the isolation *evidence* still applies. The honest shape is a new ADR that
supersedes ADR-0007's transport clause specifically, states what replaces each of the three lost
properties, and says which recorded probes stop being meaningful.

## Solution

Write the ADR. It answers four questions and nothing else.

**What the guarantee actually is, stated independently of its mechanism.** ADR-0007's guarantee is
that the agent cannot read production's implementation, cannot reach its credentials, and cannot
issue a command production did not publish. The named pipe was one way to deliver that. The ADR
restates the guarantee in terms that survive a transport change, so that a future topology can be
judged against it rather than against a socket type.

**What replaces the pipe ACL.** *Amended 2026-09-02; corrected from the live firewall read on
2026-09-05.* No public ingress and no listening socket the network can reach: the VM has no external
address, the service binds loopback, and the only route in is an SSH tunnel gated by a key the
operator holds. `default-allow-internal` admits internal TCP, so the firewall alone is not the
service-port boundary. The tunnel answers *who may reach the service at all* where the absence of a
socket used to, and the SSH key answers *who may connect* where the ACL used to. The per-request MAC stays, unchanged, because it authenticates the request
body rather than the channel and the Run ledger's integrity story already rests on it. Two
independent answers to two different questions, which is the property the local topology has and
which is easy to lose by assuming one channel covers both.

**The bearer capability is not new and must not be described as if it were.** `VOX_IPC_TOKEN` is
already what authorises a caller: `proof/codex-agent.ts:415` scrubs the agent's environment and then
re-applies the token by name, as the launcher capability. It authorises *calling* the service and
reveals none of the four production secrets, which `service-host.ts:26-36` reads and the crew never
holds. The ADR should say so plainly, because a reader who assumes the crew gains a secret at the
transport change will conclude decision 8 broke, and it did not.

**What replaces the restricted OS account.** The container is the isolation unit. The agent has no
filesystem in common with the service, which is a *stronger* separation than the local topology
achieves and should be claimed as such rather than apologised for — locally the crew and the service
share a disk and the boundary is an ACL over it.

**Which recorded evidence stops meaning anything.** The isolated-OS-principal probes and the
pipe-path assertions score a mechanism that will not be present. The ADR names them, says what is
offered instead, and does not pretend the substitute is the same measurement. The distribution leak
scan is unaffected and continues to apply to both topologies.

## Implementation Decisions

- **A new ADR supersedes the transport clause; ADR-0007 is not rewritten.** Its status line gains a
  superseded-in-part note pointing at the new number, and its body stays legible as the record of
  why the local design is what it is. Rewriting an accepted ADR destroys the reasoning a later
  reader needs in order to evaluate the replacement.
- **The scope is the transport clause and the isolation evidence, nothing else.** Not the contract
  categories, not `record`'s network exception, not the code-blindness threat model. A wide ADR here
  invites a wide argument and this phase cannot afford one.
- **No local HTTP listener is authorised by this ADR.** ADR-0015 decision 3 rejected it and the
  cloud spec's decision 3 declines to reopen it. The named pipe stays the local transport; the ADR
  permits an authenticated network transport for the *remote* topology and says so in those words,
  so that a future session cannot cite it to add a convenience listener on a developer's laptop.
- **The ADR states the evidence a cloud deployment must produce**, in enough detail that ticket 09's
  proof sheet can be written from it. An ADR that permits the topology without saying what would
  demonstrate the guarantee has moved the decision rather than made it.

## Testing Decisions

An ADR is not tested; it is cited. What this ticket owes instead:

**Every ADR that references ADR-0007's transport clause is found and updated.** `grep` for `0007`
across `docs/`, `packages/`, `services/` and `.scratch/`, and each hit is either still correct or
amended. The proof sheet and the release gate are the two most likely to be stale.

**The superseded-in-part note is present on ADR-0007 itself**, so that a reader who arrives at the
old ADR first is not misled by it.

## Out of Scope

- **Choosing the authentication implementation.** Ticket 06. This ADR says what property must hold;
  that ticket picks the mechanism and proves it.
- **Provisioning anything.** Ticket 03.
- **Re-running or re-scoring the existing local proof.** The local topology is unchanged and its
  evidence stands for it.
- **The crew's own hosting posture.** Cloud-phase ticket 01 and crew ticket 20.

**Blocked by:** None — and nothing else in this phase may start before it lands.

- [x] A new ADR states ADR-0007's isolation guarantee independently of the transport that delivered it
- [x] It names what replaces the pipe ACL, the restricted OS account, and the absence of a socket
- [x] It states that the per-request HMAC survives unchanged, and why channel and body authentication are two answers
- [x] It names which recorded isolation probes stop being meaningful, without claiming the substitute is the same measurement
- [x] It states that a `render` reaches `fonts.gstatic.com` below the adapter, and separates the adapter's guarantee from the weaker egress allowlist
- [x] It states the evidence a cloud deployment must produce, in terms ticket 09 can write a proof sheet from
- [x] It permits an authenticated network transport for the remote topology only, and does not authorise a local HTTP listener
- [x] ADR-0007 carries a superseded-in-part note pointing at it, and its body is otherwise unchanged
- [x] Every reference to ADR-0007's transport clause across the repository is found and is either still correct or amended
