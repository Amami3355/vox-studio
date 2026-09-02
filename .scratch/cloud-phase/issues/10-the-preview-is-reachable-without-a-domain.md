# 10: The preview is reachable without a domain

Status: ready-for-agent
Type: grilling
Blocked by: 02, 05

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
