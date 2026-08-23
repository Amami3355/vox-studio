# ADR-0015 — The deployment seam is the crew's client, not the transport

**Status:** accepted · 2026-08-23
**Scope:** where the local-to-cloud seam is placed for the ADK agent crew, and what the crew
may depend on as a result. This decides the shape of the crew's production client and the
storage model the cloud topology must preserve. It changes no production command, no envelope,
no schema and no existing test, and it does not schedule the cloud phase.

## Context

The crew spec (`.scratch/agent-crew/spec.md`) builds locally against `vox.exe` subprocesses and
defers the cloud phase. The obvious reading of that deferral is that the cloud move is a
transport swap — OS-local IPC today, HTTPS to Cloud Run later — and that building the crew
against HTTP from the start would buy the migration cheaply. That reading is wrong in a way
worth recording, because it is the reading a reasonable person arrives at first, and acting on
it would spend the expensive effort on the cheap problem.

Three migrations hide inside "make it HTTP", and they are independent.

**The transport is already an HTTP request wearing a different hat.** `ipcRequestSchema` is
`{protocolVersion, requestId, timestampMs, cwd, argv, mac}` and `ipcResponseSchema` is
`{protocolVersion, requestId, exitCode, stdoutBase64, stderrBase64, mac}`
(`packages/production/src/ipc/authentication.ts`). That is a JSON POST with an HMAC header. The
frame codec in `ipc/framing.ts` is length-prefixed JSON and nothing more. Swapping it costs one
adapter.

**The command surface is not.** Every service method takes filesystem paths, not data:
`service.init({requestPath, out})`, `service.validate({runRoot, planPath})`,
`service.decline({runRoot, decisionPath})`, `service.record({runRoot,
replacementAuthorisationPath})` (`packages/production/src/commands/dispatch.ts`). The run root
is a directory **inside the agent's own workroot that the service writes into**, and the
envelope returns artifacts as run-relative paths (`artifactDescriptorSchema`,
`packages/production/src/contracts/schemas.ts`) that the agent then reads off its own disk. A
service reachable over HTTP that still requires `--plan plan.json` has not moved: it is the same
shared-filesystem coupling with a weaker isolation story in front of it.

**The run store is the hard part, and it is unrelated to transport.** `RunStore` is built
directly on `node:fs/promises` and uses `link`, `rename`, `realpath` and lock files
(`packages/production/src/run-store/run-store.ts`) — hardlinks for content-addressed reuse and
atomic rename for checkpoint integrity. Object storage has neither. The paths themselves are
already portable: every entry in `RUN_PATHS` (`run-store/paths.ts`) is relative to a run root
and content-addressed by SHA-256, so the *layout* survives a move that the *primitives* do not.

So the migration is (a) transport, trivial; (b) inputs, medium; (c) storage, hard. Introducing
HTTP locally addresses only (a), and does it at the cost of ADR-0007: that decision forbids TCP
and HTTP for this boundary on purpose, and the isolation assertions the proof sheet is built
from rest on the named pipe, the HMAC and the restricted account. A localhost listener is
reachable by every process on the machine, which is the property the current design exists to
deny.

## Decision

**1. The seam is the crew's production client, not the production service.** The crew depends
on one Python interface with two implementations: a local one that spawns `vox.exe`, and an
HTTP one for the cloud phase. Both return the service's result envelope unchanged, as a plain
object. No crew tool, agent instruction or test may branch on which implementation is active.

**2. The client's methods are payload-shaped from the first commit, in both directions.** This
holds for **every** path-shaped input the command surface takes, not the plan alone: `--request`,
`--plan`, `--decision` and `--replacement-authorisation` all arrive at the client as objects, and
a Run is named by its id. A crew tool never passes a path and never names a file it wrote itself.
The local implementation is the one place that knows a plan becomes `plan.json` in a run
directory and that `--plan` takes a path; the HTTP implementation will put the same object in a
request body.

Naming only the plan would leave the other three seams free to grow path-shaped methods, and the
"one module knows paths" property is worth exactly as much as its leakiest seam.

**The read-back direction is the harder half and is included deliberately.** The envelope returns
artifacts as run-relative paths (`artifactDescriptorSchema`) and the crew reads the preview, the
compile report and the Preflight report off its own disk today. In the cloud that disk is not
there. The client therefore exposes artifact retrieval as a method taking a Run id and an artifact
descriptor from the envelope — the local implementation resolves it against the run directory, the
HTTP one will fetch it — and no crew tool joins a run root to a relative path itself.

This performs migration (b) inside the crew, now, while it costs nothing, so that the day the
service accepts payloads the change is a deletion in one module rather than a rewrite of every
agent. `plan.json` remains agent-authored and remains inside the run directory — this decides
who *handles* the path, not where the file lives.

**3. The production service keeps OS-local IPC. ADR-0007 stands unamended.** No HTTP listener
is added for local development, and the crew gets no local-only shortcut in exchange. If the
HTTP request/response *shape* is later wanted before the cloud phase, the form that preserves
ADR-0007 is HTTP over the named pipe — same verbs, same JSON bodies, same handler, with only
the socket swapped for TCP and TLS in the cloud. That remains available and is not adopted here.

**4. The cloud run store is a filesystem, not an object store.** The cloud topology must give
the production service a POSIX-semantics volume — a mounted network filesystem alongside the
service — so that `RunStore` keeps `link`, `rename` and its lock files. Object storage may hold
*exported* artifacts; it may not be the run store's backing. This is the decision that reaches
back into the local design, and taking it now is what makes the local design correct rather
than provisional.

## Considered and rejected

**Build the crew against HTTP from the start.** Rejected as an answer to the stated goal rather
than as a bad idea. It buys migration (a), which is one adapter, and leaves (b) and (c)
untouched; it costs an ADR-0007 amendment and the isolation evidence that rests on it. Decision
1 delivers the same portability for the crew at lower cost, and decision 4 removes the reason
the transport looked urgent.

**Add a localhost HTTP listener to the production service for local runs only.** Rejected on
ADR-0007's threat model and on the spec's own rule that the crew must be deployable without
structural change: a local-only transport that the cloud does not use is exactly the local-only
shortcut the spec forbids. HTTP over the named pipe is the version of this that survives, and
it is available when a concrete need names it.

**Refactor `RunStore` behind a storage abstraction now, so object storage stays open.**
Rejected as premature and as the wrong end of the problem. The abstraction would have to
re-earn atomic rename and content-addressed hardlink reuse over a store that offers neither,
and nothing in the crew phase exercises it. Decision 4 keeps the cheaper option open; if a
later cloud spec chooses object storage anyway, it pays for this refactor with its eyes open
and this ADR is what it reopens.

**Make the local client path-shaped, matching the CLI it drives.** Rejected because it puts the
migration in the agents. Every tool that had handled a path would need changing, and agent
instructions that mention files would need rewriting — the expensive, prompt-shaped half of the
work — to buy nothing today.

## Consequences

- The crew's tool layer is written once. The cloud phase adds an implementation, and touches no
  agent, no instruction and no tool.
- The crew must never learn the workroot's layout as vocabulary. A tool that accepts a path is a
  defect against this ADR even when it works locally, and the local implementation is the only
  module the leak-scan discipline needs to read for filesystem knowledge.
- **Decision 4 constrains the volume, not the runtime.** It rules out the obvious pairing —
  a Cloud Storage bucket mounted through FUSE — which offers no hardlinks, a non-atomic rename
  implemented as copy-then-delete, and unreliable `O_EXCL`. It does *not* move production off
  Cloud Run: a mounted network filesystem (Filestore over NFS) is the pairing this decision
  points at, and Cloud Run mounts one directly. Nothing here implies GKE or a VM. What the cloud
  spec inherits is a narrowed volume choice, not a new topology.
- **One thing to verify before the cloud spec is written**, because decision 4 rests on it: that
  the chosen network filesystem, as mounted by the chosen runtime, actually supports `link()`
  and atomic `rename()` from the service process. NFS specifies both, but "the protocol
  specifies it" and "this managed mount delivers it" are different claims and only the second
  one matters. The decision is that the run store keeps POSIX semantics; the product that
  supplies them is the cloud spec's to name and prove.
- Nothing in `packages/production` changes as a result of this ADR. The service, the launcher,
  the IPC host, the envelope and the proof harness are untouched.

## References

- ADR-0007 — Isolate agent production behind a trusted service (the boundary this preserves)
- `.scratch/agent-crew/spec.md` — the crew spec whose Implementation Decisions this ADR backs
