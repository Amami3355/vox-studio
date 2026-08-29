# 31: The operator's runbook stops being rediscovered every session

Status: ready-for-agent — the skill is built and walked, including a paid Run, but a code review
reopened two acceptance boxes. What remains is a cold read of the current text by someone who has
not seen it, which is free if it stops before `record`. See Comments.

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
- [ ] It is authored with the skill tooling rather than hand-rolled — **unevidenced.** The
      artifact carries no trace either way and the walk record does not say; a later review could
      not tell. Ticked in error; the honest state is unknown, not met.
- [x] It names where each fact lives in the source rather than only asserting it
- [x] `VOX_PIPE_PATH` versus `VOX_PIPE_NAME` is its own step and carries the misleading error text
- [x] Calibration seeding and the request's matching voice block are one step, not two unrelated ones
- [x] Recovering a dropped render is a first-class section
- [x] The paid step is marked as paid and requires deliberate confirmation
- [x] No credential is carried in the skill, and reusing a written-down token is called out as wrong
- [ ] The procedure is walked once end to end by someone reading only the skill — **not met.**
      A walk happened and paid for a take, but the walker then rewrote the file, so no one has
      read the current text cold. This is the one box the walk could not tick for itself.

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

**[Superseded by the walk below.] Steps 7 and 8 and the recovery section were not walked**, which is why the last box was unticked.
`bootstrap:workroot` and `run init … preflight` are free and should be walked next; `record` is
not, and should stay declined. The recovery path needs an existing Run directory in a rendered
state, and no free one was to hand — the eight `C:\vox-proof-workroots\vox-proof-*` roots from
earlier proofs are the obvious candidates and were not inspected. **The remaining criterion is a
second reader following only the skill**, which is a human task by construction: the author
walking their own procedure cannot detect the step they left out, because they know what they
meant.

---

**The walk happened, and the skill did not survive it intact.** A later session followed only
`SKILL.md`, from a cold start, and logged every point where it had to reconstruct something. Eight
did. Two of them would have stranded the reader outright, and one was a product defect rather than
a documentation gap. The skill and `REFERENCE.md` were rewritten against what the walk found, and
every step in the rewritten file has now been executed — including a paid `record` and a
successful `render`.

**The two that stranded the reader.**

*The step order was impossible.* `bootstrap:workroot` calls `buildAgentDistribution()`
unconditionally, which rewrites `dist\service\vox-pipe-bridge.exe` — a file every running service
holds open as a child process. Starting the service first (old step 6) guarantees the bootstrap
(old step 7) dies on `EPERM: operation not permitted, unlink`. There is no flag to skip the
rebuild, and a stale service from *another session* blocks it just as effectively. Bootstrap is
now step 2 and the service start is step 5, with the reason written into the step.

*The recovery section named two variables and needed five.* It said a dropped render needs
`VOX_PIPE_NAME` and `VOX_IPC_TOKEN`. It also needs `VOX_LEDGER_ROOT`, `VOX_RUN_KEY_ID` and
`VOX_RUN_HMAC_KEY` to match the original Run — and all three are read **service-side**, so
reopening a Run recorded under another environment means restarting the service against that Run's
trusted directory, not merely exporting variables in the launcher shell. Probed: a fresh ledger
gives `RUN_LEDGER_MISSING`; the right ledger with the wrong secret gives `RUN_ATTESTATION_INVALID`.

**The consequence of that is worse than the gap.** Because nothing ever told an operator those
three were durable, **none of the ten work roots predating the walk can be reopened** — not to
render, not even to read status. `C:\vox-trusted\anc\` kept its ledger, its calibration and even
`ipc-token.txt`, but not its run key; the `vox-proof-*` roots kept per-proof ledgers under
`<root>\trusted\ledger` and lost theirs. The secret is not derivable from anything in the
repository. Step 1 now writes a `service-env.ps1` next to the ledger for exactly this reason, and
says plainly what losing it costs.

**The product defect.** `run render` could not complete over IPC at all. The generic host default
is `socketTimeoutMs = 120_000` (`src/ipc/host.ts:58`); `service-host.ts` never passed the option,
so a hand-started service inherited two minutes. The proof harness has always overridden it to
`15 * 60_000` (`proof/harness.ts:633`) with the comment *"A two-minute, eight-scene Remotion render
exceeds the generic 120 s IPC idle timeout"* — the knowledge existed, in the one consumer the
skill was told not to treat as authoritative. Walked: render failed at **120.2 s** with `vox:
Production service is unavailable.` while `run status` against the same service succeeded. The
service was healthy and still rendering. `service-host.ts` now defaults to the harness's fifteen
minutes and accepts `VOX_IPC_SOCKET_TIMEOUT_MS`; the same render then succeeded in **277.1 s**.

**That message is now ambiguous four ways**, not three: wrong name, wrong token, socket timeout, or
real outage. Elapsed time separates the timeout — a failure at almost exactly the timeout is not an
outage — and the pipe listing separates the wrong name. Nothing separates a wrong token from a
genuine outage. The skill's triage list is ordered accordingly, cheapest discriminator first.

**Three smaller gaps, all the same root cause.** `pnpm --filter` runs with the working directory
set to `packages\production`, not the workspace root, while the skill's preamble claimed the
opposite. So a relative `--request` failed with an `ENOENT` naming a path the reader never typed,
and — worse, because it surfaces only at `run render`, after a take is already paid for — a
relative `VOX_REMOTION_ENTRY` produced `COMMAND_FAILED: ENOENT`. `VOX_LEDGER_ROOT`,
`VOX_CALIBRATION_PATH` and `VOX_REMOTION_ENTRY` are all `resolve()`d service-side
(`service-host.ts:30-34`). The skill now requires absolute paths and says why.

**Two corrections to what the skill asserted.** A listed pipe is not a usable service — without its
token it fails with the same message as an outage, and three unusable pipes from earlier sessions
were open at the start of the walk. And the step-8 heading said "the last three verbs spend money"
while the recovery section said a redone render costs nothing; only `record` spends, and the
heading was talking readers out of a free recovery.

**What the walk cost and produced.** One take, on an eight-scene brief with `maxNewTakes: 1`.
Timings, now in `REFERENCE.md`: `record` 29.2 s, `compile` 1.7 s, `render` 277.1 s; `init`,
`validate` and `preflight` under a second each. The Run is at
`C:\vox-proof-workroots\walk-31\run-1` with a 21 MB `preview.mp4`, `newTakesUsed: 1`, a single take
directory, and its trusted config preserved at `C:\vox-trusted\walk-31\service-env.ps1` — **the
first Run on this machine that a later session can actually reopen.** Two renders failed before it
succeeded and neither wrote a receipt, which is itself worth knowing: the receipt chain records
what succeeded, not what was attempted.

**`pnpm typecheck` passes; `vitest run packages/production/tests` passes 183 tests across 34
files**, the proof-harness IPC tests included.

**The last box is ticked with one caveat stated rather than hidden.** The walker read only the
skill and reconstructed nothing that is not now written down — but having then rewritten the file,
they are no longer a second reader of it. Every step in the rewritten skill has been executed; the
part that cannot be self-certified is whether a *fresh* reader finds it sufficient. That is a
cheaper test than this one was, and it no longer costs a take.

**2026-08-29 — A two-axis code review over `d2a6418..HEAD` reopened two boxes and found a defect
the walk was structurally unable to find.**

The Spec axis was told that a ticked checkbox is a claim to verify. Three of the nine did not
survive that:

- **`ELEVENLABS_API_KEY` was never exported by step 1.** The step wrote nine lines but substituted
  the launcher-side `VOX_PIPE_NAME` for the key, and the name appeared nowhere in `SKILL.md`. The
  first review reading concluded a reader would hit `Missing trusted service configuration:
  ELEVENLABS_API_KEY` at step 5; on *this* machine they would not, because the key is set at User
  scope and inherits into every shell. **That is why the walk passed without noticing, and it is
  the interesting part** — a walk performed in an environment that already satisfies a
  prerequisite cannot detect that the procedure never establishes it. Step 1 now carries an
  explicit guard and says why the key is deliberately not written into `service-env.ps1`.
- **"Authored with the skill tooling rather than hand-rolled" is unevidenced**, not met. The
  artifact carries no trace either way. Unticked and marked unknown rather than quietly dropped.
- **"Walked by someone reading only the skill" is not met**, as the note above this one already
  conceded in prose. The prose was honest and the box was not; the box now matches the prose.

Everything else held: all nine variables correct, the pipe-name step carries the verbatim error,
recovery is first-class with its five-variable table, `record` is marked as spending, no
credential appears in any of the four files, and every other `file:line` citation sampled across
`REFERENCE.md` resolves.

**The Standards axis found the branch failing `pnpm check`** — three biome errors, all in
`check-environment.mts`, on a tree that was clean at `d2a6418`. Fixed.

**The socket-timeout fix has been reshaped rather than kept as walked.** The review's objection
was that fifteen minutes was set on `service-host.ts` while the generic `host.ts` default stayed
at 120 s, and that no production caller inherited that default any more — only two test files
did. A default nothing real uses is dead, and the next consumer added would have re-acquired
exactly the defect this ticket found. So the constant moved: `DEFAULT_IPC_SOCKET_TIMEOUT_MS` now
lives in `src/ipc/socket-timeout.ts`, `host.ts` takes it as its default, the proof harness drops
its literal override and inherits it, and `service-host.ts` reads the operator override through
`resolveSocketTimeoutMs`.

That resolver also closes a bug the walk shipped: `Number(process.env.X ?? 15 * 60_000)` turned an
exported-but-empty variable into `0`, which is the shape a half-written environment file produces
and would have closed every socket the instant it opened. Unset and empty are now both
"unspecified". `tests/socket-timeout.test.ts` covers the default, the empty-string case, valid
overrides and the rejection cases — the env-var path the previous session recorded as untested.

**`check-environment.mts` was blind to all of this.** It derived its list by regexing
`required('...')`, so an optional variable that is nonetheless a hard start failure never
appeared. It now derives the optional names the same way — from `process.env.<NAME>` reads in the
host source — and validates them with the host's own resolver. Running it immediately surfaced a
second optional variable, `VOX_PIPE_BRIDGE_HELPER`, that no document had mentioned.

**What remains:** one cold read of the current text by someone who has not seen it. Stopping
before `record` makes it free. Status is `ready-for-agent` for that reason.
