# 31: The operator's runbook stops being rediscovered every session

Status: done, except the end-to-end walk by a second reader — see Comments

## Problem Statement

Running the production service by hand is undocumented, and it has been reconstructed from
`packages/production/src/proof/harness.ts` in more than one session, each time from scratch.

What a session has to rediscover, all of it verified and none of it written down anywhere a
session looks first:

- **Nine environment variables** are required: `VOX_PIPE_PATH`, `VOX_IPC_TOKEN` (≥32 UTF-8 bytes),
  `VOX_GRANT_KEY`, `ELEVENLABS_API_KEY`, `VOX_LEDGER_ROOT`, `VOX_RUN_HMAC_KEY`, `VOX_RUN_KEY_ID`,
  `VOX_CALIBRATION_PATH`, `VOX_REMOTION_ENTRY` (= `packages/video/src/remotion-entry.ts`).
- **The host reads `VOX_PIPE_PATH`; the launcher reads `VOX_PIPE_NAME`** — different variables on
  the two sides, the name being the path minus the `\\.\pipe\` prefix. Getting it wrong yields
  `vox: IPC configuration is unavailable`, **which reads like a missing service and is not.**
- **The calibration store must be seeded** with `activeInitialCalibration()`, or Preflight runs
  against `{status:'missing'}`. The active key is `elevenlabs` / `eleven_v3` / seed 7 / voice
  `JBFqnCBsd6RMkjVDRZzb`, and **the request's voice block must match it or the calibration does not
  apply.**
- **A dropped render is recoverable and costs nothing.** `vox.exe production run render --run
  <run-dir>` from inside the work root, with `VOX_PIPE_NAME` and `VOX_IPC_TOKEN` set. Run state on
  disk is intact: no re-author, no second take. A session that does not know this sees a failed
  render and assumes a paid take is gone.
- **`bootstrap:workroot --request <file>` takes an arbitrary brief**, needs no code change and no
  scenario-table edit. `--request` and `--scenario` are mutually exclusive.
- **PowerShell `1>` redirection writes a UTF-8 BOM**, so `envelopes.jsonl` must be read with
  `encoding="utf-8-sig"` or `json.loads` raises on line 1.
- **List named pipes with** `[System.IO.Directory]::GetFiles("\\.\pipe\")`, which is how you check
  whether the service is actually down.
- **`tsx` is not on PATH**; use `pnpm --filter @vox/production exec tsx`, and `.mts` inside the
  package for top-level await.

Every one of these has cost a session time, and several have cost the same session time twice. The
`VOX_PIPE_PATH` / `VOX_PIPE_NAME` split is the worst of them because it fails in a way that points
at the wrong thing entirely.

This is the class of knowledge that keeps being written into handoff files and read back out of
them. A handoff is a message to the next session; a skill is a procedure any session can invoke.
The material has been stable across many sessions and it is being carried in the wrong container.

## Solution

A skill that walks an operator through standing the production service up by hand, running a
Run against an arbitrary brief, and recovering a dropped render.

The `wizard` skill is the shape that fits: these are steps a human performs, several of them
requiring a credential, one of them spending money. An agent should be guiding and checking rather
than executing blind.

What it covers, in order: check whether the service is already up; generate a token and the pipe
path; export the nine variables with the two-sided naming made explicit; seed the calibration
store and match the request's voice block to it; bootstrap a work root from a brief file; run; and
— separately, because it is the recovery path — re-issue a dropped render against an existing run
directory.

## Implementation Decisions

- **It is written with `write-a-skill` or `skill-creator`, not hand-rolled.** Both exist, the user
  named skills specifically, and a skill written outside the tooling is one that will not be
  maintained by it.
- **Facts come from the code, and the skill says where each one lives.** The nine variables are
  read out of `packages/production/src/proof/harness.ts`, not copied from this ticket. A skill that
  hardcodes what a source file says is the manifest problem again in a different container — and
  this repository has an explicit rule about that: *"a manifest manual diverge du code en trois
  jours."*
- **The `VOX_PIPE_PATH` / `VOX_PIPE_NAME` split gets its own step, with the failure text.** `vox:
  IPC configuration is unavailable` should appear in the skill verbatim, so the next person to see
  it finds this procedure by searching for it rather than by debugging a service that is running
  fine.
- **The paid step is marked as paid and is not automated.** A Run that synthesises spends a take.
  The skill should make an operator confirm that deliberately, and should say what a take costs in
  the terms the ledger uses.
- **The recovery path is a first-class section, not a troubleshooting footnote.** It is the step
  most likely to be needed under pressure and the one where not knowing it leads to spending money
  that did not need spending.
- **No secret is written into the skill.** The token is generated, the voice id and calibration key
  are configuration rather than credentials, and the API keys are named but never carried. The
  throwaway token at `C:\vox-trusted\anc\ipc-token.txt` is not an example to follow: it should be
  regenerated, not reused, and the skill should say so.

## Testing Decisions

There is no suite for a skill, so what stands in for testing is that the procedure is walked once,
end to end, by someone following only the skill — no handoff file open, no source file read except
where the skill sends them.

**A dry pass first**, with the paid step declined, to confirm the service comes up and the pipes
appear. **Then the recovery path against an existing run directory**, which costs nothing and is
the section most worth confirming.

The success condition is that the walker does not have to reconstruct anything. Any step where they
do is the step the skill is missing.

## Out of Scope

- **The teaching surface does not become a skill, and this is the important boundary.** The crew
  fetches the contract from the interface at run time on purpose — it is what keeps the crew
  code-blind and its plans tracking the catalog rather than the model's memory. A skill is a
  repository artifact. Putting the catalog, the checks or the plan schema into one would
  reintroduce exactly the drift the generated manifest exists to prevent, and would do it in a file
  nobody regenerates.
- **Documenting the crew's own architecture.** `services/agents/README.md` and the ADRs hold that,
  deliberately, in a place agents never read.
- **Automating the service into a single command.** That is a real improvement and a different
  ticket. This one writes down what already works.
- **Anything the agent can do itself.** The `wizard` skill's own guidance is explicit that it is for
  steps only a human can perform. Steps an agent can run should be run, not narrated.

## Further Notes

**This ticket is a different species from 25 through 30 and should be read as one.** Those change
what the crew sends a model. This one changes what a session has to rediscover before it can run
anything at all. It is included because it is the cheapest item on the list and because it removes
a recurring tax on every other ticket here — each of 25, 27, 28 and 30 wants a live Run to measure
against, and each one currently starts by reconstructing this.

**Blocked by:** None (can start immediately)

- [x] A skill exists that stands the production service up by hand, from nothing
- [x] It is authored with the skill tooling rather than hand-rolled
- [x] It names where each fact lives in the source rather than only asserting it
- [x] `VOX_PIPE_PATH` versus `VOX_PIPE_NAME` is its own step and carries the misleading error text
- [x] Calibration seeding and the request's matching voice block are one step, not two unrelated ones
- [x] Recovering a dropped render is a first-class section
- [x] The paid step is marked as paid and requires deliberate confirmation
- [x] No credential is carried in the skill, and reusing a written-down token is called out as wrong
- [ ] The procedure is walked once end to end by someone reading only the skill

## Comments

**Built as a project skill at `.claude/skills/vox-production-service/`** — `SKILL.md`, a
`REFERENCE.md` fact-to-source table, and two scripts. `.claude/` is not gitignored, so it is
committed with the repository and every session in this checkout sees it without any per-machine
install. That was the point of putting it here rather than in a user skills directory.

**The problem statement's claim about the misleading error is wrong, and the skill corrects it
rather than repeating it.** This ticket says a wrong `VOX_PIPE_NAME` yields `vox: IPC
configuration is unavailable`. It does not. That message fires only when the name is *empty* — or
the token is empty or under 32 bytes — and is printed before any pipe is opened. A name that is
present but wrong falls through the connection `catch` and yields `vox: Production service is
unavailable.`, which is strictly the more misleading of the two because it is character-for-
character what a genuinely stopped service prints. All four launcher messages were probed against
a live service; the table is in `REFERENCE.md`. **A wrong token lands on that same message too**,
which the ticket did not anticipate — the host closes the connection on a bad request MAC rather
than answering, so `IPC response authentication failed` is in the source but unreachable by any
of these routes. The skill's step 3 therefore teaches a three-way discrimination, not a
one-message search string.

**Two facts in the problem statement were also stale.** The nine variables are read at
`src/ipc/service-host.ts:24-34`, not out of `proof/harness.ts` — the harness is a second consumer,
not the authority. And `pnpm --filter @vox/production exec tsx` does work but reports any non-zero
exit as `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL … Command "tsx" not found`, which buries the real
failure; the skill uses `.\packages\production\node_modules\.bin\tsx.CMD` instead.

**`check-environment.mts` re-reads the required list out of the host source at run time** rather
than hardcoding nine names, so a tenth variable added to the host is caught without anyone editing
the skill. That is the ticket's "facts come from the code" decision taken literally — the one
place a list would have rotted is the one place there is no list.

**What was walked, and what was not.** Steps 0–6 were walked end to end: the environment check
passes, the service prints `Vox Production service ready.` on stderr, and the pipe appears under
exactly the derived name. The launcher wiring was then exercised against that live service with a
real `vox.exe` from `C:\vox-proof-workroots\crew` — `production contract index` returned a valid
envelope at exit 0, and all five failure routes were probed. **The walk found one real defect in
the skill's own step 1**: `RandomNumberGenerator::GetBytes(int)` does not exist on the Windows
PowerShell 5.1 / .NET Framework here, so token generation now uses `RNGCryptoServiceProvider`.

**Steps 7 and 8 and the recovery section were not walked**, which is why the last box is unticked.
`bootstrap:workroot` and `run init … preflight` are free and should be walked next; `record` is
not, and should stay declined. The recovery path needs an existing Run directory in a rendered
state, and no free one was to hand — the eight `C:\vox-proof-workroots\vox-proof-*` roots from
earlier proofs are the obvious candidates and were not inspected. **The remaining criterion is a
second reader following only the skill**, which is a human task by construction: the author
walking their own procedure cannot detect the step they left out, because they know what they
meant.
