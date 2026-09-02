# ADR-0007 — Isolate agent production behind a trusted service

**Status:** accepted · 2026-08-13 · **superseded in part by
[ADR-0018](0018-the-isolation-guarantee-outlives-the-named-pipe.md), 2026-09-02**

**What ADR-0018 supersedes is the transport clause below — "authenticated OS-local IPC, never TCP
or HTTP" — and nothing else.** That clause remains correct and binding for the local topology,
which is unchanged. For a remote deployment, ADR-0018 states the same isolation guarantee
independently of the transport, names what answers each question the pipe answered, and names
which recorded isolation probes stop being meaningful there. It also narrows one sentence in the
Consequences below: the render's headless browser reaches a named font host beneath the denying
network adapter, so *"denies outbound networking outside `record`"* is precise about the service
and not about the browser it drives. Read ADR-0018 before citing either.

The Agent production interface must be usable while every readable implementation remains
unavailable to the agent. The boundary prototype showed that a local Remotion artifact was
not opaque: it exposed sourcemaps, repository paths, source content, internal commentary and
readable implementation. It also proved that a thin client could validate, compile and render
through a process outside the agent filesystem.

Production therefore executes in a trusted Production service outside the agent-readable
environment. A native, thin `vox` launcher communicates with it through authenticated OS-local
IPC, never TCP or HTTP. The service alone owns production source, runtimes, dependencies,
credentials and private temporary files; only its `record` operation may use outbound network
or quota. The agent receives the Brief, operator-owned request, Run artifacts and generated
public contracts, never the implementation that fulfils them.

The Authoring knowledge frame is published through versioned `contract index` and `contract
show` JSON responses. `language` derives from `CONTEXT.md`; `plan` publishes JSON Schema and
validated full-plan examples derived from private `videoPlanSchema` data; `catalog` remains the
generated version-3 manifest containing `time`, `capabilities` and ADR-0006's `checks`;
`checks` is an on-demand view of that same data; and `protocol` derives from declarative
production-contract data. TypeScript types remain private and derive from the same schema.

## Considered option

A minified or bundled local runtime was rejected. The actual bundle failed the threat model,
and minification would obscure names without proving that implementations, comments, source
maps or repository paths were unreachable. A future local-runtime technology needs a new
prototype and must pass the same release gate before this decision can be revisited.

## Consequences

Every release assembles the agent distribution from an allowlist, scans all readable files,
binaries and embedded archives for forbidden source and implementation leakage, exercises the
public commands as an isolated OS principal, proves service and repository paths inaccessible,
sanitises all published results, and denies outbound networking outside `record`. This adds
service installation, IPC authentication and launcher/service compatibility work, but makes
code-blindness an enforced boundary rather than a packaging convention.
