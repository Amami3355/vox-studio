# 06: A second transport joins the first, over one surface

Status: done

**Amended 2026-09-02, after ADR-0018 was accepted.** This ticket was written against the serverless
runtime and answered *who may connect* with platform-terminated TLS and an authorised workload
identity. **The topology is a Compute Engine VM behind an SSH tunnel and has neither**, so two of
its implementation decisions and one of its testing decisions were wrong as written. They are
corrected in place below. The spec's own decision 4 carries the same staleness and is annotated
there;
[ADR-0018](../../../docs/adr/0018-the-isolation-guarantee-outlives-the-named-pipe.md) decision 2 is
authoritative for this question.

**The ticket gets smaller, not larger.** The extraction, the shared handler, the parity test and
the sanitiser widening are untouched — they were always transport-independent, which is what made
the rest of this ticket look transport-independent too. What goes away is work this ticket never
had to do: **the network host implements no caller-identity check of its own.** A caller reaching
the loopback port has already passed `sshd`'s key check, and below that the host has the bearer
token and the per-request HMAC it already has. Three mechanisms were named; two exist, and neither
is new.

**Nothing here is encrypted by this ticket, and that is the corrected claim rather than a gap.**
The SSH tunnel is the encrypted channel. There is no TLS anywhere in this topology — not in the
container, not in front of it — so a reader greping for a TLS context and finding none is reading
it correctly this time.

## Problem Statement

`createProductionIpcHost` is a named-pipe server and says so in its second statement:

```ts
if (!/^\\\\\.\\pipe\\[A-Za-z0-9._-]+$/.test(pipePath)) {
  throw new TypeError('Production IPC requires a normalized Windows named-pipe path.');
}
```

Everything below that line, though, is transport-independent and is the part worth keeping. The
`authenticate` closure verifies protocol version, clock skew against `maxClockSkewMs`, a replay
cache keyed by `requestId`, and an HMAC over `requestSigningText`. `handle` sanitises stdout and
stderr through `sanitizeBoundaryText` before either leaves the process, runs the audit hooks around
the call, and signs the response. That is the boundary's actual behaviour, and it is currently
welded to `node:net`'s `createServer` and to a Windows pipe path.

A cloud transport that reimplements it will get one of those details wrong, and the details are not
decorative: the replay cache is what makes a captured request unusable twice, the skew window is
what bounds the capture, and `sanitizeBoundaryText` is what keeps host paths and stack frames out of
an agent-readable response. A second copy is a second place for the boundary to drift.

Decision 3 states the shape: *"same verbs, same JSON bodies, same handler, only the socket
differs."* What the codebase does not yet have is a handler separable from its socket.

## Solution

Lift the request handler out of the socket, then give it a second host.

**One handler, two hosts.** The authenticate-dispatch-sanitise-sign sequence becomes a function over
a request that both hosts call. `createProductionIpcHost` keeps its pipe-path validation, its
`node:net` server and its framing, and loses nothing else. The new host accepts a request over the
network and calls the same function.

**The new host serves ticket 05's payload surface; the pipe host keeps serving argv.** These are two
callers of one command service and both are permanent. The handler that is shared is the boundary
behaviour — authentication, replay, sanitisation, signing — not the dispatch shape.

**Caller authentication is the tunnel's answer, and the HMAC stays.** *Corrected 2026-09-02; the
paragraph this replaces said "the platform's answer" and named a workload identity. Corrected again
from the live firewall read on 2026-09-05.* No public ingress: the VM has no external address, the
host binds loopback, and the only route in is an SSH tunnel gated by a key the operator holds.
`default-allow-internal` admits internal TCP, so the firewall alone is not the service-port
boundary. `sshd` answers *who may connect*. The per-request
HMAC is not replaced by that, because it authenticates the request *body* rather than the channel,
and the Run ledger's integrity story already rests on it. Two questions, two answers, and collapsing
them into one is the mistake this decision exists to prevent — which is why **the network host adds
no third mechanism**: an identity check inside the container would be a second, weaker answer to a
question `sshd` has already answered, and it would be the one a reader trusted.

## Implementation Decisions

- **The shared handler is extracted, not duplicated, and the extraction is behaviour-preserving.**
  The pipe host's tests pass unchanged over the refactor before the second host is written. If they
  need editing, the extraction changed something and the change is the bug.
- **The replay cache is per-host, and that is stated rather than assumed.** `seen` is an in-process
  `Map`. One container is one cache; two instances do not share it, so a request replayed against a
  second instance inside the skew window is accepted. **This is a real weakening relative to the
  local topology and it must be written down rather than discovered.** The mitigation for this phase
  is one instance and a short skew window; a shared cache is a later ticket and the wrong shape to
  invent under a deadline.
- **The container serves plain HTTP on a loopback-bound port, and the SSH tunnel is the encrypted
  channel.** *Corrected 2026-09-02; this decision previously said the platform terminates TLS,
  which was true of the serverless runtime and is not true of a VM.* Decision 3 says "authenticated
  TLS"; **what this topology delivers instead is an SSH tunnel, and the difference is worth naming
  rather than reading TLS into it.** Encryption in transit is `ssh`'s, between the operator's
  machine and the VM. Inside the VM the hop from the tunnel's endpoint to the container's port is
  loopback on a box with no public ingress. There is no TLS context anywhere in this topology, so
  a reader who greps for one and finds nothing is reading it correctly.
  [ADR-0018](../../../docs/adr/0018-the-isolation-guarantee-outlives-the-named-pipe.md) decision 2
  is where the guarantee is argued.
- **The host binds loopback, not `0.0.0.0`, and this is the host's own business rather than the
  firewall's.** The firewall is the outer lock and is ticket 03's; a host bound to every interface
  behind a correct firewall is one misapplied rule away from being reachable, and the rule lives in
  a different system from the code. Bind address is one line and it fails closed.
- **No local HTTP listener is added.** ADR-0015 decision 3 and this spec's decision 3. The new host
  is bound in the cloud entry point (ticket 07) and nowhere else. A developer who wants it locally
  wants it for convenience, and that is exactly the shortcut the crew spec forbids.
- **`sanitize.ts`'s `internalPath` expression does not match a container path, and this is measured
  rather than suspected.** It is
  `/(?:file:\/{2,3})?[A-Za-z]:[\\/][^\s"'<>]*/gi` — it requires a drive letter, so `/workspace/run/…`
  or `/mnt/runs/…` passes through unredacted. **The other two expressions survive the move and must
  not be rewritten alongside it:** `internalMarkers` already spells its separator `[\\/]` and matches
  `node_modules` and `packages/production` on both platforms, and `stackLine` is separator-
  independent. So this is one expression to widen, not a sanitiser to rebuild. Decision 10 predicted
  the class; this is the specific instance. A sanitiser that silently stops sanitising is worse than
  one that was never there, because the proof sheet still scores it.
- **The idle timeout accommodates a synchronous render.** `DEFAULT_IPC_SOCKET_TIMEOUT_MS` was already
  raised to fifteen minutes for a two-minute eight-scene render. The network host and the platform's
  request timeout both have to admit that, and a mismatch shows up as a dropped render rather than as
  a configuration error.
- **The response shape is the one already defined.** `ipcResponseSchema`'s exit code, base64 streams
  and MAC. No new envelope, no new error code.

## Testing Decisions

**The extraction is proved by the tests that already exist**, run unchanged against the pipe host
before the second host is added. This is the whole safety argument for touching `host.ts`.

**The shared handler is tested once, at its own seam.** Replay of a seen `requestId` is refused; a
request outside the skew window is refused; a bad MAC is refused; and each refusal closes without
leaking a reason to the caller, which is what `host.ts` does today by destroying the socket. Three
refusals, asserted separately, because a handler that refuses everything for one reason passes a
test that checks only that it refused.

**Sanitisation is asserted over a container-shaped path**, not only a Windows one. The regression
this catches is the one decision 10 predicts.

**A transport-parity test drives the same Run over both hosts and compares the envelopes.** Byte
equality where the envelope is deterministic, field equality where a Run id or timestamp differs.
This is the test that makes "the crew cannot tell which transport it holds" a fact rather than an
intention, and it is the highest-value test in this ticket.

**Nothing in CI opens a public socket or reaches the network.** The second host is exercised over a
loopback ephemeral port inside the test process; the workspace's network sentinel stays in force.

**The channel's authentication is not unit-tested, and the ticket says so.** *Corrected 2026-09-02;
this previously named a workload-identity check.* It is `sshd`'s and the firewall's, asserted by
ticket 03's from-outside verification and ticket 09's proof. A mock of it tests the mock.

**The bind address is unit-tested, because it is this ticket's own.** The host listens on loopback
and a test asserts the address it was given, which is the one line of the ingress posture that
lives in this repository rather than in a firewall rule.

## Out of Scope

- **Deploying the host.** Ticket 07.
- **`HttpProductionClient`.** Ticket 08.
- **A shared replay cache across instances.** Named as a known limit above; its own ticket, and it
  is only needed when this service runs more than one instance.
- **Asynchronous render.** Decision 7.
- **Porting `vox.exe` or the pipe helpers.**
- **Rate limiting, quotas, or request size policy beyond `MAX_IPC_FRAME_BYTES`.**

**Blocked by:** `.scratch/cloud-phase/issues/05-the-service-gains-a-payload-shaped-surface.md`

- [x] The authenticate-dispatch-sanitise-sign sequence is one function, called by both hosts
- [x] `createProductionIpcHost`'s existing tests pass unchanged over the extraction, before the second host exists
- [x] A second host serves ticket 05's payload surface over the network; the pipe host still serves argv
- [x] The per-request HMAC, replay cache and skew window apply to both hosts, asserted on each refusal separately
- [x] `internalPath` is widened to strip container-shaped POSIX paths, asserted, and `internalMarkers` and `stackLine` are unchanged
- [x] The network host binds loopback, asserted, and implements no caller-identity check of its own
- [x] The idle timeout admits a synchronous render on both hosts
- [x] A transport-parity test drives one Run over both hosts and compares envelopes
- [x] The per-instance replay cache's weakening is written down in the module and in the ADR's evidence list
- [x] No local HTTP listener is bound outside the cloud entry point
- [x] No CI test opens a public socket or reaches the network

## What was built, 2026-09-02

- **`src/ipc/boundary.ts`** is the shared sequence: parse, skew, replay, HMAC, audit hooks,
  sanitise, sign. `host.ts` lost everything but its pipe path, its `node:net` server and its argv
  dispatch, and its three existing tests passed over the extraction before the second host was
  written. The per-instance replay cache's weakening is stated at the seam that carries it and in
  ADR-0018 decision 8.
- **`src/ipc/network-host.ts`** is the second host: `POST /command`, `ipcResponseSchema`'s
  envelope, loopback-only bind that throws on anything else, and the frame ceiling reused as a
  body ceiling. Every refusal destroys the socket — no status code, because a status code is a
  reason and a reason is an oracle.
- **The payload request has its own domain tag**, `VOX-IPC-PAYLOAD-REQUEST-1`. Nothing in the
  ticket asked for it; a shared prefix would have let an argv MAC authenticate a payload request,
  which is one forgeable surface between two transports. The payload is canonicalised before
  signing, because a caller's bytes and this process's bytes are only the same bytes if key order
  is.
- **`internalPath` became three alternatives from one**, and only the third is new: a `file:`
  URI, the original drive-letter path, and an absolute POSIX path of two or more segments. Its
  lookbehind keeps it out of `and/or` and out of a URL's `//`; the two-segment floor keeps a bare
  `/` in prose. `internalMarkers` and `stackLine` are byte-identical.

**One thing outside the ticket was fixed, and it is named rather than buried.** The payload
surface's own `UNKNOWN_COMMAND` path could not run: `failure()` fed the caller's string to
`resultEnvelopeSchema`, which only accepts a published `CommandId`, so an unknown command threw
out of the failure path that exists to avoid throwing. The argv transport could never reach it —
argv commands are matched before they are named — and the network host is the first caller able
to. It now resolves to a `null` command, which is what the argv path answers with.

**Not done here, and not this ticket's:** nothing binds this host. The entry-point allowlist in
`network-host.test.ts` is empty and a test holds it empty; ticket 07 adds the one name that
belongs in it.
