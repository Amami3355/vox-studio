# 08: A second client joins the first, and neither is nameable from above

Status: ready-for-agent

## Problem Statement

`ProductionClient` (`client.py:80`) is the seam ADR-0015 exists to protect, and it has one
implementation that reaches a real service. `LocalProductionClient` spawns `vox.exe` once per
command, stages payloads into the Run directory on the caller's own disk, and reads artifacts back
off that disk through `_within(root, relative)`.

The interface is already the right shape and has been kept that way on purpose.
`test_the_interface_never_takes_or_returns_a_path` walks every method on the abstract base with
`inspect` and fails on a parameter or return annotation mentioning `Path`. `test_local_client.py`
carries the behavioural suite: a request object becomes a Run, a plan object is validated against a
Run id, a replacement authorisation crosses as an object, an artifact comes back by descriptor, an
artifact whose bytes moved is refused, and a descriptor pointing outside its Run is refused. The
`fake_launcher` docstring even names why the read-back half is tested so carefully — *"the read-back
is the direction the cloud phase turns on."*

So the work here is not design. It is that there is nothing to build the second implementation
against until ticket 05's surface and ticket 06's host exist, and that the behavioural suite is
currently written against one implementation rather than against the interface.

**The failure mode this ticket exists to prevent is a second client that passes its own tests.** Two
implementations with two suites diverge, and they diverge in the direction of whatever the author of
the second one found convenient — which in this case means the read-back half, because streaming
bytes over a network is more annoying than reading a file and the temptation is to make the
descriptor a little more path-like on the way.

## Solution

Promote the behavioural suite to a contract suite, then write the second client against it.

**One suite, three implementations.** The expectations in `test_local_client.py` that are about the
*interface* rather than about `vox.exe` are parameterised over the in-memory client,
`LocalProductionClient` and `HttpProductionClient`. The ones genuinely about the launcher — argv
prefixes, the working directory, verbatim stdout pass-through — stay where they are and stay
local-only.

**`HttpProductionClient` speaks ticket 05's payload surface over ticket 06's host.** A command name,
a Run id, a payload object; an envelope back. It signs the request body with the per-request HMAC
the host verifies, carries the bearer token as the launcher capability it already holds, and holds
no path, no work root and no launcher.

*Corrected 2026-09-02, alongside ticket 06: this sentence previously said the client "presents its
workload identity", which was written against the serverless runtime. The topology is a VM behind an
SSH tunnel, so **the client's base URL is a forwarded local port** and the channel was authenticated
by `sshd` before the client sent anything. The client presents no identity of its own and needs no
credential beyond the token and the HMAC key it already uses locally — which is one fewer thing for
this ticket to build, not one more. See
[ADR-0018](../../../docs/adr/0018-the-isolation-guarantee-outlives-the-named-pipe.md) decision 2.*

**Artifact retrieval comes back through the surface.** A Run id and a descriptor from an envelope,
bytes and a digest out, and the digest is checked on arrival — the same refusal
`test_refuses_an_artifact_whose_bytes_moved` already asserts locally, now over a network where the
bytes had further to travel.

**Nothing above the seam changes.** No crew tool, agent instruction, prompt, fixture or test learns
which client it holds. That prohibition is ADR-0015 decision 1 and this ticket is where it earns its
keep.

## Implementation Decisions

- **`ProductionClient` gains no method and loses none.** If the network implementation wants one,
  the seam is in the wrong place — the same rule decision 10 applies to the command surface.
- **The client is constructed with an address and an identity source, not with a work root.** The
  absence of a work root is the point: `LocalProductionClient.__init__` takes one and
  `HttpProductionClient` must have nowhere to put it, so that a future edit cannot quietly
  reintroduce disk knowledge above the seam.
- **The structural test extends to the new implementation unchanged**, and is the cheapest guard
  the project has against ADR-0015's prohibition eroding. It costs nothing and it fails loudly.
- **The HMAC is computed over the same signing text the host verifies.** `requestSigningText` is
  the definition; the Python side reimplements it and the reimplementation is proved against a
  recorded vector rather than against the host being reachable. Two implementations of one signing
  rule is exactly where a byte-order or a length-prefix disagreement hides.
- **The identity token is fetched from the runtime, not held.** Decision 8's property — neither side
  holds the other's secret — extends to the crew: it presents an identity it was given, and does not
  carry a production credential.
- **Retries are not added in this phase, and the omission is deliberate.** A synchronous render
  blocks for minutes and a client that retries it on a timeout will start a second render of the
  same Run. Retry belongs with asynchronous render, which decision 7 defers to its own spec. The
  client surfaces the timeout as `ProductionUnavailable`, which is the error the interface already
  publishes for it.
- **The error taxonomy is the one `client.py` already defines.** `ProductionUnavailable`,
  `UnknownRun`, `ArtifactMissing`, `ArtifactCorrupted`, `ArtifactOutsideRun`. A network client that
  invents an error class makes callers above the seam able to tell which implementation they hold.

## Testing Decisions

**The contract suite is parameterised and every implementation runs it.** The split between contract
expectations and launcher expectations is the ticket's first piece of work, and it should be done as
a pure move — the suite passes over the split before `HttpProductionClient` exists.

**`HttpProductionClient` is driven against a service the test starts**, in-process, over a loopback
ephemeral port. No cloud, no credential, and the workspace's network sentinel stays in force.

**The structural test covers the new class**, asserting no path-shaped parameter names and no `Path`
annotations.

**The signing rule is proved against a recorded vector**, so the Python and TypeScript sides are
each checked against the definition rather than against each other. A test where both sides are
wrong in the same way is the failure this avoids, and it is not hypothetical — this repository has
already had a measurement agree with itself and be wrong.

**A Run is driven end to end over the new client and its evidence bundle verifies**, with the bytes
arriving through the surface rather than off a local disk. This is the spec's own bar: *"a cloud Run
produces an evidence bundle that verifies without its host."*

**A test that can tell which client it holds is a failing test.** Structural, and the same
discipline the crew already applies to the author seam.

## Out of Scope

- **Deleting `local_client.py`'s staging.** It keeps going through `vox.exe` and argv, which stays
  correct for the local topology. Ticket 05 already records why.
- **Retry, backoff, or circuit breaking.** Deliberately deferred above.
- **Streaming large artifacts.** Ticket 05's scope note applies.
- **Hosting the crew.** Cloud-phase ticket 01.
- **Changing what the crew does with an envelope.** The producer, the converge loop and the evidence
  bundle are unchanged by construction; if they are not, the seam leaked.

## Further Notes

**This ticket can be written against ticket 06's host on a loopback socket and never needs the
cloud.** It is the last piece of the wiring and the first that can be fully proved locally, which
makes it a good candidate to run in parallel with ticket 07's containerisation rather than after it.

**Blocked by:**
`.scratch/cloud-phase/issues/06-a-second-transport-joins-the-first-over-one-surface.md`

- [ ] The behavioural suite is split into contract expectations and launcher expectations, as a pure move that passes first
- [ ] The contract suite runs over the in-memory client, `LocalProductionClient` and `HttpProductionClient`
- [ ] `HttpProductionClient` implements `ProductionClient` with no added or removed method
- [ ] It is constructed with an address and an identity source, and has nowhere to put a work root
- [ ] It signs the request body with the rule the host verifies, proved against a recorded vector on both sides
- [ ] It presents an identity it was given and holds no production credential
- [ ] Artifact retrieval checks the digest on arrival and refuses moved bytes, a missing artifact, and a descriptor outside its Run
- [ ] A timeout surfaces as `ProductionUnavailable` and no command is retried
- [ ] The structural no-`Path` test covers the new implementation
- [ ] A Run driven over the new client produces an evidence bundle that verifies
- [ ] No test, tool, instruction, prompt or fixture can tell which client it holds
