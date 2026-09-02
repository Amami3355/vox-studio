# 11: Remotion renders in the image, or the image is wrong

Status: done
Type: prototype
Blocked by: —

**Answered 2026-09-02.** The render completes in a Linux container and the machine type is
`e2-standard-2` — 2 vCPU, 8 GB, `europe-west1` — measured, not estimated. The full account, the
table of runs and the reproduction commands are in
[`../spike-11/FINDINGS.md`](../spike-11/FINDINGS.md), which reproduces the image in full. In
short:

- **A render completes**, driven by the real `createRemotionRenderAdapter` against the real entry
  point through the whole command sequence, and probed for H.264/AAC. **127 s and 2.51 GB peak on
  eight cores; 178 s and 2.08 GB under a two-vCPU cap.** The constrained run is the one the machine
  type comes from and it is pessimistic — `nproc` still reported 8 inside the cap, so Remotion sized
  its concurrency for a box it did not have and the peak still fell.
- **The image carries everything.** Remotion's Debian dependency list, its own compositor, Chrome
  Headless Shell. Container-Optimized OS stands and the Debian escape hatch is not taken.
- **The image downloaded a 92 MB browser on every start**, because `remotion browser ensure` installs
  relative to the working directory and the service renders from a different one. It passed anyway,
  and under ticket 07's egress restriction it would not have. Finding 1.
- **The denying network adapter does not survive, and this is the ticket's one bad answer.** The
  render fetches four `woff2` files from `fonts.gstatic.com` inside the headless browser, below
  `service-host.ts:59`, so ADR-0007's rule is breached by a `render`. With no network the render
  fails outright rather than degrading quietly. **Ticket 07's egress restriction and this image are
  contradictory as they stand**, and the repair — self-hosting the four faces — is unassigned.
  Finding 2.
- **Out of scope but found on the way:** every accepted still hash in
  `packages/video/tests/render/` differs in the container and passes on Windows. Fourteen failures,
  all of that shape. It belongs to ticket 09's assertion that recorded fixtures are unchanged.
  Finding 3.

## Question

**Remotion has never been run in a container.** The spec describes its memory and CPU envelope as
*"measured rather than guessed"*, and it has not been measured. It drives a headless browser, which
is the single heaviest thing this service does and the one component whose failure mode is not a
tuning problem.

`DELIVERY.md` names this as risk 2 and schedules a day either side of ticket 07 for it. That is the
wrong shape for a risk this size: a day of slack around a ticket on day five does not help if the
answer is *the render does not complete in a container*, because by then every other decision has
been taken against the assumption that it does.

**This ticket is unblocked and should run first.** It needs no Google Cloud project, no VM, and no
provisioning — Docker Desktop is installed on the operator's machine and wired to the Linux engine,
which is the same engine shape the deployed image runs on. The daemon was not running when this was
charted, so step one is starting it, and that also settles the standing unverified claim that nobody
has confirmed the operator can build a container locally.

## What the answer must settle

- **Does a render complete at all**, in a Linux image, driven by `createRemotionRenderAdapter`
  against the real entry point rather than a stub.
- **What it costs.** Peak memory and wall time for a representative render, measured rather than
  estimated, because the VM's machine type is chosen from this number and a re-provision on day four
  is a day this plan does not have.
- **What the image must carry.** Remotion's headless browser has system dependencies. The image
  carrying all of them is what makes Container-Optimized OS viable; a dependency that must come from
  the host is what forces the Debian escape hatch, and that decision is recorded on the map as
  waiting on this answer.
- **Whether the denying network adapter survives.** `service-host.ts:59` installs a network policy
  that rejects every request, and ADR-0007's rule is that only `record` reaches outbound network. A
  headless browser in a container that quietly fetches a font or a font-face over the network would
  breach it, and locally nobody would notice.

## Implementation Decisions

- **Build the real image, not a representative one.** An approximation that renders proves nothing
  about the image ticket 07 ships, and the point of running this on day one is to be wrong early.
- **Measure once, write the number down.** It goes in ticket 07 and on the map, because the machine
  type, the request timeout and the one-instance ceiling are all downstream of it.
- **A render that completes slowly is a pass, not a fail.** The render is synchronous by decision 7
  and the timeout is provisioned to accommodate it. What fails this ticket is a render that does not
  complete, or one whose peak memory has no affordable machine type.
