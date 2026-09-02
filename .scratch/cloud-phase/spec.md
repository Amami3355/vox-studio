# The cloud phase: production as a service the crew reaches over a network

**Status:** ready-for-agent
**Depends on:** ADR-0007, ADR-0015, `.scratch/agent-crew/spec.md`

## Problem Statement

The Agent production interface works, and it works on exactly one machine. A Run is a directory
inside a work root on a Windows disk; the crew reaches production by spawning `vox.exe`, an
allowlisted C# launcher that forwards argv over a named pipe to a trusted service on the same
host; the Run's artifacts come back as run-relative paths the crew reads off its own disk. Every
one of those facts is deliberate and every one of them is local.

An operator who wants to produce a video today needs a Windows machine, a checkout, a built
launcher, a running service holding live credentials, and physical access to the disk the Run
lands on. That is a proof, not a product. Nobody can be given a Brief and a URL.

The instinct is to call this a transport problem and swap the named pipe for HTTPS. ADR-0015
recorded why that reading is wrong before anyone acted on it: three independent migrations hide
inside "make it HTTP", and transport is the cheap one. The command surface takes filesystem
paths in every direction, and the run store is built on `link`, `rename`, `realpath` and lock
files that no object store provides. A service reachable over HTTPS that still requires
`--plan plan.json` has not moved anywhere; it is the same shared-filesystem coupling with a
weaker isolation story in front of it.

The crew has already paid its half of the middle migration. `ProductionClient` is payload-shaped
in both directions and one module knows that paths exist. The service has not paid its half, and
until it does, the second implementation ADR-0015 was written to enable cannot be built — there
is nothing on the other side of the network for it to talk to.

There is also a decision this repo has not yet faced. ADR-0007 says production speaks
"authenticated OS-local IPC, never TCP or HTTP", and the isolation evidence the proof sheet
scores rests on the named pipe, the HMAC and the restricted Windows account. In a cloud topology
none of those three exist. The boundary has to be re-earned by different means, and saying so
out loud is part of this work rather than a detail of it.

## Solution

Production becomes a service the crew reaches over an authenticated network boundary, without
changing what the crew says to it, what production says back, or where a Run's bytes live
relative to each other.

Three things change and one conspicuously does not.

**The service gains a payload-shaped surface.** A new façade above the existing
`ProductionCommandService` accepts a command, a Run id and a payload object, writes that payload
into the Run itself, and calls the path-shaped method that already exists. This is precisely
what the crew's local client does today, moved to the other side of the boundary — which is why
adopting it locally is a deletion rather than a rewrite. Artifacts stop being something the
caller reads off a shared disk and become something the surface hands back on request, keyed by
the descriptor the envelope already published.

**A second transport joins the first.** The same request surface is served over the named pipe
locally, unchanged, and over an authenticated network channel in the cloud. ADR-0015 named this
shape in advance: same verbs, same JSON bodies, same handler, only the socket differs. *(Amended
2026-09-02: this read "over authenticated TLS", written against a serverless runtime that would
have terminated it. The chosen topology is a VM behind an SSH tunnel and there is no TLS in it —
see decision 4 below and ADR-0018 decision 2.)*

**A second client joins the first.** The crew gains `HttpProductionClient` beside
`LocalProductionClient`, held to the same interface and the same contract tests. No crew tool,
agent instruction, prompt or test learns which one it is holding — that prohibition is ADR-0015's
decision 1 and this spec is where it earns its keep.

**The run store does not change.** `RunStore` keeps `link`, `rename`, `realpath` and its lock
files, and the cloud topology supplies a POSIX-semantics volume that honours them. This is
ADR-0015 decision 4 and it is the decision that makes the local design correct rather than
provisional. The consequence is a narrowed volume choice — a mounted network filesystem, not a
bucket behind FUSE — and one thing that must be proved rather than assumed.

The result an operator sees: a Brief goes in somewhere that is not their laptop, and a preview
comes out. The result a developer sees: the crew's tool layer, its instructions and its tests are
the ones already written.

## Prerequisites — what must be settled before the first ticket

1. **ADR-0007 must be amended, or a new ADR must supersede its transport clause.** As written it
   forbids TCP and HTTP for this boundary absolutely. The cloud topology cannot honour that
   sentence and must honour the guarantee behind it. The amendment states what replaces OS-local
   IPC as the isolation mechanism and what evidence is offered in place of the restricted-account
   probes. Nothing in this spec may be built before that decision exists, because everything in
   it is downstream of the answer.

2. **A Google Cloud project, with billing, and a decision about who owns it.** The production
   service holds live ElevenLabs credentials and signs Run ledgers; its project is a trust
   boundary, not a convenience.

3. **The POSIX-semantics volume must be chosen and proved**, per ADR-0015's standing note: that
   the chosen network filesystem, as mounted by the chosen runtime, actually delivers `link()`
   and atomic `rename()` from the service process. "The protocol specifies it" and "this managed
   mount delivers it" are different claims and only the second matters.

## User Stories

### The operator

1. As an operator, I want to hand the crew a Brief without provisioning a Windows machine, so that
   producing a video is not gated on one host I have to keep alive.
2. As an operator, I want the production service to hold the ElevenLabs credential in a managed
   secret store rather than in my shell environment, so that a credential is rotated in one place
   and never lands in a process I started by hand.
3. As an operator, I want the production service to have no public ingress, so that the only
   thing that can reach it is the identity I authorised.
4. As an operator, I want a Run's ledger and its media to survive the service instance that
   created them, so that an interrupted Run is resumable rather than lost.
5. As an operator, I want to see which Runs consumed synthesis quota and when, so that a
   surprising bill has an audit trail behind it.
6. As an operator, I want to point the crew at either the local service or the cloud service with
   a configuration change, so that I can reproduce a cloud failure locally without editing code.
7. As an operator, I want the cloud service to refuse a request whose identity I did not
   authorise, so that reachability is not the same as permission.
8. As an operator, I want to know the cost of a Run before I authorise the next one, so that
   quota discipline survives the move off my own machine.

### The crew

9. As the crew, I want one production client interface with a local and an HTTP implementation, so
   that the tool layer is written once and the cloud phase touches no agent and no instruction.
10. As the crew, I want to submit a plan as an object and receive an envelope, so that I never
    learn that a plan becomes a file.
11. As the crew, I want to name a Run by its id in every call, so that nothing above the client
    depends on where the Run's directory is or whether it is reachable at all.
12. As the crew, I want to fetch an artifact by handing back the descriptor the envelope
    published, so that read-back works identically whether the bytes are on my disk or across a
    network.
13. As the crew, I want a fetched artifact's bytes checked against the digest its descriptor
    published, so that a corrupted transfer is an error rather than a bad video.
14. As the crew, I want refusals to arrive as envelopes carrying `means`, `repair` and `next`
    exactly as they do locally, so that the repair loop is not rewritten for a second transport.
15. As the crew, I want a transport failure to be distinguishable from a production refusal, so
    that a retry is attempted where retrying is correct and never where it would double-spend
    quota.
16. As the crew, I want the same teaching surface over either transport, so that the instructions
    a model is given do not depend on where production runs.
17. As the crew, I want a long render to complete rather than time out, so that the command that
    takes minutes is not the command that cannot be run remotely.

### The agent

18. As the authoring agent, I want the contracts to be identical in the cloud, so that nothing I
    was taught becomes untrue when the deployment changes.
19. As the authoring agent, I want to remain unable to name a path, so that the boundary I was
    written against does not quietly widen.
20. As the authoring agent, I want production's refusals to keep naming defects in the published
    vocabulary, so that convergence works the same everywhere.

### The reviewer and the auditor

21. As a reviewer, I want the cloud boundary's isolation claims to be evidenced rather than
    asserted, so that "code-blind" means something after the named pipe is gone.
22. As a reviewer, I want the assertions that cannot be evidenced in a cloud topology to be
    reported as not evidenced, so that a passing sheet is not a misleading one — the same
    discipline the crew runs already adopted.
23. As an auditor, I want every command that reached the service recorded with its inputs and its
    effect on the Run, so that the ledger is as complete remotely as it is locally.
24. As an auditor, I want a Run's evidence bundle to verify after the fact without the machine
    that produced it, so that evidence outlives its host.
25. As a reviewer, I want the sanitiser to keep host paths and stack frames out of published
    envelopes in the cloud, so that a container's filesystem does not leak where a Windows one
    did not.

### The developer

26. As a developer, I want the payload surface tested once and shared by both transports, so that
    a behavioural difference between local and cloud is a test failure rather than a discovery.
27. As a developer, I want `ProductionCommandService` and `RunStore` untouched by this migration,
    so that the compiler, the ledger and the checkpoint logic are not risked by a deployment
    change.
28. As a developer, I want the local client to shed its file staging once the service accepts
    payloads, so that the duplicate knowledge of where a plan lives stops existing.
29. As a developer, I want the volume's POSIX guarantees proved by a test I can run against a real
    mount, so that the hardest assumption in the design is the one with evidence under it.
30. As a developer, I want to run the cloud service locally in a container, so that a cloud
    failure is reproducible without a deploy.
31. As a developer, I want the render path's resource requirements stated, so that a render that
    fails for memory is a provisioning bug with a known fix rather than a mystery.
32. As a developer, I want the Windows launcher and its pipe helpers to stay local-only, so that
    no effort is spent porting a component the cloud topology does not use.

## Implementation Decisions

### 1. The seam is one payload-shaped request surface, above the command service

A new module sits above `ProductionCommandService` and below every transport. It accepts a
command name, a Run id where the command names one, and a payload object where the command takes
one; it materialises payloads into the Run and delegates to the existing path-shaped method.

This is the highest seam that both transports and both clients can share, and it is the only new
one this spec introduces. Everything else reuses a seam that already exists.

The alternative — making `ProductionCommandService` itself payload-shaped — is rejected. Its
methods are the ones `dispatch`, the proof harness and every existing test call, and changing
their shape puts a deployment migration inside the compiler's blast radius for no gain: the
service has a filesystem in both topologies, so writing the payload down is the correct
implementation on both sides of the move.

The surface owns what `local_client.py` owns today: that a plan becomes `plan.json` inside the
Run, that a decline decision becomes `decision.json`, that a replacement authorisation becomes
its own file, and that a request has nowhere durable to live until the Run exists. Moving that
knowledge across the boundary is what makes the local client's staging deletable.

### 2. Artifact retrieval is part of the surface, not a side channel

The surface exposes retrieval taking a Run id and an artifact descriptor from an envelope, and
returns the bytes and the digest. Locally it resolves against the Run directory; remotely it
streams. The descriptor is the only key — no caller composes a path, and the surface refuses a
descriptor that resolves outside the Run it belongs to, exactly as the local client does now.

The read-back direction is the harder half of the payload migration and is included here
deliberately, for the reason ADR-0015 gives: in the cloud the crew's disk is not the Run's disk,
and a producer that had opened the file itself is the module that strands the crew at deployment.

### 3. The transports are two hosts over one surface

`createProductionIpcHost` keeps the named pipe and gains a sibling that serves the same surface
over TLS. The request and response bodies are the ones already defined: the IPC schemas are a
JSON POST with an HMAC in all but name, and the frame codec is length-prefixed JSON. What differs
is the socket, the authentication of the caller, and nothing else.

The named pipe remains the local transport. No local HTTP listener is added; ADR-0015 decision 3
rejected it as exactly the local-only shortcut the crew spec forbids, and this spec does not
reopen it.

### 4. Caller authentication replaces the restricted account

Locally, "who is calling" is answered by the pipe ACL, the restricted OS principal and the shared
HMAC. Remotely it is answered by the channel: the production service runs with no public ingress,
binds loopback on its VM behind a firewall that admits nothing, and is reached only through an SSH
tunnel gated by a key the operator holds. The per-request HMAC stays, because it authenticates the
request body rather than the channel and is what the Run ledger's integrity story already rests on.

**Amended 2026-09-02.** The paragraph above read: *"Remotely it is answered by the platform: the
production service runs with no public ingress and accepts only requests bearing an authorised
service identity."* That was written against a serverless runtime with an identity layer in front
of it. The topology chosen on 2026-09-02 is a Compute Engine VM and has no such layer, so the
property is delivered by `sshd` and the firewall instead. **The property is unchanged; only its
mechanism moved.** Tickets 06 and 08 were corrected the same day. This has one consequence worth
stating: the network host and the HTTP client implement **no caller-identity check of their own**,
because the channel was authenticated before either of them saw a byte.

The isolation guarantee this replaces is ADR-0007's, and
[ADR-0018](../../docs/adr/0018-the-isolation-guarantee-outlives-the-named-pipe.md) — accepted
2026-09-02, satisfying prerequisite 1 — is where it is argued rather than here.

### 5. The crew stays local first, and moves second

The first cloud milestone is the local crew driving the cloud production service. That isolates
the client migration — the thing this spec exists to enable — from the separate question of where
an ADK crew is hosted and how it obtains a model credential.

Hosting the crew in the cloud is a later milestone in this spec's scope but not its first, and
nothing in the client design depends on the answer.

### 6. The run store keeps POSIX semantics, and the volume must prove it

Per ADR-0015 decision 4, the service is given a mounted network filesystem. Object storage may
hold exported artifacts; it may not back the run store. A bucket behind FUSE is ruled out
explicitly — no hardlinks, a non-atomic rename implemented as copy-then-delete, unreliable
`O_EXCL` — and that exclusion is the point of the decision rather than an incidental consequence.

The mount's guarantees are proved by a conformance check run against the real mount, covering
`link()`, atomic `rename()` over an existing target, `realpath()` through the mount, and
exclusive create. It is an operator-run verification rather than a CI test, because it asserts a
property of a provisioned resource.

### 7. Render stays synchronous in the first cloud phase

`run render` blocks for minutes; the local IPC host already raises its idle timeout to fifteen
for a two-minute, eight-scene render. The first cloud phase keeps the command synchronous and
provisions a request timeout that accommodates it.

Making render asynchronous — dispatch, poll through `run status`, collect — is the better
long-term shape, and it changes the command surface the contract publishes, the `next` actions
envelopes carry and the sequence the producer drives. That is a larger change than a deployment
migration should smuggle in. It is named here as the known limit and left to its own spec.

The render path's resource envelope is stated as part of provisioning: Remotion needs a headless
browser, and the memory and CPU a showcase render requires are measured rather than guessed.

### 8. Secrets move to a managed store

`ELEVENLABS_API_KEY`, `VOX_RUN_HMAC_KEY`, `VOX_GRANT_KEY` and `VOX_RUN_KEY_ID` are supplied to
the service from a managed secret store, not from a shell environment. The crew's model
credential is supplied to the crew's identity by the same means and never to production. Neither
side holds the other's secret, which is the property the local topology already has and which is
easy to lose in a single-project cloud setup.

### 9. The Windows distribution stays local

`vox.exe`, `vox-pipe-acl.exe` and `vox-pipe-bridge.exe` are C# binaries built with `csc` for
Windows x64. They are the local transport and are not ported. The trusted service itself is Node
and is containerised for the cloud, where the launcher's job — authenticate, forward, return the
envelope — belongs to the HTTP client instead.

### 10. Envelopes, contracts and sanitisation are unchanged

No command is added, removed or renamed. No envelope field changes. The contract categories and
their bodies are the same in both topologies, which is what lets the crew's instructions and the
recorded fixtures stay valid. The boundary sanitiser continues to strip host paths and stack
frames, and its marker list is reviewed for container-shaped paths, which are POSIX and will not
match the Windows drive-letter pattern the current expression is built around.

## Testing Decisions

A good test here asserts what the boundary publishes, never how it is implemented. The whole
point of the design is that the crew cannot tell which implementation it holds; a test that knows
is a test that would pass while the property it exists to protect is broken.

**The payload surface is the module under test, and it is tested once.** Both transports and both
clients delegate to it, so its contract tests are the shared bar. Prior art is the crew's own
`ProductionClient` contract tests, where `InMemoryClient` and `LocalProductionClient` are held to
the same expectations, and `packages/production/tests/crew-fixtures.test.ts`, which holds every
recorded envelope to the schema the service could actually emit.

**Both clients are held to one Python contract suite.** `HttpProductionClient` joins
`LocalProductionClient` and the in-memory implementation in the tests that already exist, driven
against a service the test starts. The structural tests that assert no path-shaped parameter
names and no `Path` annotations extend to the new implementation unchanged — they are the cheapest
guard against ADR-0015's prohibition eroding.

**A transport-parity test drives the same Run over both hosts and compares the envelopes.** Byte
equality is the assertion where the envelope is deterministic, and field equality where a Run id
or a timestamp differs. This is the test that makes "the crew cannot tell" a fact rather than an
intention.

**The volume conformance check is operator-run and reports, rather than a CI test.** It asserts
`link()`, atomic `rename()` over an existing target, `realpath()` and exclusive create against the
real mount, and its output is evidence attached to the deployment rather than a green tick in a
pipeline that never touched the mount.

**The proof harness stays local and is not ported.** It is built on named pipes, `icacls`,
restricted accounts and a C# bridge. It remains the authority for the local topology. Cloud
isolation is evidenced by different means, and the assertions the cloud cannot evidence are
reported as not evidenced, following the discipline ADR review decision 1 established for
un-sandboxed crew runs.

**A cloud Run produces an evidence bundle that verifies without its host.** The existing bundle
verification is the bar; what changes is that the bytes it reads come back through the surface
rather than off a local disk.

## Out of Scope

- **Replacing `RunStore` with a storage abstraction, or backing it with object storage.**
  ADR-0015 rejected both, and its reasoning stands: the abstraction would have to re-earn atomic
  rename and content-addressed hardlink reuse over a store that offers neither.
- **A local HTTP listener.** ADR-0015 decision 3.
- **Porting `vox.exe` or the pipe helpers to Linux.**
- **Porting the Windows proof harness**, including the crew driver that ticket 12 of the crew spec
  builds. That work is local-proof work and is not a step toward this spec.
- **Asynchronous render.** Named as a known limit in decision 7; its own spec.
- **Multi-tenancy, end-user authentication, and any studio or editor surface.** The caller here is
  the crew and the operator, not a public user.
- **Autoscaling, cost optimisation and multi-region.** One region, one service, correctness first.
- **Changing the Agent production interface's commands, envelopes or contracts.** If this
  migration wants one, that is a signal the seam is in the wrong place.

## Further Notes

**The crew spec's tickets are not cloud work, and should not be re-scoped as though they were.**
Tickets 08 through 16 are the local crew: the repair loop, quota discipline, the evidence bundle,
the harness driver, the budget, one real run. They make the crew *correct*. This spec makes it
*deployable*. They are independent, and the only ordering argument between them is that decision 1
here — the payload surface — is cheaper to build while the crew's half of the same migration is
still fresh in someone's head.

**The hardest thing in this spec is not the transport.** It is the run store's volume, and
ADR-0015 already wrote the warning: the decision rests on a claim about a managed mount that
nobody has tested. If the chosen filesystem does not deliver `link()` and atomic `rename()` as
mounted, the whole shape changes and ADR-0015 decision 4 is what gets reopened. Proving it early
is worth more than any amount of client code written on the assumption.

**ADR-0007 is not an obstacle to route around.** Its sentence about TCP and HTTP is a conclusion,
and the threat model behind it — a localhost listener is reachable by every process on the machine
— is not the threat model of a Cloud Run service with no public ingress. The amendment should say
that plainly and state what evidence replaces the restricted-account probes, rather than treating
the old text as an inconvenience.
