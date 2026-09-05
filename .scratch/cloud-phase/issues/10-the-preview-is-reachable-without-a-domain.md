# 10: The preview is reachable without a domain

Status: done
Type: grilling
Blocked by: 02, 05

**Answered 2026-09-05. The third shape: there is no link, and the operator retrieves the preview's
bytes over the tunnel.** The second shape is dead by construction rather than by argument, the first
costs an ADR-level decision the deadline does not have room for, and the third turns out to be the
one the code was already shaped for. The answer is below the question; nothing above it is edited.

## Question

Two decisions taken on the same day point in slightly different directions, and nothing in the
ticket set reconciles them.

**The preview is a time-limited signed link.** That was chosen over streaming bytes back through a
synchronous render response, because ticket 05's artifact surface is already keyed by descriptor with
a digest, and a render that returns its output inline is the version that fails on the day.

**There is no public ingress and no domain.** The service is reached through an SSH tunnel, which
satisfies ticket 03's closed-ingress requirement by construction rather than by configuration.

A signed link is a URL, and a URL issued by a service with no public name resolves to nothing the
operator's browser can reach unless the tunnel carries it too. The question this ticket resolves is
what the link actually points at, and whether ticket 09's first criterion is still met by the answer.

The three shapes worth weighing:

**The link is relative to the forwarded port.** The service issues a path and an expiry, the operator
opens it through the same tunnel that carried the Brief, and nothing leaves the box. Cheapest, and
the tunnel is already the boundary.

**The link is a signed object-store URL.** The render is uploaded on completion and the link is
publicly resolvable but time-limited and unguessable. The preview then works from any browser without
a tunnel — but it puts a rendered artifact outside the trust boundary, and that is a decision ticket
02's ADR has to be able to justify rather than one this ticket takes alone.

**There is no link and the operator fetches bytes over the tunnel.** Honest, and it makes ticket 09's
"watches a preview" criterion read as a stretch.

## What the answer must settle

- Which shape, and the argument for it stated against the boundary rather than against convenience.
- Whether an artifact leaving the box is inside or outside what ADR-0018 permits. If it is outside,
  the second shape is dead and should not be revisited under deadline pressure.
- What ticket 09 scores. "An operator submits a Brief and watches a preview" must be checkable
  against the answer, and the answer must not quietly redefine *watches*.
- Whether ticket 05's artifact retrieval needs anything it is not already building. Decision: it
  should not. If the answer requires a new capability in 05, say so here rather than discovering it
  while 05 is being written.

## The answer, 2026-09-05

**The shape: there is no link.** The operator asks the service for the preview by the descriptor the
envelope already published, receives its bytes over the same tunnel that carried the Brief, writes
them to their own disk and plays them. No URL is issued, nothing resolves publicly, and no browser
ever speaks to the boundary.

### Stated against the boundary rather than against convenience

The service serves exactly one door. `network-host.ts:15` is `POST /command`, JSON in and JSON out,
and `handle` at `network-host.ts:136` destroys the socket for any other method or path — no status
code, deliberately, because *"a reason is an oracle: a caller could tell a bad MAC from a replay from
an unknown route by reading it."* Every request that survives goes through `boundary.handle`, which
verifies a per-request HMAC over the body.

**A browser cannot sign a body**, so a browser cannot speak to this service at all. That is not an
oversight to be worked around; it is the shape ADR-0018 decision 2 chose when it kept body
authentication and channel authentication as two answers to two questions. The third shape is the
only one of the three that asks the boundary for nothing it was not already built to give.

### An artifact leaving the box is outside what ADR-0018 permits

**The second shape is dead. Do not revisit it under deadline pressure.**

The argument is shorter than the ticket expected and does not turn on where the bytes end up. Ticket
02's ADR, decision 5, names the injected network adapter as the strong lock — `network: { request:
async () => reject('NETWORK_POLICY_DENIED') }` refuses every outbound request the service makes
outside `record`, *"enforced in code, total, and nothing in this ADR weakens it."* Uploading a render
to an object store is such a request. The second shape therefore does not merely place an artifact
outside the trust boundary and ask the ADR to justify it; it needs the one lock the ADR says stays
shut, and the weak lock — the documented-intent egress list — is not the one standing in its way.

### The first shape is not dead, but it is not this phase's

It would need a second route on the boundary: a `GET`, exempt from the body HMAC, authenticated only
by a signature carried in the URL, answering a browser. Each of those is defensible on its own and
together they are a new ADR decision, not a configuration. **Deferred, with the reason recorded so a
later session reopens it knowing the price rather than discovering it.** If a public, domain-less
preview is ever wanted, this is the shape to reopen.

### What ticket 09 scores, and *watches* is not redefined

Ticket 09's criterion is that a preview is *produced, retrieved and watched*, and its testing
decision spells out why: *"a rendered file of the right size and duration that is visually wrong has
passed every automated check this system has. Someone plays it."* The bar is a human watching the
render, not a video element streaming from a hosted origin. Retrieving the bytes and playing them
locally meets it literally.

**The wording that must change is the mechanism, not the bar.** 09's first criterion says the preview
is "retrieved through its signed link". There is no signed link, so that clause is amended to name
this retrieval. The criterion is not weakened: it still requires the bytes to arrive over the network
and still requires someone to watch them.

### Ticket 05 does need something it is not already building — and this is the finding

**The ticket asserted it should not. That assertion was already false when this was written, and
neither 05 nor 06 noticed.**

`ProductionPayloadSurface.fetchArtifact` exists — `payload-surface.ts:157` — and is complete: it
resolves the Run, refuses an escaping locator with `ARTIFACT_OUTSIDE_RUN`, recomputes the digest
rather than echoing the envelope's, and answers absence with `ARTIFACT_MISSING`. **It is not a case
in `route()`'s command switch, and nothing outside its own tests calls it.** The one network route
carries a `PayloadCommandRequest` into `execute()`, so over the second transport artifact retrieval
has **no wire representation at all**. `local_client.py:140` implements `fetch_artifact` by reading
the operator's own disk, which is exactly the assumption ticket 05's problem statement said the cloud
removes.

So the read-back half of the crew's contract is implemented at the surface, absent at the transport,
and local-only at the client. All three shapes needed this; the third makes it the *whole* of the
work rather than a part of it.

**What that obliges, and where it belongs:**

- **A second route on the network host, `POST /artifact`**, HMAC-signed exactly as `/command` is,
  taking a Run id and a descriptor and answering `application/octet-stream`. It belongs to **ticket
  08**, which already owns the client half. It is not a new *capability* — the capability is
  `fetchArtifact` and it exists — it is the wire representation that was skipped.
- **Bytes, not base64 in an envelope.** Base64ing a render into the JSON envelope would put an
  artifact inside a contract category and make the published surface carry megabytes. The contract
  categories do not move for a transport concern; that is the coupling ADR-0015 named.
- **This is a second door and it must be argued as one.** It is a POST under the same HMAC, so it
  does not carry the first shape's exemptions, but ADR-0018 decision 7's one-entry-point rule and
  `network-host.test.ts`'s repository scan should both be read before it is added. Adding a route is
  not adding a host, and the reviewer should confirm that reading rather than assume it.
- **`MAX_IPC_FRAME_BYTES` is 16 MiB and bounds the request only.** `readBody` enforces it;
  `network-host.ts`'s response path writes whatever it is given. A preview larger than a request
  frame is therefore not refused, and **nobody has measured a preview against that number.** Left
  as an open item rather than a guess.

### Ticket 08 is promoted by this answer

It was filed as "not visible in a demo" and the handoff of 2026-09-05 recommended demoting it. **That
was true only while the preview was expected to arrive through a link.** With the third shape chosen,
08's client is the thing that fetches the preview, and no preview is watched without it.
