# 06: A second transport joins the first, over one surface

Status: ready-for-agent

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

**Caller authentication is the platform's answer, and the HMAC stays.** Decision 4: no public
ingress, and only a request bearing an authorised workload identity is accepted. The per-request
HMAC is not replaced by that, because it authenticates the request *body* rather than the channel,
and the Run ledger's integrity story already rests on it. Two questions, two answers, and collapsing
them into one is the mistake this decision exists to prevent.

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
- **The container serves plain HTTP on its assigned port and the platform terminates TLS.** Decision
  3 says "authenticated TLS" and this is how the runtime delivers it — the socket inside the sandbox
  is not the socket the caller reached. Saying so plainly matters, because a reader who greps for a
  TLS context in the container and finds none will conclude the transport is unencrypted. It is not;
  the encryption and the identity check are in front of the container, and ticket 02's ADR is where
  the guarantee is argued.
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

**The workload-identity check is not unit-tested, and the ticket says so.** It is the platform's,
asserted by ticket 03's from-outside verification and ticket 09's proof. A mock of it tests the
mock.

## Out of Scope

- **Deploying the host.** Ticket 07.
- **`HttpProductionClient`.** Ticket 08.
- **A shared replay cache across instances.** Named as a known limit above; its own ticket, and it
  is only needed when this service runs more than one instance.
- **Asynchronous render.** Decision 7.
- **Porting `vox.exe` or the pipe helpers.**
- **Rate limiting, quotas, or request size policy beyond `MAX_IPC_FRAME_BYTES`.**

**Blocked by:** `.scratch/cloud-phase/issues/05-the-service-gains-a-payload-shaped-surface.md`

- [ ] The authenticate-dispatch-sanitise-sign sequence is one function, called by both hosts
- [ ] `createProductionIpcHost`'s existing tests pass unchanged over the extraction, before the second host exists
- [ ] A second host serves ticket 05's payload surface over the network; the pipe host still serves argv
- [ ] The per-request HMAC, replay cache and skew window apply to both hosts, asserted on each refusal separately
- [ ] `internalPath` is widened to strip container-shaped POSIX paths, asserted, and `internalMarkers` and `stackLine` are unchanged
- [ ] The idle timeout admits a synchronous render on both hosts
- [ ] A transport-parity test drives one Run over both hosts and compares envelopes
- [ ] The per-instance replay cache's weakening is written down in the module and in the ADR's evidence list
- [ ] No local HTTP listener is bound outside the cloud entry point
- [ ] No CI test opens a public socket or reaches the network
