# 09: A Brief goes in at a URL, and a preview comes out

Status: done

**Amended 2026-09-02, after the topology was chosen and the scope cut was taken.** This ticket
defines "delivered", so it is the one place where a stale assumption costs the most: everything else
is scored against it. Five changes. Its argument — that the seams between the pieces are what fails,
and that what the cloud cannot evidence is reported rather than omitted — is untouched.

- **The title's URL is the preview's, not the submission's.** The service has no public ingress and
  no domain; it is reached through an SSH tunnel. What arrives *at a URL* is the preview, as a
  time-limited signed link — [10](10-the-preview-is-reachable-without-a-domain.md). The Brief goes in
  over a forwarded local port. The destination is unchanged; the sentence describing it was written
  before anyone chose how the bytes travel.

  **Corrected 2026-09-05, when ticket 10 answered.** *There is no signed link and there is no URL.*
  The preview is retrieved as bytes over the same tunnel, by the descriptor the envelope published;
  the object-store shape is dead against ADR-0018 decision 5's network adapter, and the
  forwarded-port link needs a browser-facing route on the boundary that this phase is not taking. The
  third criterion below is amended to name the mechanism. **The bar is unchanged and *watches* is not
  redefined** — this ticket's own testing decision already asks for a human playing the render rather
  than a video element streaming from an origin, and that is still what it asks for.
- **The crew is local, by the day-one cut, and `cloud-01` leaves the blocked-by list.** Hosting the
  crew is out of scope and never graduates in this phase — see `map.md`. The first criterion below
  loses the half that requires a hosted crew and keeps every other half.
- **"No operator disk in the path" needs saying precisely, because the cut made the loose version
  false.** The crew runs from a local checkout and reads the Brief off the operator's disk. What must
  not be on that disk is the **Run store, the render and the four production secrets** — which is the
  property this phase was for, and which the cut does not touch. Stating it as "no operator disk"
  now scores the deployment as a failure for a thing it deliberately does.
- **Three of the five isolation checks cannot be run from outside the tunnel, and would pass
  vacuously if they were.** *Unauthenticated refused*, *bad MAC refused* and *replay refused* are
  assertions about ticket 06's host. From outside, nothing connects at all and all three "pass"
  without the host having been asked anything. **They are run from inside the tunnel, through the
  forwarded port.** This is the ticket's own rule about the network adapter — *a test that passes
  only because the network was unavailable has not tested the adapter* — turned on the ticket.
- **"No public ingress" stops being an application check and becomes a provisioning one.** Under the
  tunnel it is true by construction, which makes it cheaper to assert and weaker as evidence of
  anything the service does. Assert it where it now lives: the VM has no external address, IAP
  reaches only SSH, and the service binds loopback. **Corrected 2026-09-05:**
  `default-allow-internal` admits internal TCP, so “the firewall admits nothing on the service's
  port” was false and is not an acceptance criterion. Record the actual mechanisms as properties
  of the topology rather than as things the service earned.

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
`.scratch/cloud-phase/issues/10-the-preview-is-reachable-without-a-domain.md`

- [x] Spend is stated and authorised before the run starts
- [x] A Brief is submitted by the local crew to the remote service, with no launcher in the path, and with the Run store, the render and the four production secrets all off the operator's disk
- [x] A Run completes and a preview is produced, retrieved over the tunnel by its published descriptor, and watched — user verdict on 2026-09-05: “the video is ok”
- [x] The evidence bundle verifies on a machine that did not produce it — nine files assembled on Windows and verified with the existing reader on `vox-service`; integrity verified, with the bundle's honest `fail` verdict traced to `CALIBRATION_MISSING`
- [x] The cloud Run is compared to a known-good local Run and every difference beyond Run id and timestamps is enumerated — calibration, non-reproducible Take and downstream timing/media, plus the recorded render-recovery history
- [x] A cloud proof sheet exists, with each local assertion carried forward, replaced per ticket 02's ADR, or marked not evidenced with a reason
- [x] The "not evidenced" entries were written before the run
- [x] Three host checks pass from inside the tunnel, through the forwarded port: unauthenticated refused, bad MAC refused, replay refused
- [x] Two checks pass from outside the service: the VM has no external address, direct IAP to port 8080 is refused and the service binds loopback; the crew identity has no production-secret binding. The identity result is an IAM-policy observation, not a live denied read
- [x] The deployed image's denying adapter is confirmed with egress available on the VM; the live smoke reaches its control endpoint and then receives `NETWORK_POLICY_DENIED`
- [x] Wall time, render envelope and spend are recorded
- [x] Crew instructions, prompts and recorded fixtures are unchanged across the whole phase, asserted from pre-cloud `7caac82`: six prompt-building functions, 38 existing crew fixtures, the prefix census and seven recorded still-hash files are unchanged; the only new fixture is the transport signing vector
- [x] No code was changed by this ticket; follow-up fixes are owned by ticket 07 and the crew CLI defect

## Answer

**Delivered 2026-09-05.** Run `23aace30-7d2c-4715-b5f8-77003fcd57e1` carried the known Brief
through the local crew and remote Production service to an accepted preview, with the Run store,
render and four production secrets off the operator's disk. The cloud proof sheet records which
isolation properties were carried forward, replaced or not evidenced. The bundle was reconstructed
from the original transcript, the recovery receipt and artifacts retrieved through the published
surface, then verified on the VM rather than on the Windows machine that assembled it.

The complete local-versus-cloud comparison and invariant evidence live in
[`../run-2026-09-05.md`](../run-2026-09-05.md). No new Run or Take was created to close this ticket,
and the VM is stopped.
