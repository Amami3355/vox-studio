# Delivery plan — a Brief at a URL by 9 September 2026

**Written:** 2026-08-30. **Target:** ticket 09's criteria, all of them. **Definition of delivered:**
an operator submits a Brief to a hosted crew and watches a preview, with no local checkout, launcher
or operator disk in the path.

This file exists so the ordering is read rather than re-derived. It decides nothing the tickets do
not; it says what runs when, and what is deliberately not running.

---

## What is frozen, and why it is written down

**The whole context-and-token-economy cluster is frozen for this phase.** Crew tickets 24, 27, 28
and 30, plus the deferred `TeachingSurface` refactor. Tickets 23, 25 and 26 already landed and
nothing needs undoing.

They are frozen because none of them is on the path to a hosted deployment and all of them are
expensive. Ticket 24 in particular is an experiment whose stated deliverable is a measurement —
*"the measurement is the deliverable and the tools are the instrument"* — feeding ADR-0017's
argument about whether the catalog should eventually leave the prefix. That is a real question and
it is not a September question.

Also frozen for the duration: crew 11, 13, 21, 29, 31, the image-context-scene board, and
production-interface 22–25.

**The freeze is a scheduling decision, not a judgement.** Nothing above is cancelled. A session that
finds itself in one of these tickets has drifted off the path and should stop.

---

## The critical path

Nine tickets, three tracks, one integration.

```
  human  ── 03 project ──┬── 04 volume ──────────────┐
                         │                           │
service ── 02 ADR ── 05 surface ── 06 transport ── 07 container ──┐
                                        │                          │
   crew ── crew-20 async ── cloud-01 hostable                      ├── 09 proof
                                        └── 08 http client ────────┘
```

**02 blocks everything and is cheap.** The spec's prerequisite 1 is not ceremonial: 06 cannot pick
an authentication mechanism, 07 cannot argue its ingress posture and 09 has nothing to score against
until the ADR states what replaces OS-local IPC. Draft it on day one, in parallel with 03.

**03 is the only human blocker.** Console work, and it gates 04, 07 and 09. Start it immediately; it
does not wait on 02.

**05 is the longest pole and needs nothing from the cloud.** Pure TypeScript, testable in-process.
It should be running while 03 and 04 are happening.

**crew-20 is an independent track.** It blocks cloud-01 and nothing else, and it needs no
credential.

---

## Suggested schedule

Two days of slack are built in on purpose. First integrations do not go well.

| Day | Date | Service track | Crew track | Human track |
|---|---|---|---|---|
| 1 | Aug 30 | 02 ADR | — | 03 project |
| 2 | Aug 31 | 05 surface | — | 04 volume |
| 3 | Sep 1 | 05 lands | crew-20 | — |
| 4 | Sep 2 | 06 transport | cloud-01 | — |
| 5 | Sep 3 | 06 lands | 08 client | — |
| 6 | Sep 4 | 07 container | 08 lands | — |
| 7 | Sep 5 | 07 lands | cloud-01 lands | — |
| 8 | Sep 6 | first end-to-end attempt | | |
| 9 | Sep 7 | 09 proof run | | |
| 10–11 | Sep 8–9 | slack | | |

---

## The two risks that can invalidate this plan

Both are cheap to test and both should be answered in the first two days rather than the last two.

**1. The volume may not deliver POSIX semantics.** `RunStore` calls `link()` once, `rename()` twice,
`realpath()` four times and exclusive-create four times. A bucket behind FUSE provides none of them
properly and is ruled out; the chosen network filesystem has to be *proved*, as mounted, from a
container. ADR-0015 already wrote the warning and nobody has run the check. **This is ticket 04 and
it should run the moment ticket 03 provides a project.** If it fails, the shape of the phase changes
and ADR-0015 decision 4 reopens.

**2. The render may not survive the container.** Remotion drives a headless browser and its memory
and CPU envelope is described by the spec as *"measured rather than guessed"* — which it has not
been. **This is inside ticket 07**, and it is the reason 07 is scheduled with a day either side. A
render that does not complete in a container is not a tuning problem.

---

## Standing constraints that survive this phase

These are not negotiable for the deadline. Each is load-bearing for a claim this project makes.

- **Two identities, not one.** The crew never holds a production secret and production never holds
  the crew's. Ticket 03; decision 8. One service account is the shortcut that quietly makes the
  audit story false.
- **Nothing above the client seam learns which implementation it holds.** ADR-0015 decision 1. The
  structural no-`Path` test and the parity tests are the guards; they are cheap and they stay.
- **The denying network adapter stays, and matters more in a container than it did locally**, because
  it is the only thing enforcing ADR-0007's rule that only `record` reaches outbound network.
- **The prefix, the instructions and the recorded fixtures do not move.** If any of them does, a
  deployment change reached above the seam. Ticket 09 asserts this across the whole phase.
- **`RunStore` is not weakened to accommodate a mount.** Ticket 04 has no authority to relax it and
  says so, because the deadline pressure to do exactly that is foreseeable.
- **The proof sheet is re-scored, and what the cloud cannot evidence is reported as not evidenced.**
  Not omitted. Ticket 09.

---

## Known limits this phase ships with, deliberately

Each is named in a ticket rather than discovered later.

- **One service instance.** The replay cache is per-process and the run store's locks are advisory.
  A second instance silently weakens ticket 06's replay guarantee.
- **Synchronous render.** Decision 7. The request timeout is provisioned to accommodate it.
- **No retry in the client.** A retried render starts a second render. Retry belongs with
  asynchronous render.
- **One project, two identities — rather than two projects.** Recorded in ticket 03 as a trade to
  revisit before this system serves a caller who is not the operator.
- **The local proof harness is not ported** and remains the authority for the local topology.
