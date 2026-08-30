# 09: A Brief goes in at a URL, and a preview comes out

Status: ready-for-agent

## Problem Statement

Every other ticket in this phase moves a piece. This one is the claim they are moved for, and the
spec states it in one sentence: *"An operator who wants to produce a video today needs a Windows
machine, a checkout, a built launcher, a running service holding live credentials, and physical
access to the disk the Run lands on. That is a proof, not a product. Nobody can be given a Brief and
a URL."*

The reason this needs to be a ticket rather than the natural consequence of the others is that a
migration of this size fails in the seams between its pieces, and the seams are exactly what each
individual ticket declared out of scope. Ticket 07 proves a container boots. Ticket 08 proves a
client speaks to a host on loopback. Cloud-phase 01 proves the crew survives an event loop. None of
them proves that a Brief handed to a hosted crew reaches a hosted service, produces a Run on a
mounted volume, records through a credential the crew never held, renders in a headless browser, and
hands back a preview and a bundle that verifies. That is nine moving parts and it has never been
run.

There is a second thing this ticket owes, and it is the one most likely to be skipped under
deadline. **The isolation evidence has to be re-scored, and the parts the cloud cannot evidence have
to be reported as not evidenced rather than omitted.** The local proof sheet scores a pipe ACL, a
restricted OS principal and an absent socket. Ticket 02's ADR says what replaces each. A cloud
deployment that ships without a proof sheet has not lost an audit artifact — it has silently
inherited the local one, which scores mechanisms that are not present.

## Solution

Run it, end to end, on the provisioned topology, and write down what happened.

**One Brief, one Run, one preview.** Submitted to the hosted crew, no local checkout involved, no
operator disk in the path. The Run's artifacts come back through the surface. The preview plays.

**The evidence bundle verifies without its host.** The existing bundle verification is the bar and
it is unchanged; what changed is that the bytes it reads arrived over a network. A bundle that
verifies only where it was produced is not evidence.

**The proof sheet is re-scored for the cloud topology.** Each assertion the local sheet makes is
carried forward, replaced per ticket 02's ADR, or marked not evidenced with a reason. The discipline
is the one ADR review decision 1 established for un-sandboxed crew runs, and it is the discipline
that has kept this project's claims honest.

**What the deployment cost is recorded.** Wall time from Brief to preview, the render's measured
envelope from ticket 07, and the spend. An operator asking "can I run ten of these" should not have
to find out empirically.

## Implementation Decisions

- **This is a paid Run against live credentials and it is authorised explicitly before it starts.**
  `record` reaches ElevenLabs. The project has a standing practice of stating spend before incurring
  it and this ticket does not get an exemption for being the finale.
- **The Brief is one that has been produced locally before.** A new Brief introduces a second
  variable, and the question here is whether the topology works rather than whether the crew can
  author something novel. The comparison to a known-good local Run is most of the diagnostic value.
- **The local Run and the cloud Run are compared, and the differences are enumerated rather than
  glossed.** A Run id and timestamps differ by construction. Anything else that differs is a finding,
  and the most likely candidates are the sanitiser's output — decision 10's container-path warning —
  and any figure that was measured on Windows.
- **A failure at any seam is the ticket's output, not a reason to patch and re-run silently.** Nine
  parts, first integration; something will be wrong. What it was and where it was is worth as much as
  the success, and this project has learned three times running that an unrecorded near-miss returns
  wearing a different costume.
- **The proof sheet's "not evidenced" entries are written before the run, not after.** Deciding what
  the cloud cannot prove while looking at what it happened to produce is how a proof sheet becomes a
  summary of the outcome.
- **No code is changed by this ticket.** If the run needs a fix, the fix belongs to the ticket that
  owns the piece and this one records that it was blocked. A ticket that both proves the system and
  is allowed to modify it proves nothing.

## Testing Decisions

The run is the test. What needs deciding is what counts as passing.

**The preview is watched, not just produced.** A rendered file of the right size and duration that
is visually wrong has passed every automated check this system has. Someone plays it.

**The bundle is verified on a machine that is not the one that produced it**, which is the whole
meaning of "without its host".

**The crew's instructions, prompts and recorded fixtures are asserted unchanged** across the entire
phase, by the tests that already pin them. This is the assertion that says the migration was a
deployment change: if a prefix moved, something reached above the seam and ADR-0015 decision 1 was
violated somewhere in the last eight tickets.

**The isolation checks that survive are run against the deployed service**, from outside: no public
ingress, an unauthenticated request refused, a request with a bad body MAC refused, a replayed
request refused, and the crew identity unable to read a production secret. Five checks, all cheap,
all from a shell that is not the service's.

**A command that is not `record` is confirmed to reach no network**, against the deployed container.
Ticket 07 asserts the adapter; this asserts the deployed thing.

## Out of Scope

- **Performance work.** The figures are recorded, not optimised.
- **A second Brief, a second region, or a second concurrent Run.** One instance is this phase's
  deliberate ceiling and ticket 07 records why.
- **Asynchronous render.** Decision 7's known limit.
- **Porting the local proof harness.** It stays local and remains the authority for the local
  topology.
- **Any product surface — a studio, an editor, an end-user login.** The caller is the operator.

## Further Notes

**This is the ticket that defines "delivered", so it should be scheduled with slack in front of it
rather than as the last thing on the last day.** Nine parts integrating for the first time is not a
one-hour activity, and the useful version of this ticket is the one that has time to record what
broke.

**Blocked by:**
`.scratch/cloud-phase/issues/07-the-trusted-service-is-a-container-without-a-launcher.md`,
`.scratch/cloud-phase/issues/08-a-second-client-joins-the-first-and-neither-is-nameable-from-above.md`,
`.scratch/cloud-phase/issues/01-the-crew-is-hostable-and-adk-is-not-the-mechanism.md`

- [ ] Spend is stated and authorised before the run starts
- [ ] A Brief is submitted to the hosted crew with no local checkout, launcher or operator disk in the path
- [ ] A Run completes and a preview is produced, retrieved through the surface, and watched
- [ ] The evidence bundle verifies on a machine that did not produce it
- [ ] The cloud Run is compared to a known-good local Run and every difference beyond Run id and timestamps is enumerated
- [ ] A cloud proof sheet exists, with each local assertion carried forward, replaced per ticket 02's ADR, or marked not evidenced with a reason
- [ ] The "not evidenced" entries were written before the run
- [ ] Five isolation checks pass from outside: no public ingress, unauthenticated refused, bad MAC refused, replay refused, cross-identity secret read refused
- [ ] A non-`record` command is confirmed to reach no network against the deployed container
- [ ] Wall time, render envelope and spend are recorded
- [ ] Crew instructions, prompts and recorded fixtures are unchanged across the whole phase, asserted
- [ ] No code was changed by this ticket
