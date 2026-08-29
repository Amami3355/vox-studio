---
name: vox-production-service
description: Stand the Vox production service up by hand, run a Run against a brief, and recover a dropped render. Use when starting the production service, running vox.exe production commands, bootstrapping a work root from a brief, seeding duration calibration, deciding whether the service is actually down, or when something prints "vox: IPC configuration is unavailable" or "Missing trusted service configuration".
---

# Running the Vox production service by hand

The service is nine environment variables, a named pipe addressed by two different variable
names, and a calibration store that fails quietly when unseeded. Every fact below is checked
against source by the scripts; where a number or a name appears, [REFERENCE.md](REFERENCE.md)
says which file it lives in.

Paths are from the workspace root. `tsx` is **not on PATH** — invoke it at
`.\packages\production\node_modules\.bin\tsx.CMD`.

## Is it already up?

```powershell
[System.IO.Directory]::GetFiles("\\.\pipe\") | Select-String vox
```

A pipe listed here is a running service. If a command still fails, the problem is step 3, not
the service.

## 1. Generate a token and a pipe path

```powershell
$env:VOX_PIPE_PATH = "\\.\pipe\vox-$([guid]::NewGuid().ToString('N').Substring(0,8))"
$bytes = New-Object byte[] 32
(New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
$env:VOX_IPC_TOKEN = [Convert]::ToBase64String($bytes)
```

`RNGCryptoServiceProvider` rather than `RandomNumberGenerator::GetBytes(int)`, which does not
exist on the Windows PowerShell 5.1 / .NET Framework here. 32 bytes base64 to 44 characters,
comfortably over the launcher's floor.

**Generate the token, never reuse a written-down one.** A token found in a file — including
`C:\vox-trusted\anc\ipc-token.txt` — is a throwaway from an old session and is not an example to
follow. It must be at least 32 UTF-8 bytes or the launcher rejects it with the step 3 message.

## 2. Export the other seven

`VOX_GRANT_KEY`, `ELEVENLABS_API_KEY`, `VOX_LEDGER_ROOT`, `VOX_RUN_HMAC_KEY`, `VOX_RUN_KEY_ID`,
`VOX_CALIBRATION_PATH`, and `VOX_REMOTION_ENTRY` (= `packages\video\src\remotion-entry.ts`).
A missing one throws `Missing trusted service configuration: <NAME>` at startup, which is honest.

## 3. The pipe is addressed by two different variable names

**The service host reads `VOX_PIPE_PATH`. The launcher reads `VOX_PIPE_NAME`.** The name is the
path minus the `\\.\pipe\` prefix, and nothing derives one from the other for you across two
shells.

```powershell
$env:VOX_PIPE_NAME = $env:VOX_PIPE_PATH -replace '^\\\\\.\\pipe\\', ''
```

**None of the launcher's three failure messages means the service is down.** All were probed
against a live, healthy service:

| What the launcher prints | Exit | What is actually wrong |
|---|---|---|
| `vox: IPC configuration is unavailable.` | 2 | `VOX_PIPE_NAME` **unset**, or `VOX_IPC_TOKEN` unset or under 32 UTF-8 bytes |
| `vox: IPC pipe name is invalid.` | 2 | Malformed name — you passed the full `\\.\pipe\…` path where the name belongs |
| `vox: Production service is unavailable.` | 1 | A wrong-but-well-formed name, **a wrong token**, or a genuinely stopped service |

The last row is the trap: it covers three unrelated causes, and a typo'd name reads exactly like
an outage. Take them in this order before restarting anything:

1. **List the pipes.** If the name you are using is not there, it is the name — or a real outage.
2. **If the pipe is there, suspect the token.** The service closes the connection on a bad MAC
   rather than answering, so a wrong token surfaces as this same message.

Full table with source lines and what each probe actually did: [REFERENCE.md](REFERENCE.md).

## 4. Check the environment before starting anything

```powershell
& ".\packages\production\node_modules\.bin\tsx.CMD" ".claude\skills\vox-production-service\scripts\check-environment.mts"
```

Reports every required variable (read out of the host source, not a list), the derived pipe name,
the token's byte length, and whether the pipe bridge is built. Exits non-zero with the reason.

## 5. Seed calibration, and match the request to it

One step, not two. An unseeded store leaves Preflight running against `{status:'missing'}`, and a
seeded store applies to **one voice key only** — a request naming a different voice, model or seed
is scored as a different key and the calibration silently does not apply to it.

```powershell
& ".\packages\production\node_modules\.bin\tsx.CMD" ".claude\skills\vox-production-service\scripts\seed-calibration.mts"
```

It seeds `$env:VOX_CALIBRATION_PATH` and prints the `production.voice` block the request must
carry. Copy that block into the brief. Pass `--force` to overwrite an active store.

## 6. Start the service

```powershell
pnpm --filter @vox/production service
```

Prints `Vox Production service ready.` on stderr and holds the shell. If the pipe bridge is
missing (`dist\` is gitignored, so a clean checkout has none), build it first with
`pnpm --filter @vox/production build:agent-distribution`.

## 7. Bootstrap a work root

In a second shell, with `VOX_PIPE_NAME` and `VOX_IPC_TOKEN` exported:

```powershell
pnpm --filter @vox/production bootstrap:workroot --request .\my-brief.json --out C:\vox-proof-workroots\crew
```

`--request` takes any brief and needs no code change and no scenario-table edit. It is mutually
exclusive with `--scenario`. The result is exactly two files: `request.json` and `vox.exe`.

## 8. Run — the last three verbs spend money

From **inside** the work root, in order:

```powershell
.\vox.exe production run init      --request request.json --out run-1
.\vox.exe production run validate  --run run-1 --plan plan.json
.\vox.exe production run preflight --run run-1
.\vox.exe production run record    --run run-1     # ← spends takes
.\vox.exe production run compile   --run run-1
.\vox.exe production run render    --run run-1
```

**Stop before `record` and confirm deliberately.** It synthesises against ElevenLabs and spends up
to `production.maxNewTakes` takes from the brief, billed to the real account and written to the
ledger under `VOX_LEDGER_ROOT`. `init` through `preflight` cost nothing; run them first and read
the Preflight report before going on.

Authoring `plan.json` is the crew's job, not this skill's — see `services/agents/README.md`.

## Recovering a dropped render

**A render that dropped costs nothing to redo, and the take is not lost.** Run state on disk is
intact: no re-author, no second take, no new spend.

From inside the work root, with `VOX_PIPE_NAME` and `VOX_IPC_TOKEN` set:

```powershell
.\vox.exe production run render --run run-1
```

That is the whole recovery. The common mistake is seeing a failed render, assuming the paid take
is gone, and starting over from `record` — which spends a second take for nothing. Check
`.\vox.exe production run status --run run-1` first if unsure how far the Run got.

## Reading the output

Every command writes one JSON envelope to stdout. Under PowerShell, `1>` redirection writes a
UTF-8 BOM, so anything reading the file back must use `encoding="utf-8-sig"` or `json.loads`
raises on line 1.
