# 08: A second client joins the first, and neither is nameable from above

Status: done

**Promoted 2026-09-05 by [10](10-the-preview-is-reachable-without-a-domain.md), and it gained the
transport's missing half.** This ticket was about to be demoted as invisible in a demo. With the
preview chosen to arrive as bytes over the tunnel rather than as a link, **this client is the thing
that fetches the preview** and ticket 09 scores nothing without it.

What it gained: `ProductionPayloadSurface.fetchArtifact` (`payload-surface.ts:157`) is complete and
**is not routed anywhere**. It is not a case in `route()`'s command switch, and `network-host.ts`
serves exactly one path, `POST /command`, carrying a `PayloadCommandRequest` into `execute()`. So
`HttpProductionClient.fetch_artifact` has **nothing on the other side to call**, and this ticket owns
building it: a second signed route, `POST /artifact`, HMAC-verified exactly as `/command` is, taking
a Run id and a descriptor and answering `application/octet-stream`.

**Not base64 in an envelope** — that would put a render inside a contract category for a transport's
convenience. **Read ADR-0018 decision 7 and `network-host.test.ts`'s repository scan before adding
it**: adding a route is not adding a host, but confirm that reading rather than assume it. And
`MAX_IPC_FRAME_BYTES` (16 MiB) bounds the *request* only — `readBody` enforces it, the response path
does not, and **no preview has been measured against that number.**

The paragraph below that predicted this is still the best thing in the ticket: *"the read-back half,
because streaming bytes over a network is more annoying than reading a file."* The annoyance turned
out to be that nobody built it at all.

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

- [x] The behavioural suite is split into contract expectations and launcher expectations, as a pure move that passes first
- [x] The contract suite runs over the in-memory client, `LocalProductionClient` and `HttpProductionClient`
- [x] `HttpProductionClient` implements `ProductionClient` with no added or removed method
- [x] It is constructed with an address and an identity source, and has nowhere to put a work root
- [x] It signs the request body with the rule the host verifies, proved against a recorded vector on both sides
- [x] It presents an identity it was given and holds no production credential
- [x] Artifact retrieval checks the digest on arrival and refuses moved bytes, a missing artifact, and a descriptor outside its Run
- [x] A timeout surfaces as `ProductionUnavailable` and no command is retried
- [x] The structural no-`Path` test covers the new implementation
- [x] A Run driven over the new client produces an evidence bundle that verifies
- [x] No test, tool, instruction, prompt or fixture can tell which client it holds

## What the criteria do not capture

**Done 2026-09-05.** The suite is 401 crew tests and 1044 vitest tests, both green, with one
known flake — `render-command.test.ts`'s receipt-reuse case timed out under the full run and
passed alone, which is the shape this repository already records as a flake rather than a
failure.

Six things the ticks above do not say.

- **The transport was missing its read-back half and nobody had noticed.**
  `ProductionPayloadSurface.fetchArtifact` was complete and routed nowhere: not a case in
  `route()`'s switch, and `network-host.ts` served exactly one path. So this ticket built the
  route as well as the client — `POST /artifact`, signed as `/command` is, answering
  `application/octet-stream`. That is why ticket 10's "05 should not need a new capability" was
  already false when it was written.
- **The response carries no MAC on the artifact route, and that is a decision.** Those bytes are
  authenticated by the descriptor's digest, which the caller holds because a MAC'd envelope
  published it and which the client recomputes on arrival. `test_it_checks_the_digest_itself_
  rather_than_trusting_the_answer` drives a service that lies about the bytes, which is what
  makes that argument checkable rather than merely stated.
- **A surface refusal is told from bytes by content type, not by status code.** The host answers
  200 or it answers nothing: a status code is a reason, and the boundary publishes no reasons.
  `ARTIFACT_MISSING` and its siblings arrive as a JSON body, exactly as the command route puts
  them in an envelope.
- **One authenticator now serves both routes, so they share one replay cache.** Two caches would
  let a request id captured on one route be spent again on the other. `createBoundaryAuthenticator`
  is the extraction; `boundary.ts`'s replay note is corrected from "per-boundary" to
  "per-authenticator", and the process-scoped weakness it describes is unchanged.
- **The network sentinel gained exactly one hole and kept its own tests.** `admit_endpoint`
  opens a single address a test is serving on and closes it again; `127.0.0.1:9` is refused as
  before, so `test_a_socket_of_its_own_cannot_connect_either` did not have to be retired.
  Admitting loopback wholesale was the tempting move and is the reasoning the sentinel exists to
  refuse — the service is *on* loopback in this topology.
- **The stub service proves the HTTP and nothing about the signing.** It verifies with the same
  `vox_crew.wire` the client signs with, so two copies of one mistake would agree perfectly. The
  rule is held by `services/agents/tests/fixtures/ipc-signing-vectors.json`, recorded from the
  TypeScript definition by `pnpm --filter @vox/production record:signing-vectors` and asserted
  by both languages against the recording. Its non-ASCII case caught nothing this time, which is
  the point of writing it before it is needed.

**What this ticket did not do:** run any of it against the real host. The Python suite cannot
start the TypeScript service — the two halves are separate projects on purpose — so the client's
half is proved here and the host's half by `network-host.test.ts`. **The two have never spoken to
each other**, and the first time they do will be ticket 09's Run.

## What the review found, 2026-09-05

`mattpocock-skills:code-review` over `f87c1b6..c5a3922`, both axes. Twelve findings; the list and
what was done about each is in the commit that follows this edit. Three are worth keeping here
because they change what a later ticket can assume.

- **The client this ticket shipped had no caller, which is the same shape one paragraph above.**
  `cli.py` constructed `LocalProductionClient` unconditionally, `parse_arguments` had no address
  flag, and `__init__.py` exported only the local client — so `HttpProductionClient` was reachable
  by test injection and by nothing that ships. **Ticket 09's Run could not have been driven from
  the command line at all.** The fix is `--service-address`, which takes no key: the key stays in
  `VOX_NETWORK_TOKEN`, read per request, because a key in argv is a key in the process table. A
  launcher named alongside an address is refused rather than resolved by precedence, since
  resolving it would spawn a launcher and land the Run on the operator's disk — the one property
  this phase exists to move off it.

  The shape to carry: **a method that is implemented, tested and never routed reads as done from
  every angle except the one that matters — and so does a class that is implemented, tested and
  never constructed.** This ticket found the first and shipped the second in the same commit.
- **The two canonicalisers disagreed about numbers and about member order.** `json.dumps(54.0)` is
  `54.0` where `JSON.stringify` gives `54`, and Python's `sorted()` orders keys by code point
  where JCS orders them by UTF-16 code unit. Either would have arrived as a socket closing with no
  reason attached, on a plan carrying a calibration point or a Brief carrying an emoji. **The
  recorded vector — the whole argument for why two hand-written implementations cannot agree about
  a mistake — had no float case and no supplementary character.** A fifth vector now carries both,
  and the existing four are byte-identical, so this is an addition and not a protocol change.
- **The artifact route runs no audit hook.** Ticket 06 calls `boundary.ts` the shared sequence
  through to audit and sanitise; `serveArtifact` takes parse, skew, replay and HMAC and then
  answers for itself. `ProductionNetworkHostAudit` is typed to a `PayloadIpcRequest`, so a
  retrieval is unauditable by construction. **Not fixed, deliberately:** nothing passes an audit
  to this host — `cloud-host.ts` constructs it without one — so widening the type now would build
  a mechanism with no caller, which is the failure this whole section is about. **It is owed
  before anything starts auditing**, and a session that wires up an auditor and does not notice
  this will get a silent hole rather than a compile error.
