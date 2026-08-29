# Where each fact lives

Nothing here is asserted on its own authority. If a line below disagrees with the file it names,
the file is right and this table is stale — fix the table.

Everything marked **walked** was produced by running the step, not by reading the source. The
whole file was walked once end to end, including a paid `record` and a successful `render`.

## The nine variables

All nine are `required(...)` calls in `packages/production/src/ipc/service-host.ts:25-35`, which
throws `Missing trusted service configuration: <NAME>` for any that is unset
(`service-host.ts:13-17`).

| Variable | Read at | Notes |
|---|---|---|
| `VOX_PIPE_PATH` | `service-host.ts:25` | Host side only. Must start with `\\.\pipe\` |
| `VOX_IPC_TOKEN` | `service-host.ts:28` | Also read by the launcher; ≥ 32 UTF-8 bytes |
| `VOX_GRANT_KEY` | `service-host.ts:29` | HMAC key for replacement grants (`:39-52`) |
| `ELEVENLABS_API_KEY` | `service-host.ts:30` | Passed to `createElevenLabsAdapter` |
| `VOX_LEDGER_ROOT` | `service-host.ts:31` | `resolve()`d — **against the service's cwd** |
| `VOX_RUN_HMAC_KEY` | `service-host.ts:32` | Run checkpoint signing |
| `VOX_RUN_KEY_ID` | `service-host.ts:33` | Key id recorded alongside the signature |
| `VOX_CALIBRATION_PATH` | `service-host.ts:34` | `resolve()`d; backs `DurationCalibrationStore` |
| `VOX_REMOTION_ENTRY` | `service-host.ts:35` | `resolve()`d; `packages/video/src/remotion-entry.ts` |

`check-environment.mts` re-reads this list out of the host source at run time rather than
hardcoding it, so a tenth variable is caught without editing this file.

The `file:line` citations throughout this document are hand-written and the line halves do drift.
`packages/production/tests/skill-citations.test.ts` holds the file halves to the tree — a cited
file that moves or disappears fails the suite, as does a line past the end of one. It found a
wrong path the first time it ran.

Optional, not required to start:

- `VOX_PIPE_BRIDGE_HELPER` (`service-host.ts:76`) overrides the bridge executable, which otherwise
  defaults to `dist/service/vox-pipe-bridge.exe`.
- `VOX_IPC_SOCKET_TIMEOUT_MS` (`service-host.ts:37`) overrides the per-request socket timeout.
  See *The socket timeout* below.

`check-environment.mts` validates these too, and derives their names the same way — by reading
the `process.env.<NAME>` reads out of the host source. A malformed optional value is a start-up
failure, not a default, so it belongs in a pre-start check.

### The three `resolve()` calls are relative to `packages\production`

`VOX_LEDGER_ROOT`, `VOX_CALIBRATION_PATH` and `VOX_REMOTION_ENTRY` are passed through
`node:path.resolve`, which resolves against `process.cwd()`. `pnpm --filter @vox/production
service` sets that to `packages\production`, not the workspace root.

**Walked.** `VOX_REMOTION_ENTRY=packages\video\src\remotion-entry.ts` — the value this file used
to recommend — produced, from `run render` and only after a take had been paid for:

```
{"outcome":"failed","error":{"code":"COMMAND_FAILED",
 "message":"ENOENT: no such file or directory, open '<redacted-path>'"}}
```

because it resolved to `packages\production\packages\video\src\remotion-entry.ts`. Export all
three as absolute paths. The same trap applies to `--request` in `bootstrap:workroot`.

## The socket timeout

- One default serves every caller: `DEFAULT_IPC_SOCKET_TIMEOUT_MS = 15 * 60_000`
  (`src/ipc/socket-timeout.ts:10`), taken by `createProductionIpcHost` (`src/ipc/host.ts:59`) and
  applied as `socket.setTimeout(socketTimeoutMs, () => socket.destroy())` (`host.ts:92`).
- `service-host.ts` reads the operator override through `resolveSocketTimeoutMs`
  (`service-host.ts:37`), which treats unset **and empty** as unspecified and rejects anything
  that is not a positive number of milliseconds (`socket-timeout.ts:17-24`).
- The proof harness no longer overrides anything (`src/proof/harness.ts:627`); it inherits the
  same default it used to carry as a literal.

**How it got here.** The generic default was `120_000` and `service-host.ts` passed no option at
all, so a hand-started service inherited two minutes while the harness had always overridden to
fifteen. Only the harness's literal encoded the real requirement, in the one consumer this skill
is told not to treat as authoritative. Raising the shared default retires that split: no caller
inherits a timeout shorter than the slowest command, and the next consumer added cannot
re-acquire the defect by forgetting an option. `tests/socket-timeout.test.ts` holds the default
above the measured render time and covers the override's rejection cases.

**Walked.** With the old 120 s default, `run render` failed after **120.2 s** with
`vox: Production service is unavailable.` while `run status` against the same service succeeded —
the service was healthy and still rendering. With the 15-minute allowance the same command
succeeded in **277.1 s**. A destroyed socket is indistinguishable, at the launcher, from a service
that was never there.

## The two-sided pipe naming

- The host takes the **path** and derives the name: `pipeNameFromPath`,
  `service-host.ts:18-22`. A path without the `\\.\pipe\` prefix throws
  `Production IPC pipe path is invalid.`
- The launcher takes the **name** and never sees the path:
  `packages/production/launcher/Program.cs:19-20`.
- The harness passes the pair the same way: `harness.ts:702` and `harness.ts:724`.

### The launcher's four failures

Verified by running `vox.exe` against a live service, not only by reading the source.

| Message | Exit | Condition | Line | Probed |
|---|---|---|---|---|
| `vox: IPC configuration is unavailable.` | 2 | `VOX_PIPE_NAME` empty/unset, `VOX_IPC_TOKEN` empty/unset, or token < 32 UTF-8 bytes | `Program.cs:21-24` | yes — name unset, and token `short` |
| `vox: IPC pipe name is invalid.` | 2 | `!IsPipeName(pipeName)` | `Program.cs:27-29` | yes — full `\\.\pipe\…` path passed as the name |
| `vox: Production service is unavailable.` | 1 | Catch-all around the pipe connection | `Program.cs:81-84` | yes — wrong name, wrong token, **and a command that outran the socket timeout** |
| `vox: IPC response authentication failed.` | 1 | Response MAC mismatch | `Program.cs:69-70` | no — not reachable by any of the routes above |

The last row is in the source but did not fire in any probe. A **wrong token** does not reach it:
the host closes the connection on a bad request MAC rather than answering, so the launcher's
`catch` fires and it reports `Production service is unavailable.` instead. That message would
require a host that answers with a bad MAC.

**Ticket 31's problem statement is imprecise on this point and this table supersedes it.** It said
a wrong pipe name yields `IPC configuration is unavailable`. It does not: that message fires only
when the name is *empty*. A name that is present but wrong falls through to the connection
`catch` and yields `Production service is unavailable.` — which is exactly what a genuinely
stopped service prints. That message is now known to be ambiguous **four** ways: wrong name, wrong
token, socket timeout, or real outage. Listing the open pipes separates the first; the elapsed
time separates the third; nothing distinguishes a wrong token from a real outage.

A listed pipe is also not, on its own, a usable service. Without its `VOX_IPC_TOKEN` it fails with
the same message. **Walked** — three pipes from earlier sessions were open and none was usable.

## Run identity: the ledger and the attestation

Run checkpoints are signed and the signature is verified on load.

- `RUN_ATTESTATION_INVALID`, "`<purpose>` attestation does not verify." —
  `src/run-store/run-store.ts:1161-1172`.
- `RUN_LEDGER_MISSING`, "Private Run ledger is missing." — `run-store.ts:1427`.
- The signature and its key id are stored in the Run's `run.json` under `attestation`
  (`algorithm: HMAC-SHA256`, `keyId`, `value`).

**Walked**, against a Run recorded by an earlier session:

| Environment | Result of `run status` |
|---|---|
| Fresh `VOX_LEDGER_ROOT` | `RUN_LEDGER_MISSING` |
| Correct ledger, correct `VOX_RUN_KEY_ID`, fresh `VOX_RUN_HMAC_KEY` | `RUN_ATTESTATION_INVALID` |
| All three matching (a Run this session recorded) | `succeeded`, stage returned |

All three are read **service-side** (`service-host.ts:31-33`), so reopening a Run recorded under a
different environment requires restarting the service against that Run's trusted directory. A
launcher shell with the right variables is not enough.

**Consequence, and the reason step 1 writes `service-env.ps1`:** none of the ten work roots that
predate this walk can be reopened. `C:\vox-trusted\anc\` kept its ledger, its calibration and even
`ipc-token.txt`, but not its run key (`anc-run-1`); the `vox-proof-*` roots kept per-proof ledgers
under `<root>\trusted\ledger` but their key (`helios-bay-catalog-showcase-proof-key-v1`) was
ephemeral. The secret is not derivable from anything in the repository.

## Calibration

- Seeder: `activeInitialCalibration()`, `packages/production/src/preflight/calibration.ts:65-69`.
- Values: `INITIAL_DURATION_CALIBRATION`,
  `packages/production/src/preflight/preflight.ts:16-36` — provider `elevenlabs`, voice
  `JBFqnCBsd6RMkjVDRZzb`, model `eleven_v3`, seed `7`, language `en`.
- Unseeded, the store loads `{ status: 'missing' }` (`calibration.ts:79` treats it as
  `CALIBRATION_MISSING`), and the service falls back to `activeInitialCalibration()` only when no
  store is configured at all — `src/commands/service.ts:1311`.
- A request whose key differs is scored `different_key` and the calibration does not apply:
  `sameKey` / `auditVerifiedTake`, `calibration.ts:71-82`.
- The request's voice block is `production.voice` in `productionRequestSchema`,
  `packages/production/src/contracts/schemas.ts:55-62` — `provider`, `voiceId`, `modelId`, `seed`,
  strict.

**Walked.** A seeded store and a matching request produce
`"duration":{"status":"available"}` in the Preflight report, carrying the calibration key and its
`pointMsPerUnit`. That field is the check that the seeding took.

## Work roots

- `bootstrap:workroot` → `packages/production/scripts/bootstrap-workroot.ts`, wired at
  `packages/production/package.json:18`.
- Usage string: `bootstrap-workroot.ts:32` —
  `[--out <directory>] [--scenario …] [--request <file>] [--sandbox none|codex] [--force]`.
  Default `--out` is `C:\vox-proof-workroots\crew` (`:34`).
- `--request` and `--scenario` are mutually exclusive — `bootstrap-workroot.ts:41-43`.
- The request is parsed before anything is built (`:49-53`), so a bad brief fails the bootstrap
  rather than the Run.
- A work root is exactly two files: `WORK_ROOT_FILES = ['request.json', 'vox.exe']`,
  `packages/production/src/proof/workroot.ts:17`. An extra `plan.json` beside them is tolerated
  in practice (**walked**).
- Bootstrap builds and verifies the launcher itself (`buildAgentDistribution`, `:65`) and grants
  traversal with `icacls` (`:78-85`).

### Bootstrap cannot run while any service is up

`buildAgentDistribution()` is called unconditionally (`:65`) and rewrites
`dist\service\vox-pipe-bridge.exe`, which every running service holds open as a child process.
There is no flag to skip it.

**Walked.** With a service running:

```
[Error: EPERM: operation not permitted, unlink '...\dist\service\vox-pipe-bridge.exe']
```

With every `vox-pipe-bridge.exe` stopped, the same command succeeded and produced the two files.
This makes the ordering *bootstrap, then start the service* mandatory, not stylistic — and a stale
service from another session blocks it just as effectively as your own.

## Run verbs

Routed in `packages/production/src/commands/dispatch.ts:65-149`. Every argv starts with
`production` (`:70`).

| Verb | Flags | Line |
|---|---|---|
| `run init` | `--request`, `--out` | `dispatch.ts:88` |
| `run status` | `--run` | `dispatch.ts:97` |
| `run decline` | `--run`, `--decision` | `dispatch.ts:103` |
| `run validate` | `--run`, `--plan` | `dispatch.ts:112` |
| `run preflight` / `compile` / `render` | `--run` | `dispatch.ts:121-128` |
| `run record` | `--run`, optional `--replacement-authorisation` | `dispatch.ts:130` |
| `contract index` / `contract show <category>` | — | `dispatch.ts:73-79` |

The exercised order is `init → validate → preflight → record → compile → render`,
`harness.ts:295-311`. `render` takes only `--run`, which is why re-issuing it against an existing
Run is a complete recovery.

**Walked**, on an eight-scene brief with `maxNewTakes: 1`:

| Verb | Elapsed | Spends |
|---|---|---|
| `init` | < 1 s | no |
| `validate` | < 1 s | no |
| `preflight` | ~1 s | no |
| `record` | 29.2 s | **yes — one take** |
| `compile` | 1.7 s | no |
| `render` | 277.1 s | no |

Re-issuing a completed verb is idempotent and free (`preflight` and `render` both re-issued). A
verb that fails writes **no receipt** and leaves the stage unchanged: after two failed renders the
chain still ran `…04-run-record`, `…05-run-compile`, `…06-run-render`, and `run.json` reported
`newTakesUsed: 1` with a single take directory.

## Service start

- `pnpm --filter @vox/production service` → `tsx src/ipc/service-host.ts`,
  `packages/production/package.json:14`.
- Readiness line, on **stderr**: `Vox Production service ready.` — `service-host.ts:81`.
- `SIGINT`/`SIGTERM` close the bridge and host — `service-host.ts:83-89`.
- `dist/` is gitignored (`.gitignore:2`), so `dist/service/vox-pipe-bridge.exe` is absent from a
  clean checkout until `build:agent-distribution` runs; it is compiled at
  `scripts/build-agent-distribution.ts:56`.

## Environment quirks

- `tsx` is not on PATH. Use `.\packages\production\node_modules\.bin\tsx.CMD`. Going through
  `pnpm --filter … exec tsx` works but reports a non-zero exit as
  `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL … Command "tsx" not found`, which hides the real failure.
- PowerShell `1>` writes a UTF-8 BOM; read such files with `encoding="utf-8-sig"`.
- List open pipes with `[System.IO.Directory]::GetFiles("\\.\pipe\")`.
- Top-level `await` in a standalone script needs the `.mts` extension.
- `Win32_Process.CreationDate` fails `ToDateTime` under this locale; use
  `(Get-Process -Id <id>).StartTime` instead.
