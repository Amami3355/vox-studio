---
name: vox-production-service
description: Stand the Vox production service up by hand, run a Run against a brief, and recover a dropped render. Use when starting the production service, running vox.exe production commands, bootstrapping a work root from a brief, seeding duration calibration, deciding whether the service is actually down, or when something prints "vox: IPC configuration is unavailable", "Missing trusted service configuration", "vox: Production service is unavailable.", RUN_LEDGER_MISSING or RUN_ATTESTATION_INVALID.
---

# Running the Vox production service by hand

The service is nine environment variables, a named pipe addressed by two different variable
names, a calibration store that fails quietly when unseeded, and three secrets that decide
whether a Run can ever be reopened. Every fact below is checked against source by the scripts;
where a number or a name appears, [REFERENCE.md](REFERENCE.md) says which file it lives in.

Every step in this file has been run end to end, including a paid `record` and a 277-second
`render`. Where a step failed the first time, the reason is written into the step.

Paths are from the workspace root. `tsx` is **not on PATH** — invoke it at
`.\packages\production\node_modules\.bin\tsx.CMD`.

## Two rules that cause most of the lost time

1. **Bootstrap the work root before you start the service.** Bootstrap rebuilds the pipe bridge,
   and a running service holds that file open. Step 2 before step 5.
2. **Every path you export must be absolute.** `pnpm --filter` runs with the working directory set
   to `packages\production`, not the workspace root, so a relative path is resolved against the
   wrong directory by both the scripts and the service.

## Is it already up?

```powershell
[System.IO.Directory]::GetFiles("\\.\pipe\") | Select-String vox
```

A pipe listed here is a running service — but **it is only usable if you hold its token**. A
service someone else started, or one from an earlier session whose token you no longer have, is
indistinguishable from an outage: both print `vox: Production service is unavailable.` Unless you
have the matching `VOX_IPC_TOKEN`, treat a listed pipe as someone else's and start your own.

## 1. Choose a trusted directory and write the environment into it

The ledger, the calibration store and — critically — the Run signing key all have to outlive the
shell. Keep them together, and keep the environment that names them in a file rather than in
shell history.

```powershell
$trusted = "C:\vox-trusted\<name>"
New-Item -ItemType Directory -Force -Path "$trusted\ledger" | Out-Null

function New-Secret {
  $b = New-Object byte[] 32
  (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b)
  [Convert]::ToBase64String($b)
}
$pipePath = "\\.\pipe\vox-$([guid]::NewGuid().ToString('N').Substring(0,8))"
$lines = @(
  "`$env:VOX_PIPE_PATH = '$pipePath'",
  "`$env:VOX_PIPE_NAME = '$($pipePath -replace '^\\\\\.\\pipe\\', '')'",
  "`$env:VOX_IPC_TOKEN = '$(New-Secret)'",
  "`$env:VOX_GRANT_KEY = '$(New-Secret)'",
  "`$env:VOX_RUN_HMAC_KEY = '$(New-Secret)'",
  "`$env:VOX_RUN_KEY_ID = '<name>-key-v1'",
  "`$env:VOX_LEDGER_ROOT = '$trusted\ledger'",
  "`$env:VOX_CALIBRATION_PATH = '$trusted\duration.json'",
  "`$env:VOX_REMOTION_ENTRY = '<absolute path to>\packages\video\src\remotion-entry.ts'"
)
Set-Content -Path "$trusted\service-env.ps1" -Value $lines -Encoding utf8
. "$trusted\service-env.ps1"
```

`RNGCryptoServiceProvider` rather than `RandomNumberGenerator::GetBytes(int)`, which does not
exist on the Windows PowerShell 5.1 / .NET Framework here. 32 bytes base64 to 44 characters,
comfortably over the launcher's 32-byte floor.

**Generate the secrets, never reuse a written-down one.** A token found in a file — including
`C:\vox-trusted\anc\ipc-token.txt` — is a throwaway from an old session.

**`VOX_RUN_HMAC_KEY`, `VOX_RUN_KEY_ID` and `VOX_LEDGER_ROOT` are not throwaways.** They sign and
locate the Run's checkpoints. Lose any of the three and the Run can never be reopened — not to
render it, not even to read its status. This is why they go in a file next to the ledger. Every
work root on this machine that predates this rule is unrecoverable for exactly this reason.

`VOX_REMOTION_ENTRY`, `VOX_LEDGER_ROOT` and `VOX_CALIBRATION_PATH` must be **absolute**. The
service resolves them against its own working directory, which is `packages\production`; a
relative entry point surfaces much later as `COMMAND_FAILED: ENOENT` from `run render`, after a
take has already been paid for.

## 2. Bootstrap the work root — before any service is running

```powershell
pnpm --filter @vox/production bootstrap:workroot --request "C:\absolute\path\to\brief.json" --out C:\vox-proof-workroots\<name>
```

`--request` takes any brief, needs no code change and no scenario-table edit, and is mutually
exclusive with `--scenario`. `--force` overwrites an existing root. The result is exactly two
files: `request.json` and `vox.exe`.

**`--request` must be absolute** — a relative path resolves against `packages\production` and
fails with `ENOENT`, naming a path you never typed.

**This step rebuilds and re-verifies the launcher distribution**, which deletes
`dist\service\vox-pipe-bridge.exe`. Every running service holds that file open, so with one up
the bootstrap dies on:

```
[Error: EPERM: operation not permitted, unlink '...\dist\service\vox-pipe-bridge.exe']
```

There is no flag to skip the rebuild. Any service on the machine blocks this, including one from
another session. Stop them all first:

```powershell
Get-Process -Name 'vox-pipe-bridge' -ErrorAction SilentlyContinue | Stop-Process -Force
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'service-host' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

Before stopping anything you did not start, check it is idle — `(Get-Process vox-pipe-bridge).CPU`
of a couple of tenths of a second means nothing is in flight. Killing a service mid-`record`
wastes a paid take.

## 3. Check the environment

```powershell
& ".\packages\production\node_modules\.bin\tsx.CMD" ".claude\skills\vox-production-service\scripts\check-environment.mts"
```

Reports every required variable (read out of the host source, not a list), the derived pipe name,
the token's byte length, and whether the pipe bridge is built. Exits non-zero with the reason.

## 4. Seed calibration, and match the request to it

One step, not two. An unseeded store leaves Preflight running against `{status:'missing'}`, and a
seeded store applies to **one voice key only** — a request naming a different voice, model or seed
is scored as a different key and the calibration silently does not apply to it.

```powershell
& ".\packages\production\node_modules\.bin\tsx.CMD" ".claude\skills\vox-production-service\scripts\seed-calibration.mts"
```

It seeds `$env:VOX_CALIBRATION_PATH` and prints the `production.voice` block the request must
carry. Copy that block into the brief. Pass `--force` to overwrite an active store.

A Preflight report reading `"duration":{"status":"available"}` proves the seeding took. `"missing"`
means the request's voice block and the store disagree.

## 5. Start the service

```powershell
. "$trusted\service-env.ps1"
pnpm --filter @vox/production service
```

Prints `Vox Production service ready.` on stderr and holds the shell. If the pipe bridge is
missing (`dist\` is gitignored, so a clean checkout has none), build it first with
`pnpm --filter @vox/production build:agent-distribution`.

The host keeps an authenticated request open for 15 minutes, because a render takes minutes and
the generic IPC idle timeout is two. Override with `VOX_IPC_SOCKET_TIMEOUT_MS` if a render is
slower than that; a value that is too low cuts the render off and reports it as an outage.

## The launcher's failure messages, and what they actually mean

All were probed against a live, healthy service.

| What the launcher prints | Exit | What is actually wrong |
|---|---|---|
| `vox: IPC configuration is unavailable.` | 2 | `VOX_PIPE_NAME` **unset**, or `VOX_IPC_TOKEN` unset or under 32 UTF-8 bytes |
| `vox: IPC pipe name is invalid.` | 2 | Malformed name — you passed the full `\\.\pipe\…` path where the name belongs |
| `vox: Production service is unavailable.` | 1 | A wrong-but-well-formed name, **a wrong token**, **a command that outran the socket timeout**, or a genuinely stopped service |

The last row is the trap: four unrelated causes, and a typo'd name reads exactly like an outage.
Take them in this order:

1. **How long did it take to fail?** A failure at almost exactly the socket timeout — 120 s on an
   unconfigured host, 15 min by default here — is a timeout, not an outage. The service is fine
   and is very likely still rendering. Raise `VOX_IPC_SOCKET_TIMEOUT_MS` and re-issue.
2. **List the pipes.** If the name you are using is not there, it is the name — or a real outage.
3. **If the pipe is there, suspect the token.** The service closes the connection on a bad MAC
   rather than answering, so a wrong token surfaces as this same message.

Full table with source lines and what each probe actually did: [REFERENCE.md](REFERENCE.md).

## 6. Run — only `record` spends money

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
ledger under `VOX_LEDGER_ROOT`. Everything else — `init`, `validate`, `preflight`, `compile`,
`render`, and any re-issue of a verb already done — costs nothing, because it consumes the take
`record` already paid for.

Measured on an eight-scene, one-take brief: `record` 29 s, `compile` 2 s, `render` 277 s.

`validate` needs a `plan.json`, and authoring one is the crew's job, not this skill's — see
`services/agents/README.md`. To exercise the path without a crew, reuse the plan from a Run built
on the same brief; a plan is matched to its brief, so one from a different brief will fail
validation. The work root is nominally two files, but an extra `plan.json` beside them is
tolerated.

A verb that fails writes **no receipt** and does not advance the stage, so the receipt chain is a
record of what succeeded, not of what was attempted.

## Recovering a dropped render

**A render that dropped costs nothing to redo, and the take is not lost.** Run state on disk is
intact: no re-author, no second take, no new spend. Re-issuing `render` after a failure completed
in 277 s and left `newTakesUsed` at 1.

The recovery needs **five** things, not two, and three of them are read by the *service* rather
than the launcher — so a Run recorded under a different environment needs the **service restarted
against that Run's trusted directory**, not merely a launcher shell with the right variables:

| Needs to match the original Run | Read by | If it does not match |
|---|---|---|
| `VOX_LEDGER_ROOT` | service | `RUN_LEDGER_MISSING` — "Private Run ledger is missing." |
| `VOX_RUN_KEY_ID` | service | `RUN_ATTESTATION_INVALID` |
| `VOX_RUN_HMAC_KEY` | service | `RUN_ATTESTATION_INVALID` — "run-receipt attestation does not verify." |
| `VOX_PIPE_NAME` | launcher | `vox: IPC configuration is unavailable.` / `unavailable` |
| `VOX_IPC_TOKEN` | launcher | `vox: Production service is unavailable.` |

This is what step 1's `service-env.ps1` is for. With it:

```powershell
. "C:\vox-trusted\<name>\service-env.ps1"
pnpm --filter @vox/production service     # in its own shell
```

then, from inside the work root:

```powershell
. "C:\vox-trusted\<name>\service-env.ps1"
.\vox.exe production run status --run run-1     # confirms the ledger and the key both verify
.\vox.exe production run render --run run-1
```

`status` is the cheap probe: if it returns a stage, the ledger and the signing key are both right
and the render will be readmitted. The common mistake is seeing a failed render, assuming the paid
take is gone, and starting over from `record` — which spends a second take for nothing.

## Reading the output

Every command writes one JSON envelope to stdout. Under PowerShell, `1>` redirection writes a
UTF-8 BOM, so anything reading the file back must use `encoding="utf-8-sig"` or `json.loads`
raises on line 1.
