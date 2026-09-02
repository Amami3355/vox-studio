# 11: Remotion renders in the image, or the image is wrong

Status: ready-for-agent
Type: prototype
Blocked by: —

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
