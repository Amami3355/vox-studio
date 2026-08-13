# Define the public command lifecycle

Type: grilling
Status: resolved
Blocked by: 01

## Question

What are the exact public commands and stage transitions of the Agent production interface?
Decide command names and namespaces, JSON inputs and result envelopes, exit-code semantics,
stdout/stderr separation, prerequisites, the `--out` write boundary, contract discovery, and
the structured decline result — which must be an explicit result artifact or protocol state,
never an exit code alone.

Decide also **that** preflight exists as a stage between `validate` and `record`, and the
prohibition that no command may present an estimate as an authoritative compilation result.
Preflight's estimator, margin, wording and report fields belong to
[Define duration preflight](05-define-duration-preflight.md).

Preserve the map's standing constraints: no command mutates `plan.json`, no network or quota
outside `record`, and the recording-authorisation model.

Record the hard-to-reverse boundary and its trade-offs where
[Decide the published contract artifacts](07-decide-the-published-contract-artifacts.md)
decides it belongs; do not widen ADR-0006 before that decision.

## Resolved when

Every command's name, inputs, outputs, exit codes and prerequisites are fixed, decline has a
represented shape, and preflight's place and limits in the sequence are stated.

## Answer

The public binary is `vox`; the Agent production interface lives under the `production`
namespace. It exposes explicit stages over one persistent Run and **no** monolithic `produce`
command.

### Commands and prerequisites

| Command | Input and prerequisite | Effect |
|---|---|---|
| `vox production contract index` | None | Read-only category index; no Run, write, network or quota |
| `vox production contract show <language\|plan\|catalog\|checks\|protocol>` | One closed category id | Read-only generated projection; no Run, write, network or quota |
| `vox production run init --request <request.json> --out <run-dir>` | Valid request; non-existing output root | Creates the Run at `initialized` |
| `vox production run status --run <run-dir>` | Any existing Run | Reports state without changing it |
| `vox production run decline --run <run-dir> --decision <decline.json>` | No Take has been recorded or reused | Terminates the Run at `declined`; never deletes a draft plan |
| `vox production run validate --run <run-dir> --plan <plan.json>` | Any non-terminal Run; readable plan | Reads but never mutates the plan; binds the candidate version when green |
| `vox production run preflight --run <run-dir>` | Current bound plan has a green validation | Runs all plan-only checks and advisory duration assessment |
| `vox production run record --run <run-dir> [--replacement-authorisation <grant.json>]` | Current green validation and Preflight | Reuses a verified matching Take by default, records a first Take within budget, or requests an authorised replacement |
| `vox production run compile --run <run-dir>` | Current green validation and Preflight; verified Take matching the Recording input | Compiles authoritatively without network or quota |
| `vox production run render --run <run-dir>` | Current green compilation and Compiled document | Renders without network or quota |

Filesystem JSON is the only request transport. JSON is never positional or read from stdin;
operation-specific JSON uses the named flags above. The thin client and its production
transport may not turn non-record commands into external network users: only `record` may use
the network or spend quota. Ticket 04 owns the execution boundary that enforces this.

### Inputs

`request.json` has exactly this public shape:

```json
{
  "protocolVersion": 1,
  "brief": { "id": "brief-id", "text": "One paragraph of editorial intent." },
  "production": {
    "voice": {
      "provider": "elevenlabs",
      "voiceId": "JBFqnCBsd6RMkjVDRZzb",
      "modelId": "eleven_v3",
      "seed": 7
    },
    "maxNewTakes": 2
  }
}
```

`id`, `text`, `voiceId` and `modelId` are non-empty strings; `seed` is an integer and
`maxNewTakes` a non-negative integer. Credentials are forbidden: production owns them outside
the agent-readable environment.

`decline.json` is:

```json
{
  "protocolVersion": 1,
  "kind": "unservable_brief",
  "summary": "Why this Brief cannot be served.",
  "unmetNeeds": [
    { "need": "The editorial treatment required", "catalogGap": "What the catalogue lacks" }
  ]
}
```

The summary and at least one need/gap pair are required and non-empty. A Decline is a
terminal protocol result and produces no preview; an existing draft plan is preserved. The
measurement gate adds its stricter condition that its declined Runs produced no plan.

An authorised identical-input replacement uses:

```json
{
  "protocolVersion": 1,
  "grantId": "operator-issued-id",
  "runId": "bound-run-id",
  "recordingInputSha256": "64 lowercase hexadecimal characters",
  "issuedAt": "ISO-8601 timestamp",
  "grant": "opaque production-verifiable value"
}
```

The visible fields state the grant's scope; production verifies the opaque value outside the
readable environment. Copying or authoring JSON cannot grant quota. Ticket 06 owns grant
verification and persistence.

### Stages, repair and Preflight

The successful path is:

`initialized → validated → preflighted → recorded → compiled → rendered`

`status` never transitions. `declined` is terminal. Command outcome is separate from Run
stage and is one of `succeeded | needs_repair | paused | declined | failed`. Warnings and
Preflight risks may accompany `succeeded`; `needs_repair`, `paused` and `failed` retain the
last successful stage.

A changed plan stales validation, Preflight, compilation and rendering. The recorded stage
remains reusable exactly when the Recording input is unchanged; otherwise it is stale. A
command refuses to skip any stage newly required by the change. Ticket 06 owns the hashes and
artifact state that prove freshness.

Preflight is mandatory after green validation and before recording. Its assessment is
explicitly advisory: risks do not themselves block `record`, it fabricates neither word
onsets nor timings, and no field or message may present it as a compile result. Only
compilation against a verified Take is authoritative. Ticket 05 owns the estimator, margin,
wording and nested Preflight report schema.

### Result envelope

Every invocation that reaches command parsing writes exactly one newline-terminated JSON
object to stdout, with every top-level field present:

```json
{
  "protocolVersion": 1,
  "command": "run.validate",
  "outcome": "succeeded",
  "run": { "id": "run-id", "stage": "validated" },
  "data": {},
  "artifacts": [
    { "kind": "validation_report", "path": "relative/to/run.json", "sha256": "..." }
  ],
  "error": null,
  "next": [
    { "command": "run.preflight", "args": ["--run", "."], "reason": "Plan is valid." }
  ]
}
```

`command` is a canonical id (`contract.index`, `contract.show`, or `run.<verb>`) and may be
null only when parsing could not identify one. `run` is null for contract commands and
pre-Run failures. `data` is the command-specific object or null. `error` is null or
`{ code, message, details }`. Artifact paths are Run-relative and carry SHA-256; `next.args`
is an argument array, never an interpolated shell command.

Command data is fixed as follows:

- index: `{ categories: [{ id, summary }] }`;
- show: `{ category, contractVersion, contract }`;
- init: `{ created: true }`;
- status: `{ staleStages, lastOutcome, artifacts }`, with ticket 06 defining each artifact's
  state details;
- decline: the accepted decline decision;
- validate and compile: `{ report: { ok, errorCount, warningCount } }`;
- Preflight: `{ report: <advisory summary> }`, with ticket 05 owning its fields and the
  lifecycle prohibiting a compile-result shape or claim of authority;
- record: `{ disposition, takeId, newTakesUsed, maxNewTakes }`, where `disposition` is
  `reused | recorded | replacement_recorded`;
- render: `{ preview: <artifact descriptor> }`.

Commands that transition the Run persist the same envelope as a receipt before printing it.
Contract discovery and `status` are strictly read-only. Stdout contains the envelope and
nothing else. Optional human progress and diagnostics go to stderr, are never required for
automation, and redact credentials and grants.

### Write boundary and exit codes

`--out` on `init` creates the sole agent-visible write root. Its existing parent is resolved
canonically and the leaf must not already exist or be a symlink/reparse point. Every later
visible write must remain below the stored canonical Run root. Inputs outside it may be read
but never mutated. Private production temporary files stay outside the agent environment and
never appear as public artifact paths.

Exit codes describe the process, not the domain outcome:

- `0`: `succeeded`, `needs_repair`, `paused` or `declined`;
- `1`: structured `failed`;
- `2`: malformed invocation or input prevented execution.

An externally killed process uses its platform signal code and is the only case where an
envelope cannot be promised.

### Trade-offs

Explicit stages cost more invocations than `produce`, but expose every repair, irreversible
quota action and resumable boundary. Exit zero for `needs_repair` and `paused` requires callers
to read the envelope, deliberately keeping expected protocol states out of shell-failure
semantics. A single write root and JSON-only inputs are restrictive, but make the Run
inspectable and its mutation surface enforceable.

## Comments

### Grilling round 1 — command topology

Repository facts: no public production binary exists today. The only proposed CLI is the
separate measurement harness (`search`, `spec`, `validate`), whose cold-pass restrictions and
purpose must not leak into production. The production flow must expose repair and authorised
quota pauses, and `plan.json` remains agent-owned, so one opaque `produce` command would hide
the states later tickets must bind.

The open frontier is:

1. use one shared run directory and explicit commands under `vox production`: `contract
   index`, `contract show <category>`, and `run init|status|decline|validate|preflight|record|
   compile|render`; do not expose a monolithic `produce` command;
2. make filesystem JSON the request transport: `run init --request <request.json> --out
   <run-dir>`, then every stateful command uses `--run <run-dir>`; optional operation-specific
   JSON is passed by a named flag, never by positional JSON or stdin.

The recommendation is yes to both. Later rounds depend on this topology and will decide the
stage graph, exact JSON shapes, result envelope, `--out` containment, exit codes and
stdout/stderr separation.

User confirmed both recommendations on 2026-08-13: `Q1 oui, Q2 oui`.

### Grilling round 2 — stages, freshness and decline

The open frontier is:

3. use successful stages `initialized → validated → preflighted → recorded → compiled →
   rendered`, while `status` is read-only and `declined` is terminal; a plan change makes
   validation, Preflight, compilation and rendering stale, while the recorded stage remains
   reusable exactly when the Recording input did not change; the next command refuses to skip
   newly required stages;
4. permit `decline` until a Take has been recorded or reused, require a structured reason that
   names the unmet editorial need and what the current catalogue lacks, produce no preview,
   never delete a draft `plan.json`, and preserve the decision as a terminal result rather
   than encoding it only in an exit status; the measurement gate separately requires its
   declined Runs to have produced no plan;
5. make Preflight mandatory after a green validation and before `record`, but always advisory:
   it runs every plan-only check, reports duration risk, never fabricates word onsets or a
   compile result, and its risks do not themselves block `record`; only compilation against a
   verified Take is authoritative;
6. keep stage and command outcome distinct. The command outcomes are `succeeded`,
   `needs_repair`, `paused`, `declined` and `failed`; warnings and Preflight risks can accompany
   `succeeded`, while the Run retains its last successful stage after `needs_repair`, `paused`
   or `failed`.

The recommendation is yes to all four. Exact per-command prerequisites, JSON fields and
process exit codes depend on these distinctions and follow in the next round.

User confirmed all four recommendations on 2026-08-13:
`Q3 oui, Q4 oui, Q5 oui, Q6 oui`.

### Grilling round 3 — prerequisites and JSON inputs

The open frontier is:

7. fix these command inputs and prerequisites:
   - `contract index` and `contract show <language|plan|catalog|checks|protocol>` need no Run,
     perform no writes and use no network;
   - `run init --request <request.json> --out <run-dir>` requires a valid request and a
     non-existing output path, and creates the Run;
   - `run status --run <run-dir>` is valid for any existing Run and changes nothing;
   - `run decline --run <run-dir> --decision <decline.json>` is allowed only before a Take
     exists and terminates the Run;
   - `run validate --run <run-dir> --plan <plan.json>` is allowed in any non-terminal Run,
     reads but never rewrites the plan, and binds the candidate version on success;
   - `run preflight --run <run-dir>` requires the current bound plan to have a green
     validation;
   - `run record --run <run-dir> [--replacement-authorisation <grant.json>]` requires current
     green validation and Preflight; it reuses a verified matching Take by default, records a
     first Take within budget, and requests replacement only when the grant is supplied;
   - `run compile --run <run-dir>` requires current green validation and Preflight plus a
     verified Take for the current Recording input;
   - `run render --run <run-dir>` requires a current green compilation and Compiled document;
8. define `request.json` as `{ protocolVersion: 1, brief: { id, text }, production: { voice:
   { provider: "elevenlabs", voiceId, modelId, seed }, maxNewTakes } }`, with non-empty strings,
   integer seed, non-negative integer budget and no credentials;
9. define `decline.json` as `{ protocolVersion: 1, kind: "unservable_brief", summary,
   unmetNeeds: [{ need, catalogGap }] }`, requiring a non-empty summary and at least one
   non-empty need/gap pair;
10. define the operator-issued replacement grant as `{ protocolVersion: 1, grantId, runId,
    recordingInputSha256, issuedAt, grant }`; the visible fields bind its meaning and the
    opaque `grant` is verified by production outside the agent-readable environment, so an
    agent-authored JSON file cannot authorise quota.

The recommendation is yes to all four. Artifact paths, hash persistence and grant
verification remain ticket 06's responsibility; this round fixes only the public inputs and
prerequisites.

User confirmed all four recommendations on 2026-08-13:
`Q7 oui, Q8 oui, Q9 oui, Q10 oui`.

### Grilling round 4 — result protocol, write boundary and process semantics

The open frontier is:

11. require one newline-terminated JSON envelope with these always-present fields:
    `{ protocolVersion, command, outcome, run, data, artifacts, error, next }`; `command` is
    the canonical command id or null when parsing never identified one; `run` is null or
    `{ id, stage }`, `data` is the command-specific object or null, every artifact descriptor
    is `{ kind, path, sha256 }` with a Run-relative path, and every next action is
    `{ command, args, reason }` with an argument array rather than an interpolated shell
    string; `error` is null or `{ code, message, details }`;
12. fix the command-specific `data` shapes:
    - contract index: `{ categories: [{ id, summary }] }`;
    - contract show: `{ category, contractVersion, contract }`;
    - init: `{ created: true }`;
    - status: `{ staleStages, lastOutcome }` plus the current artifact summary defined by
      ticket 06;
    - decline: the accepted decline decision;
    - validate: `{ report: { ok, errorCount, warningCount } }`;
    - preflight: the advisory summary schema owned by ticket 05, nested under `report` and
      prohibited from using a compile-result shape or claiming authority;
    - record: `{ disposition, takeId, newTakesUsed, maxNewTakes }`, where disposition is
      `reused|recorded|replacement_recorded`;
    - compile: `{ report: { ok, errorCount, warningCount } }`;
    - render: `{ preview: <artifact descriptor> }`;
13. make stdout machine-only: exactly the envelope and no progress text; send optional human
    progress and diagnostics to stderr, redact credentials/grants, and never require stderr
    to interpret a result. Transition commands persist the same envelope as a Run receipt
    before printing it; `contract` and read-only `status` do not write;
14. make `--out` on `init` the sole agent-visible write root: it must resolve to a
    non-existing, non-symlink/reparse path; every later visible write must remain below the
    resolved Run root; inputs may be read from outside but are never mutated; private
    production-service temporary files remain outside the agent environment and are not
    exposed as artifact paths;
15. allocate exit codes by process semantics: `0` for well-formed protocol outcomes
    `succeeded|needs_repair|paused|declined`, `1` for a structured `failed` outcome, and `2`
    for malformed invocation or input that prevents command execution. A killed process may
    use the platform's signal code and cannot promise an envelope; every other invocation
    that reaches the parser prints one.

The recommendation is yes to all five. This is the last frontier for ticket 02.

User confirmed all five recommendations on 2026-08-13:
`Q11 oui, Q12 oui, Q13 oui, Q14 oui, Q15 oui`.
