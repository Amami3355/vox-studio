# 05: The service gains a payload-shaped surface, above the command service

Status: ready-for-agent

## Problem Statement

The service's request surface is argv. `ipcRequestSchema` carries `cwd` and `argv`
(`authentication.ts:7-16`), `host.ts:104` calls `dispatchProductionArgv(service, request.cwd,
request.argv)`, and every method on `ProductionCommandService` takes a path: `init` takes
`requestPath`, `validate` takes `planPath`, `decline` takes `decisionPath`, and all of them take a
`runRoot`. That is a filesystem contract in both directions, and it is the coupling ADR-0015 named
as the expensive one of the three hiding inside "make it HTTP".

The crew has already paid its half. `ProductionClient` is payload-shaped — `init(request: Mapping)`,
`validate(run_id, plan: Mapping)`, `fetch_artifact(run_id, descriptor)` — and exactly one module
knows that paths exist. That module is `local_client.py`, and what it does is instructive:
`_stage(directory, name, payload)` writes the payload into the Run directory as a well-known
filename and hands the path to argv, `_transient` does the same for a payload with nowhere durable
to live yet, and `_directory(run_id)` maps a Run id onto a folder on the caller's own disk.

**That knowledge is on the wrong side of the boundary.** In the cloud the crew's disk is not the
Run's disk, so `_stage` has nothing to write into and `fetch_artifact`'s `_within(root, relative)`
has nothing to read from. Every one of those four helpers is a local-only assumption, and they are
the reason `HttpProductionClient` cannot simply be written today: there is nothing on the other side
of the network that accepts a plan as an object.

Decision 1 is precise about where the fix goes and decision 2 about what it must include. The
read-back direction — artifacts — is the harder half and is deliberately in scope, because *"a
producer that had opened the file itself is the module that strands the crew at deployment."*

## Solution

One new module above `ProductionCommandService` and below every transport.

**It accepts a command name, a Run id where the command names one, and a payload object where the
command takes one.** It materialises the payload into the Run — the plan becomes `plan.json`, a
decline decision becomes `decision.json`, a replacement authorisation becomes its own file, and a
request has nowhere durable to live until the Run exists — and then calls the path-shaped method
that already exists. This is `local_client.py`'s staging, moved across the boundary, and the move is
what makes the crew's copy deletable.

**It exposes artifact retrieval keyed by the descriptor the envelope already published.** A Run id
and a descriptor in, bytes and digest out. No caller composes a path. The surface refuses a
descriptor resolving outside its Run, exactly as `local_client.py:236`'s `_within` does now, and for
the same reason.

**It is the only new seam this spec introduces.** Both transports serve it, both clients are held to
it, and its contract tests are the shared bar.

## Implementation Decisions

- **`ProductionCommandService` is not made payload-shaped.** Decision 1 rejects it and the reason is
  worth restating: its methods are what `dispatch`, the proof harness and every existing test call,
  so reshaping them puts a deployment migration inside the compiler's blast radius for no gain. The
  service has a filesystem in both topologies. Writing the payload down is the correct
  implementation on both sides of the move, not a local concession.
- **`dispatchProductionArgv` stays, unchanged, and keeps serving the named pipe.** This is the
  decision most likely to be re-litigated, so: `vox.exe` forwards argv, the proof harness is built on
  it, and both are explicitly out of this spec's scope. The argv dispatcher and the payload surface
  are two callers of one command service, they coexist permanently, and the local topology is
  untouched by this ticket. **A session that tries to unify them has taken on `vox.exe` and the proof
  harness without noticing.**
- **The filename each payload materialises to is the surface's decision, and it matches what
  `local_client.py` writes today.** Byte-for-byte the same names, so that a Run produced through
  either path is the same Run on disk and the recorded fixtures stay valid.
- **The surface owns Run-id-to-root resolution and no caller passes a root.** Locally the crew
  resolves a Run id against its own work root; that is precisely the assumption that does not travel.
  The surface resolves against the ledger root it was constructed with.
- **A payload with nowhere durable to live is the surface's problem, not the caller's.** `init`
  names no Run because the Run does not exist yet. The surface handles the transient case the way
  `_transient` does today, inside the boundary.
- **Retrieval returns bytes and a digest, and the digest is computed rather than echoed.** A
  retrieval surface that returns the digest the envelope claimed proves nothing about the bytes it
  just handed back.
- **No command is added, renamed or removed, and no envelope field changes.** Decision 10. If this
  migration wants one, the seam is in the wrong place.

## Testing Decisions

**The surface is the module under test and it is tested once.** Both transports and both clients
delegate to it, so this is where the contract lives. Prior art: `packages/production/tests/`'s
existing service tests, and `crew-fixtures.test.ts`, which holds every recorded envelope to the
schema the service could actually emit.

**Every command is driven through the surface and produces the envelope the argv path produces.**
Same Run, same inputs, one through `dispatchProductionArgv` and one through the surface, envelopes
compared field by field. This is the assertion that makes the surface a relocation rather than a
reimplementation, and it is cheap because both paths are in the same process.

**A payload materialises to the filename the local client writes today**, asserted by name. If this
drifts, a Run produced in the cloud is a different Run on disk from one produced locally, and the
recorded fixtures silently stop describing both.

**Retrieval refuses a descriptor that escapes its Run.** The containment case, ported from the
assertion `local_client.py` already carries. A descriptor naming another Run's artifact, a
descriptor with a traversal in it, and a descriptor for a Run that does not exist are three refusals
and three distinct errors.

**The digest is recomputed, proved by a corrupted artifact.** Write bytes that do not match the
published digest and assert retrieval reports it. Without this the digest is decoration.

**No test learns which transport is above the surface**, because none is yet.

## Out of Scope

- **The TLS transport.** Ticket 06, which serves this surface.
- **`HttpProductionClient`.** Ticket 08, which calls it.
- **Deleting `local_client.py`'s staging.** It keeps going through `vox.exe` and argv, which is
  correct for the local topology and unchanged by this ticket.
- **Touching `vox.exe`, the pipe helpers, or the proof harness.**
- **`RunStore`.** The surface writes through the service, which writes through the store.
- **Streaming large artifacts.** Retrieval returns bytes in this phase; a render's output is the
  case that will eventually want streaming, and decision 7 already names synchronous render as the
  phase's known limit.

## Further Notes

**This ticket is pure TypeScript with no cloud dependency and can start the moment ticket 02
lands.** It is the longest pole on the service track and it does not need a project, a volume or a
container to be written or tested. Start it in parallel with ticket 03.

**Blocked by:** `.scratch/cloud-phase/issues/02-the-boundary-is-re-earned-without-os-local-ipc.md`

- [ ] A module above `ProductionCommandService` accepts a command, a Run id and a payload, and returns the envelope
- [ ] It materialises each payload into the Run under the filename `local_client.py` writes today, asserted by name
- [ ] It resolves a Run id against its own ledger root, and no caller passes a root
- [ ] It handles the payload that has nowhere durable to live until the Run exists
- [ ] Artifact retrieval takes a Run id and an envelope descriptor, and returns bytes and a digest
- [ ] The digest is recomputed rather than echoed, proved by a corrupted artifact
- [ ] Retrieval refuses a descriptor resolving outside its Run, with distinct errors for escape, wrong Run, and missing Run
- [ ] Every command driven through the surface produces the envelope the argv path produces, compared field by field
- [ ] `ProductionCommandService`, `dispatchProductionArgv`, `vox.exe` and the proof harness are unmodified
- [ ] No command, envelope field or contract changes
