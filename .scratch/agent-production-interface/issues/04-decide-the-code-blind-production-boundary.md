# Decide the code-blind production boundary

Type: grilling
Status: resolved
Blocked by: 02, 03

## Question

Given the public command lifecycle and the boundary prototype, **what does the agent receive**,
and where does production actually execute? Decide between a local opaque runtime artifact and
a thin CLI calling a process outside the readable environment; decide how the boundary proves
that implementations are unreachable; and decide which dependencies may remain installed
outside the agent's environment without making them readable.

The question is deliberately *what the agent receives*, not *what unit sits in its directory*:
the second phrasing presupposes the in-directory bundle, and the prototype exists precisely to
test whether that boundary holds.

Enforce the map's threat model as the acceptance standard — readable contracts and vocabulary
yes, readable implementations, TypeScript, sourcemaps, repository paths and internal comments
no, and minification alone establishes nothing.

If the cut line reaches item 2, this ticket also absorbs
[Decide the published contract artifacts](07-decide-the-published-contract-artifacts.md)
rather than dropping its question.

## Resolved when

The executing location, the received artifacts and the enforcement mechanism are fixed, and
the leak checks the prototype ran are restated as standing requirements on the production
build.

## Comments

### Grilling round 1 — executing side of the boundary

The prototype has removed one branch from the decision tree. A local Remotion runtime artifact
exposed 15 sourcemaps, 25 Vox source entries with `sourcesContent`, the precommitted JSDoc
marker and readable internal implementation even without the repository mounted. The thin-
client candidate actually validated, compiled and rendered from an isolated container and
then passed the in-container leak probe.

The open frontier is therefore:

1. choose a trusted production process outside the agent-readable filesystem as the only
   execution location for validation, Preflight, recording, compilation and rendering;
   permanently reject the current local Remotion artifact, and require a new prototype before
   any future local-runtime technology may reopen that branch.

The recommendation is yes. The received distribution, local transport, dependency placement
and permanent enforcement checks depend on this boundary choice and follow in the next round.

User confirmed the recommendation on 2026-08-13: `Q1 oui`.

### Grilling round 2 — received surface, transport and standing isolation gate

With the executing side fixed outside the agent-readable filesystem, the open frontier is:

2. give the agent only a native, thin `vox` launcher containing public protocol plumbing, the
   Brief and operator-owned request, and the Run root with its public results. Publish the
   Authoring knowledge frame through the already-decided `contract index` / `contract show`
   commands as versioned JSON projections: `language` is generated from `CONTEXT.md`; `plan`
   carries JSON Schema derived from the private `videoPlanSchema` plus validated full-plan
   examples; `catalog` is the generated version-3 manifest with `time`, `capabilities` and
   ADR-0006's `checks`; `checks` is an on-demand projection of that same generated check data,
   not a second authored copy; and `protocol` is generated from declarative production-contract
   data. The TypeScript type derives privately from `videoPlanSchema` and is never published.
   No JavaScript runtime, repository, source, sourcemap, production dependency or credential is
   part of the received distribution;
3. connect the launcher to the trusted Production service only through authenticated OS-local
   IPC — a Windows named pipe for this target, with a Unix-domain socket as the equivalent
   abstraction — and forbid TCP/HTTP, including loopback. IPC does not make the service's
   filesystem readable. Every command uses this local channel; only the service-side `record`
   handler may open an outbound ElevenLabs connection or spend quota. The prototype's HTTP
   transport was evidence for separation, not a production choice;
4. keep all production implementation and dependencies service-side: Vox source and packages,
   Node, Remotion, Chromium, FFmpeg, the voice SDK, credentials and private temporary files.
   None is mounted or copied into the agent environment. The service publishes only the
   protocol-declared, sanitised artifacts and receipts, copied atomically below the canonical
   Run root;
5. make code-blindness and network isolation a release gate, not a one-off prototype check:
   build the agent distribution from an empty allowlisted staging area; reject forbidden names
   and extensions such as `.ts`, `.tsx` and `.map`; scan readable files, binaries and embedded
   archives for sourcemap markers, repository paths, the prototype's known JSDoc sentence and
   distinctive internal identifiers; enumerate everything readable as the isolated agent OS
   principal and prove repository, service and dependency paths inaccessible; execute contract
   discovery plus validate, Preflight, compile and render against a verified Take; sanitise
   replies, stderr and artifacts so no stack, internal path or comment crosses the boundary;
   and deny outbound networking to every non-`record` command. Any hit fails the build and the
   later fresh-Brief proof must repeat the gate including a real `record`.

The recommendation is yes to all four. The ADR home depends on the confirmed topology and is
the final downstream question; no implementation is authorised by this round alone.

User confirmed all four recommendations on 2026-08-13: `Q2 oui, Q3 oui, Q4 oui, Q5 oui`.

### Grilling round 3 — ADR home

The only remaining frontier decision is:

6. record the execution boundary, public projection topology and standing isolation proof in
   a new ADR-0007 dedicated to the Agent production interface. Keep ADR-0006 scoped to the
   compiler-check vocabulary and its `catalog.json` projection; ADR-0007 may reference it but
   does not widen or duplicate it. Record the rejected local Remotion bundle and the prototype
   evidence so a future maintainer does not accidentally "simplify" the trusted service back
   into an agent-readable runtime.

The recommendation is yes. This decision qualifies for an ADR because reversing the trust
boundary is costly, the service split is surprising without the leak evidence, and the local
bundle was a credible alternative that failed the stated threat model. This is the last
frontier for tickets 04 and 07.

User confirmed the recommendation on 2026-08-13: `Q6 oui`.

## Answer

Production executes only in a trusted **Production service** outside the agent-readable
filesystem. Validation, Preflight, recording, compilation and rendering all cross that
boundary; the current local Remotion artifact is permanently rejected because the prototype
found 15 sourcemaps, 25 Vox source entries with `sourcesContent`, repository paths, a known
JSDoc marker and readable implementation. A future local-runtime technology may reopen this
choice only after a new boundary prototype passes the full standing gate.

### Agent-visible surface and public contracts

The agent receives only:

- a native, thin `vox` launcher containing public protocol plumbing but no production logic;
- the Brief and operator-owned request;
- the Run root and its protocol-declared artifacts and receipts;
- versioned JSON contract projections returned by `vox production contract index` and
  `vox production contract show`.

The contract topology, absorbed from ticket 07 under cut-line item 2, is:

| Category | Public projection | Canonical source |
|---|---|---|
| `language` | Generated JSON glossary | `CONTEXT.md` |
| `plan` | JSON Schema plus validated complete-plan examples | Private `videoPlanSchema` and structural-example data |
| `catalog` | Generated manifest version 3 with `time`, `capabilities` and `checks` | Registered SceneCapability data, `ANCHOR_GRAMMAR` and `COMPILER_CHECKS` |
| `checks` | On-demand projection of the same generated `checks` data carried by the catalog | `COMPILER_CHECKS` |
| `protocol` | Generated command, lifecycle and production-rule contract | Declarative production-contract data |

The repository's TypeScript `VideoPlan` type derives privately from `videoPlanSchema`; neither
it nor any TypeScript is published. `checks` is a convenient query projection, never another
authored artifact. Public projections are generated and contract-tested against their one
canonical source.

No JavaScript runtime, repository, source, sourcemap, production dependency or credential is
part of the agent distribution. The launcher reaches the Production service only through
authenticated OS-local IPC — a Windows named pipe for the present target, represented by the
same abstraction as a Unix-domain socket elsewhere. TCP and HTTP, including loopback, are
forbidden. Only the service-side `record` handler may open an outbound ElevenLabs connection
or spend quota.

### Service ownership and publication

The Production service exclusively owns Vox source and packages, Node, Remotion, Chromium,
FFmpeg, the voice SDK, credentials and private temporary files. These are neither mounted nor
copied into the agent environment. The service publishes only sanitised, protocol-declared
artifacts and receipts, copied atomically below the canonical Run root.

### Standing release gate

Every production build and the final fresh-Brief proof must enforce all of the following:

1. assemble the agent distribution from an empty allowlisted staging area rather than copying
   a repository tree;
2. reject forbidden filenames and extensions, including `.ts`, `.tsx` and `.map`;
3. scan every readable file, binary and embedded archive for sourcemap markers, repository
   paths, the prototype's known JSDoc sentence, distinctive internal identifiers and readable
   implementation; minification does not satisfy this check;
4. enumerate everything readable as the isolated agent OS principal and prove repository,
   service and dependency paths inaccessible;
5. execute contract discovery, validation, Preflight, compilation and rendering against a
   verified Take; the final fresh-Brief proof additionally executes a real `record`;
6. sanitise service replies, stderr and artifacts so stack traces, internal paths and comments
   never cross the boundary;
7. deny outbound networking to every command except the service-side `record` operation.

Any leak or policy violation fails the build. The throwaway prototype's HTTP transport proves
process separation only; it is not production precedent.

### Decision record and trade-offs

[ADR-0007](../../../docs/adr/0007-isolate-agent-production-behind-a-trusted-service.md)
records the boundary and public projection topology. ADR-0006 remains scoped to the compiler-
check vocabulary and its `catalog.json` projection.

The trusted service adds installation, IPC authentication and launcher/service compatibility
work. In return, code-blindness is established by filesystem and process isolation rather than
by hoping a JavaScript bundle is opaque, while the agent retains complete machine-readable
authoring and production contracts.
