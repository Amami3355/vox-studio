# Where each fact lives

Nothing here is asserted on its own authority. If a line below disagrees with the file it names,
the file is right and this table is stale — fix the table.

## The nine variables

All nine are `required(...)` calls in `packages/production/src/ipc/service-host.ts:24-34`, which
throws `Missing trusted service configuration: <NAME>` for any that is unset
(`service-host.ts:12-16`).

| Variable | Read at | Notes |
|---|---|---|
| `VOX_PIPE_PATH` | `service-host.ts:24` | Host side only. Must start with `\\.\pipe\` |
| `VOX_IPC_TOKEN` | `service-host.ts:27` | Also read by the launcher; ≥ 32 UTF-8 bytes |
| `VOX_GRANT_KEY` | `service-host.ts:28` | HMAC key for replacement grants (`:39-46`) |
| `ELEVENLABS_API_KEY` | `service-host.ts:29` | Passed to `createElevenLabsAdapter` |
| `VOX_LEDGER_ROOT` | `service-host.ts:30` | Resolved to absolute |
| `VOX_RUN_HMAC_KEY` | `service-host.ts:31` | Run checkpoint signing |
| `VOX_RUN_KEY_ID` | `service-host.ts:32` | Key id recorded alongside the signature |
| `VOX_CALIBRATION_PATH` | `service-host.ts:33` | Backs `DurationCalibrationStore` |
| `VOX_REMOTION_ENTRY` | `service-host.ts:34` | `packages/video/src/remotion-entry.ts` |

`check-environment.mts` re-reads this list out of the host source at run time rather than
hardcoding it, so a tenth variable is caught without editing this file.

Optional, not required to start: `VOX_PIPE_BRIDGE_HELPER` (`service-host.ts:72`) overrides the
bridge executable, which otherwise defaults to `dist/service/vox-pipe-bridge.exe`.

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
| `vox: Production service is unavailable.` | 1 | Catch-all around the pipe connection | `Program.cs:81-84` | yes — wrong name, **and** wrong token |
| `vox: IPC response authentication failed.` | 1 | Response MAC mismatch | `Program.cs:69-70` | no — not reachable by any of the routes above |

The last row is in the source but did not fire in any probe. A **wrong token** does not reach it:
the host closes the connection on a bad request MAC rather than answering, so the launcher's
`catch` fires and it reports `Production service is unavailable.` instead. That message would
require a host that answers with a bad MAC.

**Ticket 31's problem statement is imprecise on this point and this table supersedes it.** It said
a wrong pipe name yields `IPC configuration is unavailable`. It does not: that message fires only
when the name is *empty*. A name that is present but wrong falls through to the connection
`catch` and yields `Production service is unavailable.` — which is the more misleading of the two,
because it is exactly what a genuinely stopped service prints. The first message is emitted before
any pipe is opened and is therefore never evidence about the service; `Production service is
unavailable.` is ambiguous three ways — wrong name, wrong token, or real outage — and listing the
open pipes separates the first from the other two.

## Calibration

- Seeder: `activeInitialCalibration()`, `packages/production/src/preflight/calibration.ts:65-69`.
- Values: `INITIAL_DURATION_CALIBRATION`,
  `packages/production/src/preflight/preflight.ts:16-36` — provider `elevenlabs`, voice
  `JBFqnCBsd6RMkjVDRZzb`, model `eleven_v3`, seed `7`, language `en`.
- Unseeded, the store loads `{ status: 'missing' }` (`calibration.ts:79` treats it as
  `CALIBRATION_MISSING`), and the service falls back to `activeInitialCalibration()` only when no
  store is configured at all — `commands/service.ts:1311`.
- A request whose key differs is scored `different_key` and the calibration does not apply:
  `sameKey` / `auditVerifiedTake`, `calibration.ts:71-82`.
- The request's voice block is `production.voice` in `productionRequestSchema`,
  `packages/production/src/contracts/schemas.ts:55-62` — `provider`, `voiceId`, `modelId`, `seed`,
  strict.

## Work roots

- `bootstrap:workroot` → `packages/production/scripts/bootstrap-workroot.ts`, wired at
  `packages/production/package.json:18`.
- Usage string: `bootstrap-workroot.ts:32`. Default `--out` is `C:\vox-proof-workroots\crew`
  (`:34`).
- `--request` and `--scenario` are mutually exclusive — `bootstrap-workroot.ts:41-43`.
- The request is parsed before anything is built (`:49-53`), so a bad brief fails the bootstrap
  rather than the Run.
- A work root is exactly two files: `WORK_ROOT_FILES = ['request.json', 'vox.exe']`,
  `packages/production/src/proof/workroot.ts:17`.
- Bootstrap builds and verifies the launcher itself (`buildAgentDistribution`, `:65`) and grants
  traversal with `icacls` (`:78-85`).

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

## Service start

- `pnpm --filter @vox/production service` → `tsx src/ipc/service-host.ts`,
  `packages/production/package.json:14`.
- Readiness line, on **stderr**: `Vox Production service ready.` — `service-host.ts:77`.
- `SIGINT`/`SIGTERM` close the bridge and host — `service-host.ts:79-85`.
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
